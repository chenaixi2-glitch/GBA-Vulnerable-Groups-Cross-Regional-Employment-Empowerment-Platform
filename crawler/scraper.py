"""
广东省残疾人就业服务网岗位爬虫。

公开 API（无需登录）：
  POST /api/jyComplayJob/listCompanyHot   - 热门岗位
  POST /api/jyComplayJob/listComplayByJob - 招聘单位列表
  POST /api/jyComplayJob/list             - 按单位获取岗位（需 complayId）
"""
import hashlib
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
import urllib3

from config import CRAWL_CONCURRENCY, CRAWL_REQUEST_TIMEOUT, JYFW_BASE_URL
from db import mark_missing_external_jobs, upsert_external_job

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Origin": JYFW_BASE_URL,
    "Referer": JYFW_BASE_URL + "/",
}


class JyfwScraper:
    def __init__(self, base_url=JYFW_BASE_URL, timeout=CRAWL_REQUEST_TIMEOUT):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def _post(self, path, payload=None, retries=3):
        url = f"{self.base_url}/api/jyComplayJob{path}"
        last_err = None
        for attempt in range(retries):
            try:
                resp = self.session.post(url, json=payload or {}, timeout=self.timeout, verify=False)
                if resp.status_code in (403, 429, 500, 502, 503):
                    time.sleep(1.5 * (attempt + 1))
                    last_err = RuntimeError(f"HTTP {resp.status_code}")
                    continue
                resp.raise_for_status()
                data = resp.json()
                if data.get("code") != 200:
                    raise RuntimeError(f"API {path} failed: {data.get('msg')}")
                return data.get("data")
            except Exception as exc:
                last_err = exc
                time.sleep(1.0 * (attempt + 1))
        raise last_err

    def fetch_hot_jobs(self):
        data = self._post("/listCompanyHot", {"pageNum": 1, "pageSize": 50})
        if isinstance(data, dict):
            return data.get("list") or []
        return data or []

    def fetch_companies(self):
        return self._post("/listComplayByJob", {}) or []

    def fetch_jobs_by_company(self, company_id):
        data = self._post("/list", {"complayId": company_id, "pageNum": 1, "pageSize": 100})
        if isinstance(data, dict):
            return data.get("list") or data.get("records") or []
        return data or []

    @staticmethod
    def resolve_external_id(job):
        ext_id = job.get("id")
        if ext_id:
            return str(ext_id)
        seed = "|".join(
            str(job.get(k) or "")
            for k in ("complayId", "name", "workAreaCode", "updateDate", "createDate")
        )
        return hashlib.md5(seed.encode("utf-8")).hexdigest()

    def normalize_job(self, raw):
        job = dict(raw)
        job["_base_url"] = self.base_url
        job["_resolved_id"] = self.resolve_external_id(job)
        return job

    def crawl_all(self):
        logger.info("开始抓取 jyfw.org.cn 公开岗位 ...")
        all_jobs = {}
        seen_ids = set()

        # 1) 热门岗位
        for raw in self.fetch_hot_jobs():
            job = self.normalize_job(raw)
            ext_id = job["_resolved_id"]
            if ext_id not in seen_ids:
                seen_ids.add(ext_id)
                all_jobs[ext_id] = job

        logger.info("热门岗位: %d 条", len(all_jobs))

        # 2) 遍历招聘单位拉取岗位
        companies = self.fetch_companies()
        logger.info("招聘单位: %d 家", len(companies))

        def worker(company):
            cid = company.get("id")
            if not cid:
                return []
            try:
                time.sleep(0.15)
                return self.fetch_jobs_by_company(cid)
            except Exception as exc:
                logger.warning("单位 %s 抓取失败: %s", company.get("name"), exc)
                return []

        workers = max(2, min(CRAWL_CONCURRENCY, 4))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(worker, c): c for c in companies}
            done = 0
            for future in as_completed(futures):
                done += 1
                if done % 200 == 0:
                    logger.info("进度: %d / %d 家单位", done, len(companies))
                for raw in future.result():
                    job = self.normalize_job(raw)
                    ext_id = job["_resolved_id"]
                    all_jobs[ext_id] = job

        logger.info("共抓取岗位: %d 条", len(all_jobs))

        saved = 0
        for ext_id, job in all_jobs.items():
            if upsert_external_job(job):
                saved += 1

        closed = mark_missing_external_jobs(list(all_jobs.keys()))
        logger.info("写入/更新: %d 条，标记下线: %d 条", saved, closed)
        return {"fetched": len(all_jobs), "saved": saved, "closed": closed}


def run_once():
    return JyfwScraper().crawl_all()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    result = run_once()
    print(result)

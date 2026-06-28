"""每 30 分钟自动运行爬虫。"""
import logging
import sys

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.interval import IntervalTrigger

from config import SCHEDULER_INTERVAL_MINUTES
from scraper import run_once

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def job():
    try:
        result = run_once()
        logger.info("定时任务完成: %s", result)
    except Exception:
        logger.exception("定时爬虫任务失败")


def main():
    logger.info("启动定时爬虫，间隔 %d 分钟", SCHEDULER_INTERVAL_MINUTES)
    job()

    scheduler = BlockingScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(
        job,
        trigger=IntervalTrigger(minutes=SCHEDULER_INTERVAL_MINUTES),
        id="jyfw_crawler",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()


if __name__ == "__main__":
    main()

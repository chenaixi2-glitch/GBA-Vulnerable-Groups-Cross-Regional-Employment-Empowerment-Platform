"""爬虫配置，读取环境变量。"""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "gba_website"),
    "charset": os.getenv("DB_CHARSET", "utf8mb4"),
}

JYFW_BASE_URL = os.getenv("JYFW_BASE_URL", "https://www.jyfw.org.cn").rstrip("/")
CRAWL_CONCURRENCY = int(os.getenv("CRAWL_CONCURRENCY", "8"))
CRAWL_REQUEST_TIMEOUT = int(os.getenv("CRAWL_REQUEST_TIMEOUT", "20"))
SCHEDULER_INTERVAL_MINUTES = int(os.getenv("SCHEDULER_INTERVAL_MINUTES", "30"))

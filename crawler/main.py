"""爬虫入口：python main.py [--once | --schedule]"""
import argparse
import logging
import sys

from scheduler import job, main as schedule_main
from scraper import run_once


def parse_args():
    parser = argparse.ArgumentParser(description="广东省残疾人就业服务网岗位爬虫")
    parser.add_argument("--once", action="store_true", help="立即执行一次后退出")
    parser.add_argument("--schedule", action="store_true", help="启动定时任务（默认每30分钟）")
    return parser.parse_args()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    args = parse_args()

    if args.schedule:
        schedule_main()
    elif args.once:
        result = run_once()
        print(result)
    else:
        # 默认：执行一次
        result = run_once()
        print(result)

"""
Bridge 共享工具函数
===================
消除 handler.py 和 settings.py 之间的重复代码。
"""
import os
from datetime import date

from config import STORAGE_DIR_NAME


def safe_err(e: Exception) -> str:
    return str(e)[:200]


def get_storage_dir() -> str:
    return os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME
    )


def today_str() -> str:
    return str(date.today())

"""
统一日志配置
=============
输出到 stdout（开发时可见）+ 文件（%APPDATA%/AI-Pet/logs/）
调用方式: from agent.logger import get_logger
          logger = get_logger(__name__)
"""
import os
import logging
from datetime import datetime


_loggers: dict[str, logging.Logger] = {}


def _get_log_dir() -> str:
    base = os.path.join(os.getenv("APPDATA") or os.path.expanduser("~"), "AI-Pet")
    log_dir = os.path.join(base, "logs")
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


def get_logger(name: str) -> logging.Logger:
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    if not logger.handlers:
        fmt = logging.Formatter(
            "[%(asctime)s] [%(name)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
        )

        stream_handler = logging.StreamHandler()
        stream_handler.setLevel(logging.DEBUG)
        stream_handler.setFormatter(fmt)
        logger.addHandler(stream_handler)

        try:
            log_file = os.path.join(_get_log_dir(), f"pet_{datetime.now().strftime('%Y%m%d')}.log")
            file_handler = logging.FileHandler(log_file, encoding="utf-8")
            file_handler.setLevel(logging.DEBUG)
            file_handler.setFormatter(fmt)
            logger.addHandler(file_handler)
        except Exception:
            pass

    _loggers[name] = logger
    return logger

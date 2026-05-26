"""
统一日志配置
=============
输出到 stdout + 文件（%APPDATA%/AI-Pet/logs/）
文件按日自动轮转，不依赖标准库 TimedRotatingFileHandler 的复杂配置。
"""
import os
import logging
from datetime import datetime

_loggers: dict[str, logging.Logger] = {}


def _get_log_dir() -> str:
    base = os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"), "AI-Pet"
    )
    log_dir = os.path.join(base, "logs")
    os.makedirs(log_dir, exist_ok=True)
    return log_dir


class _DateRotatingFileHandler(logging.Handler):
    def __init__(self, log_dir: str, fmt: logging.Formatter) -> None:
        super().__init__()
        self._log_dir = log_dir
        self._fmt = fmt
        self._current_date: str = ""
        self._file_handler: logging.FileHandler | None = None

    def _ensure_handler(self) -> None:
        today = datetime.now().strftime("%Y%m%d")
        if today == self._current_date and self._file_handler is not None:
            return
        if self._file_handler:
            self._file_handler.close()
        log_file = os.path.join(self._log_dir, f"pet_{today}.log")
        self._file_handler = logging.FileHandler(log_file, encoding="utf-8")
        self._file_handler.setLevel(logging.DEBUG)
        self._file_handler.setFormatter(self._fmt)
        self._current_date = today

    def emit(self, record: logging.LogRecord) -> None:
        self._ensure_handler()
        if self._file_handler:
            self._file_handler.emit(record)

    def close(self) -> None:
        if self._file_handler:
            self._file_handler.close()
        super().close()


def get_logger(name: str) -> logging.Logger:
    if name in _loggers:
        return _loggers[name]

    logger = logging.getLogger(name)
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    if not logger.handlers:
        fmt = logging.Formatter(
            "[%(asctime)s] [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

        stream_handler = logging.StreamHandler()
        stream_handler.setLevel(logging.DEBUG)
        stream_handler.setFormatter(fmt)
        logger.addHandler(stream_handler)

        try:
            file_handler = _DateRotatingFileHandler(_get_log_dir(), fmt)
            logger.addHandler(file_handler)
        except Exception:
            pass

    _loggers[name] = logger
    return logger

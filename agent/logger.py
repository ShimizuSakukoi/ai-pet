"""
结构化日志 —— 模块级别独立文件 + 集中错误日志
==============================================
文件输出:
  %APPDATA%/AI-Pet/logs/pet_<module>.log  — 按模块分文件
  %APPDATA%/AI-Pet/logs/pet_error.log     — 所有 ERROR+ 集中
控制台: 实时输出 DEBUG+
所有 except 块必须带 exc_info=True
"""
import os
import logging
import threading
from datetime import datetime

from config import STORAGE_DIR_NAME

_loggers: dict[str, logging.Logger] = {}
_loggers_lock = threading.Lock()
_error_handler: logging.Handler | None = None


def _get_log_dir():
    base = os.path.join(os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME)
    d = os.path.join(base, "logs")
    os.makedirs(d, exist_ok=True)
    return d


class _ModuleFileHandler(logging.Handler):
    """每个模块独立日志文件, 按日轮转"""
    def __init__(self, module_name: str, fmt: logging.Formatter):
        super().__init__()
        self._dir = _get_log_dir()
        self._module = module_name
        self._fmt = fmt
        self._current_date = ""
        self._fh: logging.FileHandler | None = None
        self.setLevel(logging.DEBUG)

    def _path(self):
        today = datetime.now().strftime("%Y%m%d")
        return os.path.join(self._dir, f"pet_{self._module}_{today}.log")

    def _ensure(self):
        today = datetime.now().strftime("%Y%m%d")
        if today == self._current_date and self._fh is not None:
            return
        if self._fh:
            self._fh.close()
        self._fh = logging.FileHandler(self._path(), encoding="utf-8")
        self._fh.setLevel(logging.DEBUG)
        self._fh.setFormatter(self._fmt)
        self._current_date = today

    def emit(self, record):
        self._ensure()
        if self._fh:
            self._fh.emit(record)

    def close(self):
        if self._fh:
            self._fh.close()
        super().close()


def _error_path():
    return os.path.join(_get_log_dir(), "pet_error.log")


def _ensure_error_handler():
    global _error_handler
    if _error_handler is not None:
        return
    fmt = logging.Formatter(
        "[%(asctime)s] [%(name)s] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    _error_handler = logging.FileHandler(_error_path(), encoding="utf-8")
    _error_handler.setLevel(logging.ERROR)
    _error_handler.setFormatter(fmt)


def get_logger(name: str) -> logging.Logger:
    with _loggers_lock:
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
        stream = logging.StreamHandler()
        stream.setLevel(logging.DEBUG)
        stream.setFormatter(fmt)
        logger.addHandler(stream)

        try:
            module = name.split(".")[-1] if "." in name else name
            logger.addHandler(_ModuleFileHandler(module, fmt))
        except Exception:
            import sys
            print(f"[logger] 文件处理器创建失败: {name}", file=sys.stderr)

        _ensure_error_handler()
        logger.addHandler(_error_handler)

    with _loggers_lock:
        _loggers[name] = logger
    return logger

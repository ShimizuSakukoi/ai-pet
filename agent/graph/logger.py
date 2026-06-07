"""
Prompt 日志持久化 —— 保存完整 prompt+response 快照
"""
import os
from datetime import datetime

from agent.logger import get_logger
from config import STORAGE_DIR_NAME

logger = get_logger("graph.logger")


def save_prompt_log(system_text: str, messages: list, response_text: str):
    log_dir = os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"),
        STORAGE_DIR_NAME, "logs",
    )
    os.makedirs(log_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    path = os.path.join(log_dir, f"prompt_{timestamp}.txt")
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write("=" * 60 + "\n")
            f.write("SYSTEM PROMPT:\n")
            f.write("=" * 60 + "\n")
            f.write(system_text + "\n\n")
            f.write("=" * 60 + "\n")
            f.write("MESSAGES:\n")
            f.write("=" * 60 + "\n")
            for m in messages:
                role = type(m).__name__.replace("Message", "").upper()
                f.write(f"[{role}] {m.content}\n")
            f.write("\n" + "=" * 60 + "\n")
            f.write("RESPONSE:\n")
            f.write("=" * 60 + "\n")
            f.write(response_text + "\n")
        logger.info("prompt日志已保存: %s", os.path.basename(path))
    except Exception:
        logger.warning("prompt日志保存失败", exc_info=True)

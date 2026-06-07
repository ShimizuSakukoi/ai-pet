"""
角色日记系统
============
每天自动或手动生成一段角色口吻的日记。
存储: %APPDATA%/AI-Pet/diary.json
"""
import os
import json
import threading
from datetime import datetime

from config import STORAGE_DIR_NAME


def _now_str():
    return datetime.now().isoformat()


class Diary:
    def __init__(self):
        appdata = os.getenv("APPDATA") or os.path.expanduser("~")
        storage = os.path.join(appdata, STORAGE_DIR_NAME)
        self._file_path = os.path.join(storage, "diary.json")
        os.makedirs(storage, exist_ok=True)
        self._lock = threading.Lock()
        self._entries: list[dict] = []
        self._load()

    def get_entries(self) -> list[dict]:
        with self._lock:
            return list(self._entries)

    def get_today(self) -> dict | None:
        today = datetime.now().strftime("%Y-%m-%d")
        with self._lock:
            for e in self._entries:
                if e.get("date") == today:
                    return dict(e)
        return None

    def add_entry(self, content: str, memories_added: list = None,
                  special_events: list = None) -> dict:
        entry = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "content": content,
            "memories_added": memories_added or [],
            "special_events": special_events or [],
            "created_at": _now_str(),
        }
        with self._lock:
            existing = [e for e in self._entries if e["date"] != entry["date"]]
            existing.append(entry)
            existing.sort(key=lambda e: e["date"], reverse=True)
            self._entries = existing
            self._save()
        return entry

    def generate_content(self, graph, model_name: str,
                         conversation_summary: str = "",
                         new_memories: list = None) -> str:
        from langchain_core.messages import SystemMessage
        from agent.personality import load_persona

        persona = load_persona(model_name, "指挥官")
        prompt = (
            f"今天是{datetime.now().strftime('%Y年%m月%d日')}。"
            "以下是你今天和指挥官的聊天记录摘要，以及你新了解到的事。"
            "请以第一人称视角，写一段3-5句话的日记，记录今天和指挥官相处的点滴。"
            "语气要符合角色设定，内容要有趣、温暖，控制在80字以内。"
            "\n\n## 你的角色设定\n"
            f"{persona['persona']}"
            "\n\n## 今天的对话摘要"
        )
        if conversation_summary:
            prompt += f"\n{conversation_summary}"
        else:
            prompt += "\n（今天还没有和指挥官聊天）"
        if new_memories:
            mem_lines = "\n".join(f"- {m}" for m in new_memories)
            prompt += f"\n\n## 今天记住的新事\n{mem_lines}"
        prompt += (
            "\n\n请直接输出日记内容，不要加前缀、引号或markdown标记。"
            "用角色口吻写。"
        )
        try:
            response = graph.llm.invoke([SystemMessage(content=prompt)])
            text = response.content.strip()
            text = text.replace("```", "").strip()
            if len(text) > 200:
                text = text[:200] + "..."
            return text
        except Exception:
            import logging
            logging.getLogger("agent.diary").warning(
                "日记生成失败", exc_info=True,
            )
            today = datetime.now().strftime("%m月%d日")
            return f"{today}。今天和指挥官在一起度过了一段时光。虽然没什么特别的事，但能陪在指挥官身边就很开心了。"

    def _load(self):
        if os.path.exists(self._file_path):
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    self._entries = json.load(f)
            except (json.JSONDecodeError, OSError):
                self._entries = []

    def _save(self):
        tmp = self._file_path + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(self._entries, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self._file_path)
        except OSError:
            pass

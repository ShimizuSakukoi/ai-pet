"""
PetBrain —— 聚合 LLM + Graph + Interaction + Memory 的门面
===========================================================
对外暴露 chat / action / daily_review / reset / get_status / set_model。
"""
import os
import shutil
import threading

from langchain_core.messages import AIMessage

from agent.llm import build_llm_from_settings
from agent.graph import PetGraph
from agent.personality import load_persona
from agent.memory import LongTermMemory
from agent.interaction import InteractionHandler
from agent.diary import Diary
from agent.logger import get_logger
from config import (
    DEFAULT_PET_NAME,
    STORAGE_DIR_NAME,
)

logger = get_logger("brain")


class PetBrain:
    def __init__(self, pet_name=DEFAULT_PET_NAME,
                 settings=None, model_name="taihou"):
        self.pet_name = pet_name
        self.model_name = model_name
        self._settings = settings or {}
        self._lock = threading.Lock()

        try:
            self.llm = build_llm_from_settings(self._settings)
        except ValueError as e:
            logger.warning("LLM构建失败: %s", e)
            self.llm = None

        persona_data = load_persona(model_name, pet_name)

        self.ltm = LongTermMemory()
        self.diary = Diary()

        if self.llm is not None:
            self.graph = PetGraph(
                system_rules=persona_data["system"],
                persona=persona_data["persona"],
                llm=self.llm,
                ltm=self.ltm,
                pet_name=pet_name,
            )
        else:
            self.graph = None

        self._interaction = InteractionHandler(
            model_name, pet_name, self._raw_chat, self.graph,
        )

    def set_model(self, model_name: str, base_name: str = None):
        with self._lock:
            self.model_name = model_name
            persona_data = load_persona(model_name, self.pet_name, base_name)
            if self.graph is not None:
                self.graph._system_rules = persona_data["system"]
                self.graph._persona = persona_data["persona"]
            self._interaction = InteractionHandler(
                model_name, self.pet_name, self._raw_chat, self.graph,
                base_name=base_name,
            )
            logger.info(f"[SetModel] model=%s, base=%s", model_name, base_name)

    def _raw_chat(self, user_text: str, thread_id: str) -> dict:
        if self.llm is None:
            return {"text": "（还没有配置AI大脑，请在设置中配置API Key）"}
        if self.graph is None:
            return {"text": "（大脑还没准备好，稍等一下试试？）"}
        try:
            result = self.graph.invoke(user_text, thread_id)
            messages = result.get("messages", [])
            ai_text = ""
            for msg in reversed(messages):
                if isinstance(msg, AIMessage):
                    ai_text = msg.content
                    break
            return {"text": ai_text or "……（不知道该说什么）"}
        except Exception:
            logger.warning("对话处理失败", exc_info=True)
            return {"text": "（大脑短路了，再说一遍试试？）"}

    def chat(self, user_text: str, thread_id: str = None) -> dict:
        with self._lock:
            return self._raw_chat(user_text, thread_id or self.model_name)

    def action(self, action_type: str, thread_id: str = None) -> dict:
        with self._lock:
            return self._interaction.action(
                action_type, thread_id or self.model_name,
            )

    def daily_review(self, thread_id: str = None) -> dict:
        with self._lock:
            return self._interaction.daily_review(
                thread_id or self.model_name,
            )

    def reset(self, thread_id: str = None) -> dict:
        with self._lock:
            self.ltm.delete_all()
            db_dir = os.path.join(
                os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME
            )
            db_path = os.path.join(db_dir, "conversations.db")
            backup_path = db_path + ".backup"

            if os.path.exists(db_path):
                try:
                    shutil.copy2(db_path, backup_path)
                except OSError:
                    backup_path = None

            try:
                if self.graph is not None:
                    self.graph.close()
            except Exception:
                logger.warning("graph关闭失败", exc_info=True)

            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except OSError:
                    logger.warning("DB删除失败", exc_info=True)

            try:
                if self.graph is not None:
                    self.graph._rebuild()
            except Exception:
                logger.warning("graph重建失败, 尝试恢复备份", exc_info=True)
                if backup_path and os.path.exists(backup_path):
                    try:
                        shutil.move(backup_path, db_path)
                        if self.graph is not None:
                            self.graph._rebuild()
                    except Exception:
                        logger.error("DB恢复也失败了", exc_info=True)

            if backup_path and os.path.exists(backup_path):
                try:
                    os.remove(backup_path)
                except OSError:
                    pass

            return {"text": "记忆已全部清除！我们重新认识吧~"}

    def get_status(self, thread_id: str = None) -> dict:
        with self._lock:
            try:
                if self.graph is not None:
                    self.graph.get_state(thread_id or self.model_name)
                return {
                    "memories_count": self.ltm.get_count(),
                    "has_diary_today": self.diary.get_today() is not None,
                }
            except Exception:
                logger.warning("get_status失败", exc_info=True)
                return {"memories_count": 0, "has_diary_today": False}

    def generate_diary(self) -> dict:
        with self._lock:
            existing = self.diary.get_today()
            if existing:
                return {"ok": True, "entry": existing, "already": True}
            if self.graph is None:
                return {"ok": False, "error": "大脑还没准备好"}
            content = self.diary.generate_content(
                self.graph, self.model_name,
            )
            entry = self.diary.add_entry(content)
            return {"ok": True, "entry": entry, "already": False}

    def get_diary_entries(self) -> dict:
        return {"entries": self.diary.get_entries()}

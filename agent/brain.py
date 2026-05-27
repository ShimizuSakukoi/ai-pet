"""
PetBrain —— 聚合 LLM + Graph + Interaction + Memory 的门面
==========================================================
对外暴露 chat / action / daily_review / reset / get_status / set_model。
"""
import os
import threading

from langchain_core.messages import AIMessage

from agent.llm import build_llm_from_settings
from agent.graph import PetGraph
from agent.personality import load_persona
from agent.memory import LongTermMemory
from agent.interaction import InteractionHandler
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

        self.llm = build_llm_from_settings(self._settings)

        persona_data = load_persona(model_name, pet_name)

        self.ltm = LongTermMemory()

        self.graph = PetGraph(
            system_rules=persona_data["system"],
            persona=persona_data["persona"],
            llm=self.llm,
            ltm=self.ltm,
            pet_name=pet_name,
        )

        self._interaction = InteractionHandler(
            model_name, pet_name, self._raw_chat, self.graph,
        )

    def set_model(self, model_name: str, base_name: str = None):
        self.model_name = model_name
        persona_data = load_persona(model_name, self.pet_name, base_name)
        self.graph._system_rules = persona_data["system"]
        self.graph._persona = persona_data["persona"]
        self._interaction = InteractionHandler(
            model_name, self.pet_name, self._raw_chat, self.graph,
            base_name,
        )
        logger.info(f"[SetModel] model={model_name}, base={base_name}")

    def _raw_chat(self, user_text: str, thread_id: str) -> dict:
        result = self.graph.invoke(user_text, thread_id)

        if result is None:
            return {
                "text": "（大脑短路了，再说一遍试试？）",
            }

        messages = result.get("messages", [])
        ai_text = ""
        for msg in reversed(messages):
            if isinstance(msg, AIMessage):
                ai_text = msg.content
                break

        return {
            "text": ai_text or "……（不知道该说什么）",
        }

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
            try:
                self.graph.close()
            except Exception:
                pass
            db_dir = os.path.join(
                os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME
            )
            db_path = os.path.join(db_dir, "conversations.db")
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass
            self.graph._rebuild()
            return {
                "text": "记忆已全部清除！我们重新认识吧~",
            }

    def get_status(self, thread_id: str = None) -> dict:
        try:
            current = self.graph.get_state(thread_id or self.model_name)
            if current and current.values:
                return {
                    "memories_count": self.ltm.get_count(),
                }
        except Exception:
            pass
        return {
            "memories_count": 0,
        }

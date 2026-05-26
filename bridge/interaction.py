"""
交互桥接 —— 对话 / 互动 / 回顾 / TTS
======================================
从 handler.py 抽出的"有肉"方法，handler.py 仅保留路由代理。
"""
import os
import json
import html

from bridge.utils import safe_err, today_str
from agent.logger import get_logger

logger = get_logger("interaction")


class InteractionBridge:
    def __init__(self, state):
        self._state = state

    def chat(self, text, thread_id=None):
        if not self._state.brain:
            return {
                "text": "我还没准备好…请先设置 API Key",
                "friendship": 0,
            }
        logger.info(f"[chat] text={text[:60]}, thread={thread_id}")
        try:
            result = self._state.brain.chat(text, thread_id)
            logger.info(f"[chat] friendship={result.get('friendship')}")
            return result
        except Exception as e:
            return {"text": f"(出错: {safe_err(e)})", "friendship": 0}

    def reset(self, thread_id=None):
        if not self._state.brain:
            return {"text": "没有可清除的记忆", "friendship": 0}
        return self._state.brain.reset(thread_id or self._state.current_model)

    def get_status(self, thread_id=None):
        if not self._state.brain:
            return {"ready": False, "friendship": 0, "memories_count": 0}
        try:
            s = self._state.brain.get_status(thread_id)
            s["ready"] = True
            return s
        except Exception:
            return {"ready": True, "friendship": 0, "memories_count": 0}

    def pet_action(self, action_type, thread_id=None):
        if not self._state.brain:
            return {"text": "", "friendship": 0, "action": action_type}
        logger.info(f"[pet_action] type={action_type}, thread={thread_id}")
        try:
            result = self._state.brain.action(action_type, thread_id)
            text = result.get("text", "")
            friendship = result.get("friendship", 0)
            if text and self._state.chat_window:
                try:
                    safe_text = json.dumps(html.escape(text))
                    self._state.chat_window.evaluate_js(
                        f"addMessage('pet', {safe_text}, true);"
                        f"updateFriendship({friendship});"
                    )
                except Exception:
                    pass
            return {**result, "action": action_type}
        except Exception as e:
            return {
                "text": "",
                "friendship": 0,
                "action": action_type,
                "error": safe_err(e),
            }

    def daily_review(self, thread_id=None):
        if not self._state.brain:
            return {"text": "", "ok": False}
        try:
            review_path = os.path.join(self._state.storage, "review_state.json")
            today = today_str()

            if os.path.exists(review_path):
                with open(review_path, "r") as f:
                    state = json.load(f)
                if state.get("last_review_date") == today:
                    return {"text": "", "ok": False, "skipped": True}

            result = self._state.brain.daily_review(thread_id)

            with open(review_path, "w") as f:
                json.dump({"last_review_date": today}, f)

            return {"text": result.get("text", ""), "ok": True}
        except Exception as e:
            return {"text": "", "ok": False, "error": safe_err(e)}

    def speak(self, text):
        return {"audio": None, "format": ""}

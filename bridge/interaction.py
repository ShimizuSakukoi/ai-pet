"""
交互桥接 —— 对话 / 互动 / 回顾 / 日记 / 音频
==========================================
委托给子模块: chat_api / action_api / review_api / audio / diary
"""
import os
import json
import html

from bridge.utils import safe_err, today_str
from bridge import audio as _audio
from agent.logger import get_logger

logger = get_logger("interaction")


class InteractionBridge:
    def __init__(self, state):
        self._state = state

    def chat(self, text, thread_id=None):
        if not self._state.brain:
            return {"text": "我还没准备好…请先设置 API Key"}
        logger.info("chat text=%s, thread=%s", text[:60], thread_id)
        try:
            return self._state.brain.chat(text, thread_id)
        except Exception as e:
            return {"text": f"(出错: {safe_err(e)})"}

    def reset(self, thread_id=None):
        if not self._state.brain:
            return {"text": "没有可清除的记忆"}
        return self._state.brain.reset(thread_id or self._state.current_model)

    def get_status(self, thread_id=None):
        if not self._state.brain:
            return {"ready": False, "memories_count": 0}
        try:
            s = self._state.brain.get_status(thread_id)
            s["ready"] = True
            return s
        except Exception:
            return {"ready": True, "memories_count": 0}

    def pet_action(self, action_type, thread_id=None):
        if not self._state.brain:
            return {"text": "", "action": action_type}
        logger.info("pet_action type=%s, thread=%s", action_type, thread_id)
        try:
            result = self._state.brain.action(action_type, thread_id)
            text = result.get("text", "")
            if text and self._state.chat_window:
                try:
                    safe_text = json.dumps(html.escape(text))
                    self._state.chat_window.evaluate_js(
                        f"addMessage('pet', {safe_text}, true);"
                    )
                except Exception:
                    pass
            return {**result, "action": action_type}
        except Exception as e:
            return {"text": "", "action": action_type, "error": safe_err(e)}

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

    def generate_quick_replies(self):
        if not self._state.brain:
            return {"replies": []}
        try:
            replies = self._state.brain._interaction.generate_quick_replies()
            return {"replies": replies}
        except Exception:
            return {"replies": []}

    def generate_diary(self):
        if not self._state.brain:
            return {"ok": False, "error": "大脑还没准备好"}
        try:
            return self._state.brain.generate_diary()
        except Exception as e:
            return {"ok": False, "error": safe_err(e)}

    def get_diary_entries(self):
        if not self._state.brain:
            return {"entries": []}
        try:
            return self._state.brain.get_diary_entries()
        except Exception:
            return {"entries": []}

    def get_audio(self, model_name, audio_path):
        return _audio.get_audio(model_name, audio_path)

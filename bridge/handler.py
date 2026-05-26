"""
Bridge Handler —— 前端 JS 可调用的 Python 方法
=============================================
通过 pywebview 的 js_api 暴露给前端，前端在 JS 里调用
pywebview.api.xxx() 即可触发这些方法。

子模块：
  - settings.py : SettingsManager（配置存取 & 连接测试）
  - windows.py  : WindowManager（窗口控制 & 模型切换 & 开机自启）
  - memory_api.py : MemoryController（记忆 CRUD）

规则：
  - 每个 public 方法的返回值会序列化为 JSON 传回前端
  - 命名下划线前缀的方法（如 _get_storage_dir）对前端不可见
  - 所有异常都必须捕获，返回 { ok: false, error: ... }
"""

import os
import json

from config import STORAGE_DIR_NAME, FRIENDSHIP_PET_GAIN
from bridge.settings import SettingsManager
from bridge.windows import WindowManager
from bridge.memory_api import MemoryController
from agent.logger import get_logger

logger = get_logger("handler")


class BridgeState:
    __slots__ = (
        "brain", "pet_window", "chat_window", "on_top",
        "settings", "models", "current_model", "model_index",
        "storage", "last_review_date",
    )

    def __init__(self, storage_dir):
        self.brain = None
        self.pet_window = None
        self.chat_window = None
        self.on_top = False
        self.settings = {}
        self.models = []
        self.current_model = "haru"
        self.model_index = 0
        self.storage = storage_dir
        self.last_review_date = None


class BridgeHandler:
    def __init__(self):
        storage = _get_storage_dir()
        os.makedirs(storage, exist_ok=True)

        self._state = BridgeState(storage)
        self.settings = SettingsManager(self._state)
        self.windows = WindowManager(self._state)
        self.memory = MemoryController(self._state)

        models = self.windows._scan_models()
        self._state.models = models
        self._state.current_model = models[0]["name"] if models else "haru"

    # ── Settings (proxy to SettingsManager) ──
    def load_settings(self):
        return self.settings.load_settings()

    def save_settings(self, settings):
        return self.settings.save_settings(settings)

    def test_connection(self, settings):
        return self.settings.test_connection(settings)

    def get_providers(self):
        return self.settings.get_providers()

    # ── Windows (proxy to WindowManager) ──
    def get_models(self):
        return self.windows.get_models()

    def toggle_on_top(self):
        return self.windows.toggle_on_top()

    def window_minimize(self):
        return self.windows.window_minimize()

    def window_show(self):
        return self.windows.window_show()

    def window_move(self, x, y):
        return self.windows.window_move(x, y)

    def switch_model(self, direction):
        return self.windows.switch_model(direction)

    def quit_app(self):
        return self.windows.quit_app()

    def get_autostart(self):
        return self.windows.get_autostart()

    def set_autostart(self, enable):
        return self.windows.set_autostart(enable)

    # ── Memory (proxy to MemoryController) ──
    def get_memories(self):
        return self.memory.get_memories()

    def delete_memory(self, mid):
        return self.memory.delete_memory(mid)

    def update_memory(self, mid, content):
        return self.memory.update_memory(mid, content)

    # ── Chat / Interaction ──
    def chat(self, text, thread_id="default"):
        if not self._state.brain:
            return {
                "text": "我还没准备好…请先设置 API Key",
                "mood": "neutral",
                "friendship": 0,
            }
        logger.info(f"[chat] text={text[:60]}, thread={thread_id}")
        try:
            result = self._state.brain.chat(text, thread_id)
            logger.info(
                f"[chat] mood={result.get('mood')}, "
                f"friendship={result.get('friendship')}"
            )
            return result
        except Exception as e:
            return {
                "text": f"(出错: {_safe_err(e)})",
                "mood": "neutral",
                "friendship": 0,
            }

    def reset(self, thread_id="default"):
        if not self._state.brain:
            return {"text": "没有可清除的记忆", "mood": "neutral", "friendship": 0}
        return self._state.brain.reset(thread_id)

    def get_status(self, thread_id="default"):
        if not self._state.brain:
            return {
                "ready": False,
                "mood": "neutral",
                "friendship": 0,
                "memories_count": 0,
            }
        try:
            s = self._state.brain.get_status(thread_id)
            s["ready"] = True
            return s
        except Exception:
            return {
                "ready": True,
                "mood": "neutral",
                "friendship": 0,
                "memories_count": 0,
            }

    def pet_action(self, action_type, thread_id="default"):
        if not self._state.brain:
            return {
                "text": "",
                "mood": "neutral",
                "friendship": 0,
                "action": action_type,
            }
        logger.info(f"[pet_action] type={action_type}, thread={thread_id}")
        try:
            result = self._state.brain.action(
                action_type, FRIENDSHIP_PET_GAIN, thread_id
            )

            text = result.get("text", "")
            friendship = result.get("friendship", 0)
            if text and self._state.chat_window:
                try:
                    import json as _json
                    safe_text = _json.dumps(text)
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
                "mood": "neutral",
                "friendship": 0,
                "action": action_type,
                "error": _safe_err(e),
            }

    def daily_review(self, thread_id="default"):
        if not self._state.brain:
            return {"text": "", "ok": False}
        try:
            review_state_path = os.path.join(
                self._state.storage, "review_state.json"
            )
            today = _today_str()

            if os.path.exists(review_state_path):
                with open(review_state_path, "r") as f:
                    state = json.load(f)
                if state.get("last_review_date") == today:
                    return {"text": "", "ok": False, "skipped": True}

            result = self._state.brain.daily_review(thread_id)

            with open(review_state_path, "w") as f:
                json.dump({"last_review_date": today}, f)

            return {"text": result.get("text", ""), "ok": True}
        except Exception as e:
            return {"text": "", "ok": False, "error": _safe_err(e)}

    def speak(self, text):
        return {"audio": None, "format": ""}

    def check_update(self):
        from bridge.updater import check_update as _do_check
        return _do_check()


def _get_storage_dir():
    return os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME
    )


def _today_str():
    from datetime import date
    return str(date.today())


def _safe_err(e):
    return str(e)[:200]

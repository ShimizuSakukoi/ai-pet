"""
Bridge Handler —— 前端 JS 可调用的 Python 方法（纯路由代理）
==========================================================
通过 pywebview 的 js_api 暴露给前端，前端在 JS 里调用
pywebview.api.xxx() 即可触发这些方法。

子模块：
  - settings.py    : SettingsManager（配置存取 & 连接测试）
  - windows.py     : WindowManager（窗口控制 & 模型切换 & 开机自启）
  - memory_api.py  : MemoryController（记忆 CRUD）
  - interaction.py : InteractionBridge（对话/互动/回顾/TTS）

规则：
  - 每个 public 方法（无下划线前缀）返回值序列化为 JSON 传回前端
  - 所有异常都必须捕获
"""
import os

from bridge.utils import get_storage_dir
from bridge.settings import SettingsManager
from bridge.windows import WindowManager
from bridge.memory_api import MemoryController
from bridge.interaction import InteractionBridge
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
        self.current_model = "dafeng"
        self.model_index = 0
        self.storage = storage_dir
        self.last_review_date = None


class BridgeHandler:
    def __init__(self):
        storage = get_storage_dir()
        os.makedirs(storage, exist_ok=True)

        self._state = BridgeState(storage)
        self.settings = SettingsManager(self._state)
        self.windows = WindowManager(self._state)
        self.memory = MemoryController(self._state)
        self._interaction = InteractionBridge(self._state)

        models = self.windows.scan_models()
        self._state.models = models
        self._state.current_model = models[0]["name"] if models else None

    # ── Settings proxy ──
    def load_settings(self):
        return self.settings.load_settings()

    def save_settings(self, settings):
        return self.settings.save_settings(settings)

    def test_connection(self, settings):
        return self.settings.test_connection(settings)

    def get_providers(self):
        return self.settings.get_providers()

    # ── Windows proxy ──
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

    # ── Memory proxy ──
    def get_memories(self):
        return self.memory.get_memories()

    def delete_memory(self, mid):
        return self.memory.delete_memory(mid)

    def update_memory(self, mid, content):
        return self.memory.update_memory(mid, content)

    # ── Interaction proxy ──
    def chat(self, text, thread_id=None):
        return self._interaction.chat(text, thread_id)

    def reset(self, thread_id=None):
        return self._interaction.reset(thread_id)

    def get_status(self, thread_id=None):
        return self._interaction.get_status(thread_id)

    def pet_action(self, action_type, thread_id=None):
        return self._interaction.pet_action(action_type, thread_id)

    def daily_review(self, thread_id=None):
        return self._interaction.daily_review(thread_id)

    def speak(self, text):
        return self._interaction.speak(text)

    def generate_quick_replies(self):
        return self._interaction.generate_quick_replies()

    def get_audio(self, model_name, audio_path):
        return self._interaction.get_audio(model_name, audio_path)

    def check_update(self):
        from bridge.updater import check_update as _do_check
        return _do_check()

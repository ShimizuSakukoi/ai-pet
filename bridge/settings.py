"""
Settings Manager —— 配置存取 & Brain 生命周期
============================================
负责 settings.json 读写、PetBrain 实例化。
"""
import os
import json

from agent.brain import PetBrain
from bridge.utils import safe_err
from bridge import connection as _conn
from config import LLM_PROVIDERS, PROVIDER_MODELS


class SettingsManager:
    def __init__(self, state):
        self._state = state

    def _default_pet_name(self):
        name = self._state.current_model
        for m in self._state.models:
            if m["name"] == name:
                return m["display"]
        return (name or "").split("/")[0]

    def load_settings(self):
        path = os.path.join(self._state.storage, "settings.json")
        if not os.path.exists(path):
            return {"ok": False, "settings": None, "ready": False}

        try:
            with open(path, "r", encoding="utf-8") as f:
                settings = json.load(f)
        except Exception:
            return {"ok": False, "settings": None, "ready": False}

        self._state.settings = settings
        try:
            self._state.brain = PetBrain(
                pet_name=settings.get("pet_name") or self._default_pet_name(),
                settings=settings,
                model_name=self._state.current_model,
            )
            self._state.on_top = settings.get("on_top", False)
            if self._state.chat_window:
                try:
                    self._state.chat_window.on_top = self._state.on_top
                except Exception:
                    pass
            return {"ok": True, "settings": settings, "ready": True}
        except Exception as e:
            import traceback
            print(f"[load_settings] failed: {e}", flush=True)
            traceback.print_exc()
            return {"ok": True, "settings": settings, "ready": False,
                    "error": safe_err(e)}

    def save_settings(self, settings):
        self._state.settings = settings
        path = os.path.join(self._state.storage, "settings.json")
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(settings, f, ensure_ascii=False, indent=2)
        except Exception as e:
            return {"ok": False, "error": safe_err(e)}

        try:
            self._state.brain = PetBrain(
                pet_name=settings.get("pet_name") or self._default_pet_name(),
                settings=settings,
                model_name=self._state.current_model,
            )
            self._state.on_top = settings.get("on_top", False)
            if self._state.chat_window:
                try:
                    self._state.chat_window.on_top = self._state.on_top
                except Exception:
                    pass
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": safe_err(e)}

    def test_connection(self, settings):
        return _conn.test_connection(settings)

    def get_providers(self):
        return {"providers": {
            k: {
                "base_url": v["base_url"],
                "default_model": v["default_model"],
                "models": PROVIDER_MODELS.get(k, [v["default_model"]]),
            }
            for k, v in LLM_PROVIDERS.items()
        }}

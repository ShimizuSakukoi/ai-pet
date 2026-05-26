"""
Window Manager —— 窗口控制、模型切换、开机自启
=============================================
负责双窗口的显示/隐藏/置顶/移动/销毁、Live2D 模型自动发现与切换、
开机自启管理。
"""

import os
import sys


class WindowManager:
    def __init__(self, state):
        self._state = state

    def _scan_models(self):
        if getattr(sys, "frozen", False):
            model_dir = os.path.join(sys._MEIPASS, "ui", "model")
        else:
            model_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "ui", "model",
            )
        models = []
        if not os.path.isdir(model_dir):
            return [{"name": "haru", "model_file": "haru01.model.json"}]
        try:
            for entry in sorted(os.scandir(model_dir), key=lambda e: e.name):
                if entry.is_dir():
                    for f in os.listdir(entry.path):
                        if f.endswith(".model.json"):
                            models.append({"name": entry.name, "model_file": f})
                            break
        except Exception:
            pass
        return models or [{"name": "haru", "model_file": "haru01.model.json"}]

    def get_models(self):
        return {"models": self._state.models}

    def toggle_on_top(self):
        self._state.on_top = not self._state.on_top
        for w in (self._state.pet_window, self._state.chat_window):
            if w:
                try:
                    w.on_top = self._state.on_top
                except Exception:
                    pass
        return {"on_top": self._state.on_top}

    def window_minimize(self):
        if self._state.chat_window:
            try:
                self._state.chat_window.hide()
            except Exception:
                pass

    def window_show(self):
        for w in (self._state.pet_window, self._state.chat_window):
            if w:
                try:
                    w.show()
                except Exception:
                    pass

    def window_move(self, x, y):
        if self._state.chat_window:
            try:
                self._state.chat_window.move(int(x), int(y))
            except Exception:
                pass
        return {"ok": True}

    def switch_model(self, direction):
        if not self._state.models:
            return {"ok": True}
        self._state.model_index = (
            (self._state.model_index + int(direction)) % len(self._state.models)
        )
        self._state.current_model = self._state.models[self._state.model_index]["name"]

        if self._state.pet_window:
            try:
                self._state.pet_window.evaluate_js(
                    f"switchModel({int(direction)})"
                )
            except Exception:
                pass

        if self._state.brain:
            try:
                self._state.brain.set_model(self._state.current_model)
            except Exception:
                pass

        return {"ok": True}

    def quit_app(self):
        try:
            if self._state.chat_window:
                self._state.chat_window.destroy()
            if self._state.pet_window:
                self._state.pet_window.destroy()
        except Exception:
            os._exit(0)
        os._exit(0)

    def get_autostart(self):
        startup_dir = os.path.join(
            os.getenv("APPDATA") or os.path.expanduser("~"),
            "Microsoft", "Windows", "Start Menu", "Programs", "Startup",
        )
        bat_path = os.path.join(startup_dir, "AI-Pet.bat")
        return {"enabled": os.path.exists(bat_path)}

    def set_autostart(self, enable):
        startup_dir = os.path.join(
            os.getenv("APPDATA") or os.path.expanduser("~"),
            "Microsoft", "Windows", "Start Menu", "Programs", "Startup",
        )
        os.makedirs(startup_dir, exist_ok=True)
        bat_path = os.path.join(startup_dir, "AI-Pet.bat")

        if enable:
            exe_path = sys.executable
            if getattr(sys, "frozen", False):
                target = exe_path
                with open(bat_path, "w") as f:
                    f.write(f'@echo off\nstart "" "{target}"\n')
            else:
                target = os.path.join(os.path.dirname(exe_path), "python.exe")
                cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                script = os.path.join(cwd, "main.py")
                with open(bat_path, "w") as f:
                    f.write(
                        f'@echo off\ncd /d "{cwd}"\n'
                        f'start "" "{target}" "{script}"\n'
                    )
        else:
            if os.path.exists(bat_path):
                try:
                    os.remove(bat_path)
                except Exception:
                    pass

        return {"ok": True}

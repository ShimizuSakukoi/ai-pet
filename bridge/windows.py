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

    def _model_dir(self):
        if getattr(sys, "frozen", False):
            return os.path.join(sys._MEIPASS, "ui", "model")
        return os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "ui", "model",
        )

    def scan_models(self):
        import json

        model_dir = self._model_dir()
        models = []
        if not os.path.isdir(model_dir):
            return []
        try:
            for entry in sorted(os.scandir(model_dir), key=lambda e: e.name):
                if not entry.is_dir():
                    continue

                variants_path = os.path.join(entry.path, "variants.json")
                if os.path.exists(variants_path):
                    try:
                        with open(variants_path, "r", encoding="utf-8") as f:
                            vdata = json.load(f)
                    except Exception:
                        vdata = {}
                    var_list = vdata.get("variants", [])
                    if not var_list:
                        continue
                    shared_interactions = self._load_interactions(entry.path)
                    for var in var_list:
                        var_sub = var.get("id", "")
                        var_label = var.get("label", var_sub)
                        var_model = var.get("model_file", "")
                        if not var_model:
                            continue
                        var_name = entry.name + "/" + var_sub
                        var_interactions = self._load_interactions(
                            os.path.join(entry.path, var_sub)
                        ) or shared_interactions
                        models.append({
                            "name": var_name,
                            "display": entry.name,
                            "variant_label": var_label,
                            "model_file": var_model,
                            "base_name": entry.name,
                            "interactions": var_interactions,
                        })
                else:
                    for f in os.listdir(entry.path):
                        if f.endswith(".model.json") or f.endswith(".model3.json"):
                            info = {
                                "name": entry.name,
                                "display": entry.name,
                                "model_file": f,
                                "base_name": entry.name,
                            }
                            info["interactions"] = self._load_interactions(entry.path)
                            models.append(info)
                            break
        except Exception:
            pass
        return models

    def _load_interactions(self, dir_path):
        import json

        path = os.path.join(dir_path, "interactions.json")
        if not os.path.exists(path):
            return {}
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

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

    def _switch_to(self, target_idx):
        if not self._state.models:
            return
        self._state.model_index = target_idx
        m = self._state.models[target_idx]
        self._state.current_model = m["name"]

        if self._state.pet_window:
            try:
                self._state.pet_window.evaluate_js(
                    f"switchToModel('{m['name']}');"
                    f"onModelChange({target_idx});"
                )
            except Exception:
                pass

        if self._state.brain:
            try:
                self._state.brain.set_model(m["name"], m.get("base_name"))
            except Exception:
                pass

    def switch_model(self, direction):
        if not self._state.models:
            return {"ok": True}
        idx = (self._state.model_index + int(direction)) % len(self._state.models)
        self._switch_to(idx)
        return {"ok": True}

    def switch_to_model(self, model_name):
        if not self._state.models:
            return {"ok": False}
        for i, m in enumerate(self._state.models):
            if m["name"] == model_name:
                self._switch_to(i)
                return {"ok": True}
        return {"ok": False}

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

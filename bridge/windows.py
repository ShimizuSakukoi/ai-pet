"""
窗口显示控制 —— 双窗口的 show / hide / toggle_on_top / move / destroy
"""
import os
import sys as _sys


class WindowManager:
    def __init__(self, state):
        self._state = state

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
        if x is None or y is None:
            return {"ok": False, "error": "invalid coordinates"}
        if self._state.chat_window:
            try:
                self._state.chat_window.move(int(x), int(y))
                return {"ok": True}
            except Exception:
                return {"ok": False, "error": "window move failed"}
        return {"ok": False, "error": "no chat window"}

    def quit_app(self):
        try:
            if self._state.brain:
                if self._state.brain.graph:
                    self._state.brain.graph.close()
                if self._state.brain.ltm:
                    self._state.brain.ltm._save()
        except Exception:
            pass
        try:
            if self._state.chat_window:
                self._state.chat_window.destroy()
            if self._state.pet_window:
                self._state.pet_window.destroy()
        except Exception:
            pass
        os._exit(0)

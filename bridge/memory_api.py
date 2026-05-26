"""
Memory Controller —— 记忆 CRUD
===============================
负责长期记忆的增删改查，桥接前端记忆面板到 backend memory.py。
"""


class MemoryController:
    def __init__(self, state):
        self._state = state

    def get_memories(self):
        if not self._state.brain:
            return {"memories": []}
        try:
            mems = self._state.brain.ltm.get_all()
            return {"memories": list(reversed(mems))}
        except Exception:
            return {"memories": []}

    def delete_memory(self, mid):
        if not self._state.brain:
            return {"ok": False}
        try:
            ok = self._state.brain.ltm.delete(mid)
            return {"ok": ok}
        except Exception:
            return {"ok": False}

    def update_memory(self, mid, content):
        if not self._state.brain:
            return {"ok": False}
        try:
            ok = self._state.brain.ltm.update(mid, content)
            return {"ok": ok}
        except Exception:
            return {"ok": False}

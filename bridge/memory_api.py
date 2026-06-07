"""
Memory Controller —— 记忆 CRUD
===============================
负责长期记忆的增删改查，桥接前端记忆面板到 backend memory.py。
支持三层记忆: core | preference | episodic
"""


class MemoryController:
    def __init__(self, state):
        self._state = state

    def get_memories(self):
        if not self._state.brain:
            return {"memories": []}
        try:
            with self._state.brain._lock:
                mems = self._state.brain.ltm.get_all()
            return {"memories": list(reversed(mems))}
        except Exception:
            return {"memories": []}

    def delete_memory(self, mid):
        if not self._state.brain:
            return {"ok": False}
        try:
            with self._state.brain._lock:
                ok = self._state.brain.ltm.delete(mid)
            return {"ok": ok}
        except Exception:
            return {"ok": False}

    def update_memory(self, mid, content):
        if not self._state.brain:
            return {"ok": False}
        try:
            with self._state.brain._lock:
                ok = self._state.brain.ltm.update(mid, content)
            return {"ok": ok}
        except Exception:
            return {"ok": False}

    def add_memory(self, content, layer="episodic"):
        if not self._state.brain:
            return {"ok": False}
        try:
            with self._state.brain._lock:
                self._state.brain.ltm.add(content, layer=layer)
            return {"ok": True}
        except Exception:
            return {"ok": False}

    def promote_memory(self, mid):
        if not self._state.brain:
            return {"ok": False}
        try:
            with self._state.brain._lock:
                ok = self._state.brain.ltm.promote_to_core(mid)
            return {"ok": ok}
        except Exception:
            return {"ok": False}

    def delete_all_memories(self):
        if not self._state.brain:
            return {"ok": False}
        try:
            with self._state.brain._lock:
                self._state.brain.ltm.delete_all()
            return {"ok": True}
        except Exception:
            return {"ok": False}

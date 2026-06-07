"""
长期记忆管理 —— 三层架构
========================
Layer 1: 核心事实 (core)    — max 10,  手动 pin, 永不过期
Layer 2: 近期偏好 (preference) — max 20, 引用+score, 衰减, 可降级
Layer 3: 情境记忆 (episodic)  — max 30, 衰减快, 引用多可晋升

存储: %APPDATA%/AI-Pet/memory.json (原子写入)
"""
import os
import json
import uuid
import threading
from datetime import datetime

from config import MAX_LONG_TERM_MEMORIES, STORAGE_DIR_NAME

MAX_CORE = 10
MAX_PREFERENCE = 20
MAX_EPISODIC = 30

LAYER_WEIGHTS = {"core": 1.0, "preference": 0.8, "episodic": 0.6}
DECAY_RATES = {"preference": 0.95, "episodic": 0.85}

_now = datetime.now


def _default_memory(content="", layer="episodic", category="fact"):
    return {
        "id": str(uuid.uuid4())[:8],
        "content": content,
        "timestamp": _now().isoformat(),
        "category": category,
        "layer": layer,
        "score": 1.0,
        "last_referenced": _now().isoformat(),
        "reference_count": 0,
    }


class LongTermMemory:
    def __init__(self):
        appdata = os.getenv("APPDATA") or os.path.expanduser("~")
        self._storage_dir = os.path.join(appdata, STORAGE_DIR_NAME)
        self._file_path = os.path.join(self._storage_dir, "memory.json")
        os.makedirs(self._storage_dir, exist_ok=True)

        self._lock = threading.Lock()
        self._memories: list[dict] = []
        self._load()

    # ========== 公开方法 ==========

    def add(self, content: str, layer: str = "episodic", category: str = "fact") -> dict:
        with self._lock:
            memory = _default_memory(content, layer, category)
            self._memories.append(memory)
            self._trim_layer(layer)
            self._save()
            return memory

    def search(self, query: str, limit: int = 5) -> list[dict]:
        if not query.strip():
            return []

        with self._lock:
            query_lower = query.lower()
            scored = []
            for m in self._memories:
                content_lower = m["content"].lower()
                kw_score = 0
                if query_lower in content_lower:
                    kw_score += 3
                for word in query_lower.split():
                    if word in content_lower:
                        kw_score += 1
                if kw_score <= 0:
                    continue
                layer_w = LAYER_WEIGHTS.get(m.get("layer", "episodic"), 0.6)
                ref_bonus = min(0.5, m.get("reference_count", 0) * 0.08)
                final = kw_score * (layer_w + ref_bonus) * m.get("score", 1.0)
                scored.append((final, m))

            scored.sort(key=lambda x: x[0], reverse=True)
            results = [m for _, m in scored[:limit]]
            for m in results:
                m["last_referenced"] = _now().isoformat()
                m["reference_count"] = m.get("reference_count", 0) + 1
                m["score"] = min(1.0, m.get("score", 1.0) + 0.15)
            return results

    def decay_all(self):
        with self._lock:
            changed = False
            now = _now().isoformat()
            for m in self._memories:
                layer = m.get("layer", "episodic")
                if layer == "core":
                    continue
                rate = DECAY_RATES.get(layer, 0.85)
                m["score"] = round(m.get("score", 1.0) * rate, 4)
                changed = True
                if m["score"] <= 0.05:
                    continue
                if m["score"] < 0.3 and layer == "preference" and m.get("reference_count", 0) < 2:
                    m["layer"] = "episodic"
                if m.get("reference_count", 0) >= 3 and layer == "episodic" and m["score"] > 0.4:
                    m["layer"] = "preference"
            self._memories = [m for m in self._memories if m.get("score", 0) > 0.05]
            for layer in ("core", "preference", "episodic"):
                self._trim_layer(layer)
            if changed:
                self._save()

    def promote_to_core(self, mid: str) -> bool:
        with self._lock:
            for m in self._memories:
                if m["id"] == mid:
                    m["layer"] = "core"
                    m["score"] = 1.0
                    self._trim_layer("core")
                    self._save()
                    return True
            return False

    def get_by_layer(self, layer: str) -> list[dict]:
        with self._lock:
            return [m for m in self._memories if m.get("layer") == layer]

    def get_all(self) -> list[dict]:
        with self._lock:
            return list(self._memories)

    def get_count(self) -> int:
        with self._lock:
            return len(self._memories)

    def delete(self, mid: str) -> bool:
        with self._lock:
            before = len(self._memories)
            self._memories = [m for m in self._memories if m["id"] != mid]
            if len(self._memories) < before:
                self._save()
                return True
            return False

    def update(self, mid: str, content: str) -> bool:
        with self._lock:
            for m in self._memories:
                if m["id"] == mid:
                    m["content"] = content
                    m["timestamp"] = _now().isoformat()
                    self._save()
                    return True
            return False

    def delete_all(self) -> None:
        with self._lock:
            self._memories = []
            if os.path.exists(self._file_path):
                try:
                    os.remove(self._file_path)
                except OSError:
                    pass

    # ========== 内部方法 ==========

    def _trim_layer(self, layer: str):
        limits = {"core": MAX_CORE, "preference": MAX_PREFERENCE, "episodic": MAX_EPISODIC}
        cap = limits.get(layer, MAX_LONG_TERM_MEMORIES)
        layer_mems = [m for m in self._memories if m.get("layer") == layer]
        if len(layer_mems) <= cap:
            return
        layer_mems.sort(
            key=lambda m: (m.get("score", 0), m.get("reference_count", 0)),
            reverse=True,
        )
        keep_ids = {m["id"] for m in layer_mems[:cap]}
        self._memories = [m for m in self._memories if m.get("layer") != layer or m["id"] in keep_ids]

    def _migrate_old(self, data: list) -> list:
        for m in data:
            if "layer" not in m:
                cat = m.get("category", "fact")
                if cat == "preference":
                    m["layer"] = "preference"
                elif cat == "event":
                    m["layer"] = "episodic"
                else:
                    m["layer"] = "episodic"
            m.setdefault("score", 1.0)
            m.setdefault("last_referenced", m.get("timestamp", _now().isoformat()))
            m.setdefault("reference_count", 0)
        return data

    def _load(self):
        if os.path.exists(self._file_path):
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                self._memories = self._migrate_old(raw)
            except (json.JSONDecodeError, OSError):
                import logging
                logging.getLogger("agent.memory").warning(
                    "memory.json 加载失败, 已有记忆可能丢失", exc_info=True,
                )
                self._memories = []

    def _save(self):
        tmp_path = self._file_path + ".tmp"
        try:
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(self._memories, f, ensure_ascii=False, indent=2)
            os.replace(tmp_path, self._file_path)
        except OSError:
            import logging
            logging.getLogger("agent.memory").warning(
                "memory.json 保存失败", exc_info=True,
            )

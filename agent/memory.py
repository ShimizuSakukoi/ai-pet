"""
长期记忆管理 —— 跨会话记住主人的喜好和重要信息
====================================================
工作原理：
  1. 每次对话结束后，Agent 判断是否有"值得记住"的信息
  2. 如果有，存入内存 → 定期 flush 到磁盘 JSON
  3. 下次对话时，根据用户消息检索相关的记忆注入上下文

存储位置：
  系统 AppData 目录下的 AI-Pet 文件夹（不污染项目目录）
  例如：C:/Users/xxx/AppData/Roaming/AI-Pet/memory.json

记忆格式：
  [
    {
      "id": "uuid",
      "content": "主人喜欢喝咖啡，不加糖",
      "timestamp": "2025-01-15T10:30:00",
      "category": "preference"  // preference / fact / event
    }
  ]

清除记忆：
  调用 delete_all() 清空内存 + 删除磁盘文件
"""

import os
import json
import uuid
from datetime import datetime
from config import MAX_LONG_TERM_MEMORIES


class LongTermMemory:
    """
    长期记忆管理器

    用法:
      ltm = LongTermMemory()
      ltm.add("主人喜欢喝咖啡")
      results = ltm.search("咖啡", limit=3)
      ltm.delete_all()
    """

    def __init__(self):
        # 存储路径：系统 AppData 下
        appdata = os.getenv("APPDATA") or os.path.expanduser("~")
        self._storage_dir = os.path.join(appdata, "AI-Pet")
        self._file_path = os.path.join(self._storage_dir, "memory.json")
        os.makedirs(self._storage_dir, exist_ok=True)

        # 内存缓存（写入磁盘前的临时存储）
        self._memories: list[dict] = []
        self._load()

    # ========== 公开方法 ==========

    def add(self, content: str, category: str = "fact") -> dict:
        """添加一条记忆"""
        memory = {
            "id": str(uuid.uuid4())[:8],
            "content": content,
            "timestamp": datetime.now().isoformat(),
            "category": category,
        }
        self._memories.append(memory)
        if len(self._memories) > MAX_LONG_TERM_MEMORIES:
            self._memories = self._memories[-MAX_LONG_TERM_MEMORIES:]
        self._save()
        return memory

    def search(self, query: str, limit: int = 3) -> list[dict]:
        """
        检索记忆（简易关键词匹配）

        注意：这是玩具级实现。生产环境应使用 embedding + 向量数据库
        来做语义搜索，但那样需要额外的 embedding API 调用。
        对于桌宠项目，关键词匹配已经足够可用。
        """
        if not query.strip():
            return []

        query_lower = query.lower()
        scored = []
        for m in self._memories:
            content_lower = m["content"].lower()
            # 简单得分：完全匹配 +2，部分包含 +1
            score = 0
            if query_lower in content_lower:
                score += 2
            for word in query_lower.split():
                if word in content_lower:
                    score += 1
            if score > 0:
                scored.append((score, m))

        # 按得分降序排列，取前 limit 条
        scored.sort(key=lambda x: x[0], reverse=True)
        return [m for _, m in scored[:limit]]

    def get_all(self) -> list[dict]:
        """获取所有记忆（调试用）"""
        return self._memories

    def get_count(self) -> int:
        """记忆条数"""
        return len(self._memories)

    def delete(self, mid: str) -> bool:
        """删除单条记忆"""
        before = len(self._memories)
        self._memories = [m for m in self._memories if m["id"] != mid]
        if len(self._memories) < before:
            self._save()
            return True
        return False

    def update(self, mid: str, content: str) -> bool:
        """修改单条记忆内容"""
        for m in self._memories:
            if m["id"] == mid:
                m["content"] = content
                m["timestamp"] = datetime.now().isoformat()
                self._save()
                return True
        return False

    def delete_all(self) -> None:
        """
        一键清除所有记忆
        同时清空内存 + 删除磁盘文件
        """
        self._memories = []
        if os.path.exists(self._file_path):
            os.remove(self._file_path)

    # ========== 内部方法 ==========

    def _load(self):
        """从磁盘加载记忆"""
        if os.path.exists(self._file_path):
            try:
                with open(self._file_path, "r", encoding="utf-8") as f:
                    self._memories = json.load(f)
            except (json.JSONDecodeError, IOError):
                self._memories = []

    def _save(self):
        """保存记忆到磁盘"""
        try:
            with open(self._file_path, "w", encoding="utf-8") as f:
                json.dump(self._memories, f, ensure_ascii=False, indent=2)
        except IOError:
            pass  # 保存失败不崩溃，下次再试

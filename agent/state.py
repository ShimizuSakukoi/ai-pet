"""
状态定义 —— 定义宠物的"大脑"中有哪些数据
=============================================
LangGraph 的核心概念：
  State 是一个 TypedDict，在图中的每个节点间流转。
  每个节点可以读取 State，也可以返回部分字段来更新它。

字段说明：
  messages     - 对话历史（add_messages 表示追加，不覆盖旧消息）
  mood         - 当前情绪：happy | sad | angry | sleepy | excited | neutral
  friendship   - 好感度：0-100（越高越亲近）
  _memory_text - 临时字段：在 call_model 和 after_model 之间传递待保存的记忆文本
                 下划线前缀表示这是内部传递字段，不暴露给前端
"""

from typing import Annotated, TypedDict, Optional
from langgraph.graph.message import add_messages


class PetState(TypedDict):
    messages: Annotated[list, add_messages]
    mood: str
    friendship: int
    _memory_text: Optional[str]

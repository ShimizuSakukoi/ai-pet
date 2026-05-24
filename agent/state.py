"""
状态定义 —— 定义宠物的"大脑"中有哪些数据
=============================================
LangGraph 的核心概念：
  State 是一个 TypedDict，在图中的每个节点间流转。
  每个节点可以读取 State，也可以返回部分字段来更新它。

字段说明：
  messages     - 对话历史（add_messages 表示追加，不覆盖旧消息）
  summary      - 历史对话摘要（默认替换模式）
  mood         - 当前情绪：happy | sad | angry | sleepy | excited | neutral
  friendship   - 好感度：0-100（越高越亲近）
  _memory_text - 临时字段：在 call_model 和 after_model 之间传递待保存的记忆文本
                 下划线前缀表示这是内部传递字段，不暴露给前端
"""

from typing import Annotated, TypedDict
from langgraph.graph.message import add_messages


class PetState(TypedDict):
    """
    宠物的完整状态定义

    annotate[list, add_messages] 的含义：
      节点返回 {"messages": [new_msg]} 时，
      不会覆盖旧的 messages，而是追加到消息列表中。
      这让 LangGraph 自动管理对话历史的增删。

    _memory_text：
      在 call_model 节点中由 LLM 输出，在 after_model 节点中被持久化到磁盘。
      前端的 get_status 不会看到此字段。
    """
    messages: Annotated[list, add_messages]
    summary: str
    mood: str
    friendship: int
    _memory_text: str

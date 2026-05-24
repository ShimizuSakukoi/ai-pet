"""
bridge/ —— 前后端通信层
========================
负责 Python（LangGraph Agent）与前端（HTML/JS）之间的消息中转。

通信方式：
  pywebview 的内置 JS Bridge —— 前端通过 pywebview.api.xxx() 调用 Python 方法

消息路由设计：
  - "chat"  → 对话
  - "reset" → 清除所有记忆
  - "status" → 获取当前状态
  - "setup"  → 首次配置（API Key / 宠物类型等）

扩展方式：
  想加新功能？在 ROUTES 字典里加一个 key，然后写对应的处理函数即可。
"""

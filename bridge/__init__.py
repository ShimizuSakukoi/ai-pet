"""
bridge/ —— 前后端通信层
========================
负责 Python（LangGraph Agent）与前端（HTML/JS）之间的消息中转。

子模块：
  - handler.py   : BridgeHandler 路由（组合以下三个管理器）
  - settings.py  : SettingsManager（配置存取 & LLM 连接测试）
  - windows.py   : WindowManager（窗口控制 & 模型切换 & 开机自启）
  - memory_api.py: MemoryController（长期记忆 CRUD）

通信方式：
  pywebview 的内置 JS Bridge —— 前端通过 pywebview.api.xxx() 调用 Python 方法
"""

from bridge.handler import BridgeHandler  # noqa: F401

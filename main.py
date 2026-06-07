"""
项目入口 —— 启动双窗口桌面角色
================================
两个独立的 frameless 窗口：
  1. 角色窗口（pet.html）：Live2D 角色，easy_drag 整个窗口可拖拽
  2. 聊天窗口（chat.html）：对话 & 设置 & 记忆管理，标题栏可拖拽

启动流程：
  1. 创建 BridgeHandler
  2. 创建角色窗口（400×520）
  3. 创建聊天窗口（420×560）
  4. 启动系统托盘（独立线程）
  5. 进入 webview 事件循环
"""
import os
import sys
import threading

import webview

from bridge.handler import BridgeHandler
from tray import run_tray
from agent.logger import get_logger

logger = get_logger("main")


def get_ui_path():
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "ui")
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")


def main():
    handler = BridgeHandler()

    ui_dir = get_ui_path()
    pet_html = os.path.join(ui_dir, "pet.html")
    chat_html = os.path.join(ui_dir, "chat.html")

    for path in (pet_html, chat_html):
        if not os.path.exists(path):
            logger.error(f"找不到 UI 文件: {path}")
            sys.exit(1)

    pet_window = webview.create_window(
        title="AI Pet",
        url=pet_html,
        js_api=handler,
        width=400,
        height=520,
        resizable=True,
        frameless=True,
        easy_drag=True,
        transparent=True,
        on_top=False,
        x=800,
        y=200,
    )

    chat_window = webview.create_window(
        title="AI Pet Chat",
        url=chat_html,
        js_api=handler,
        width=420,
        height=560,
        resizable=True,
        frameless=True,
        easy_drag=True,
        on_top=False,
        x=200,
        y=100,
    )

    handler._state.pet_window = pet_window
    handler._state.chat_window = chat_window

    windows_ready = threading.Event()
    windows_ready.set()
    tray_thread = threading.Thread(
        target=run_tray, args=(handler, windows_ready), daemon=True,
    )
    tray_thread.start()

    webview.start(debug=False)


if __name__ == "__main__":
    main()

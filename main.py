"""
项目入口 —— 启动双窗口桌面宠物
=================================
两个独立的 frameless 窗口：
  1. 宠物窗口（pet.html）：Live2D 角色 + 心情标签，easy_drag 整个窗口可拖拽
  2. 聊天窗口（chat.html）：对话 & 设置 & 记忆管理，标题栏可拖拽

两个窗口共享同一个 BridgeHandler（同一个 PetBrain 实例），
跨窗口通信通过 evaluate_js 实现（如：宠物抚摸 → 聊天窗口显示回复）

启动流程：
  1. 创建 BridgeHandler
  2. 创建宠物窗口（400×520）
  3. 创建聊天窗口（420×550）
  4. 启动系统托盘（独立线程）
  5. 进入 webview 事件循环

运行方式：
  - 开发：.venv\\Scripts\\python.exe main.py
  - 打包后：双击 dist/AI-Pet.exe
"""

import os
import sys
import threading
import webview
from PIL import Image, ImageDraw

from bridge.handler import BridgeHandler
from config import WINDOW_TITLE


def get_ui_path():
    """
    获取 UI 文件所在的绝对路径
    兼容开发模式和 PyInstaller 打包模式
    """
    if getattr(sys, "frozen", False):
        return os.path.join(sys._MEIPASS, "ui")
    else:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "ui")


def _create_tray_icon():
    """
    生成系统托盘图标（64x64 猫耳朵头像）
    Pillow 绘制简单像素猫脸：红色圆脸 + 三角耳朵 + 眼睛 + 鼻子
    """
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 猫脸
    draw.ellipse([14, 20, 50, 56], fill="#e94560")
    # 左耳
    draw.polygon([(14, 28), (6, 4), (28, 20)], fill="#e94560")
    # 右耳
    draw.polygon([(50, 28), (58, 4), (36, 20)], fill="#e94560")
    # 眼睛
    draw.ellipse([22, 32, 28, 38], fill="white")
    draw.ellipse([36, 32, 42, 38], fill="white")
    draw.ellipse([24, 34, 26, 36], fill="#16213e")
    draw.ellipse([38, 34, 40, 36], fill="#16213e")
    # 鼻子
    draw.polygon([(31, 40), (33, 40), (32, 42)], fill="#ff6b81")

    return img


def _run_tray(handler):
    """
    在独立 daemon 线程中运行系统托盘
    菜单：
      - 显示 → 恢复两个窗口
      - 隐藏 → 最小化两个窗口
      - 切换置顶 → 两个窗口同步切换
      - 退出 → 销毁全部
    """
    import pystray

    def on_show(icon, item):
        try:
            handler.window_show()
        except Exception:
            pass

    def on_hide(icon, item):
        try:
            handler._state.chat_window.hide()
            handler._state.pet_window.hide()
        except Exception:
            pass

    def on_toggle_top(icon, item):
        try:
            handler.toggle_on_top()
        except Exception:
            pass

    def on_quit(icon, item):
        icon.stop()
        handler.quit_app()

    icon = pystray.Icon(
        "ai-pet",
        _create_tray_icon(),
        WINDOW_TITLE,
        menu=pystray.Menu(
            pystray.MenuItem("显示", on_show, default=True),
            pystray.MenuItem("隐藏", on_hide),
            pystray.MenuItem("切换置顶", on_toggle_top),
            pystray.MenuItem("退出", on_quit),
        ),
    )
    icon.run()


def main():
    """
    主函数 —— 创建两个独立窗口
    """
    handler = BridgeHandler()

    ui_dir = get_ui_path()
    pet_html = os.path.join(ui_dir, "pet.html")
    chat_html = os.path.join(ui_dir, "chat.html")

    # 验证文件存在
    for path in (pet_html, chat_html):
        if not os.path.exists(path):
            print(f"[错误] 找不到 UI 文件: {path}")
            sys.exit(1)

    # ====== 窗口 1：宠物窗口 ======
    # easy_drag=True → 整个窗口任意位置可拖拽
    # transparent=True → 窗口背景透明，Live2D 角色浮于桌面
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
    )

    # ====== 窗口 2：聊天窗口 ======
    # easy_drag=False → 按钮可点击；标题栏拖拽由 JS 自行实现
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

    # 把两个窗口引用注入 handler（用于跨窗口通信 + 窗口控制）
    handler._state.pet_window = pet_window
    handler._state.chat_window = chat_window

    # 启动系统托盘（独立 daemon 线程，不阻塞主事件循环）
    tray_thread = threading.Thread(target=_run_tray, args=(handler,), daemon=True)
    tray_thread.start()

    # 进入 webview 事件循环（阻塞，直到所有窗口关闭）
    webview.start(debug=False)


if __name__ == "__main__":
    main()

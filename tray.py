"""
系统托盘
=========
在独立 daemon 线程中运行，提供显示/隐藏/置顶/退出菜单。
"""
from PIL import Image, ImageDraw
from config import WINDOW_TITLE


def create_tray_icon():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw.ellipse([14, 20, 50, 56], fill="#e94560")
    draw.polygon([(14, 28), (6, 4), (28, 20)], fill="#e94560")
    draw.polygon([(50, 28), (58, 4), (36, 20)], fill="#e94560")
    draw.ellipse([22, 32, 28, 38], fill="white")
    draw.ellipse([36, 32, 42, 38], fill="white")
    draw.ellipse([24, 34, 26, 36], fill="#16213e")
    draw.ellipse([38, 34, 40, 36], fill="#16213e")
    draw.polygon([(31, 40), (33, 40), (32, 42)], fill="#ff6b81")

    return img


def run_tray(handler, windows_ready=None):
    import pystray
    from agent.logger import get_logger

    logger = get_logger("tray")
    if windows_ready:
        windows_ready.wait()

    def on_show(icon, item):
        try:
            handler.window_show()
        except Exception:
            logger.warning("tray on_show失败", exc_info=True)

    def on_hide(icon, item):
        try:
            handler._state.chat_window.hide()
            handler._state.pet_window.hide()
        except Exception:
            logger.warning("tray on_hide失败", exc_info=True)

    def on_toggle_top(icon, item):
        try:
            handler.toggle_on_top()
        except Exception:
            logger.warning("tray toggle_on_top失败", exc_info=True)

    def on_quit(icon, item):
        icon.stop()
        try:
            handler.quit_app()
        except Exception:
            logger.warning("tray quit失败", exc_info=True)

    icon = pystray.Icon(
        "ai-pet",
        create_tray_icon(),
        WINDOW_TITLE,
        menu=pystray.Menu(
            pystray.MenuItem("显示", on_show, default=True),
            pystray.MenuItem("隐藏", on_hide),
            pystray.MenuItem("切换置顶", on_toggle_top),
            pystray.MenuItem("退出", on_quit),
        ),
    )
    icon.run()

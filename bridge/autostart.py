"""
开机自启管理 —— Windows Startup 文件夹 .bat 文件
"""
import os
import sys as _sys


def _startup_dir():
    return os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"),
        "Microsoft", "Windows", "Start Menu", "Programs", "Startup",
    )


def _bat_path():
    return os.path.join(_startup_dir(), "AI-Pet.bat")


def get_autostart():
    return {"enabled": os.path.exists(_bat_path())}


def set_autostart(enable):
    os.makedirs(_startup_dir(), exist_ok=True)
    bat_path = _bat_path()

    if enable:
        exe_path = _sys.executable
        if getattr(_sys, "frozen", False):
            target = exe_path
            content = f'@echo off\nstart "" "{target}"\n'
        else:
            target = os.path.join(os.path.dirname(exe_path), "python.exe")
            cwd = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            script = os.path.join(cwd, "main.py")
            content = f'@echo off\ncd /d "{cwd}"\nstart "" "{target}" "{script}"\n'
        with open(bat_path, "w") as f:
            f.write(content)
    else:
        if os.path.exists(bat_path):
            try:
                os.remove(bat_path)
            except Exception:
                pass

    return {"ok": True}

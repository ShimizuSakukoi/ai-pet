# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 打包配置
运行方式：pyinstaller build.spec
"""
from PyInstaller.utils.hooks import collect_data_files

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("ui", "ui"),
    ],
    hiddenimports=[
        "agent",
        "agent.brain",
        "agent.memory",
        "agent.personality",
        "agent.state",
        "bridge",
        "bridge.handler",
        "bridge.settings",
        "bridge.windows",
        "bridge.memory_api",
        "config",
        "pystray",
        "PIL",
        "PIL.Image",
        "PIL.ImageDraw",
        "requests",
        "langgraph",
        "langgraph.graph",
        "langgraph.checkpoint",
        "langgraph.checkpoint.sqlite",
        "langchain",
        "langchain_openai",
        "langchain_core",
        "langchain_core.messages",
        "webview",
        "webview.platforms.edgechromium",
        "webview.platforms.cef",
        "json",
        "sqlite3",
        "threading",
        "uuid",
        "datetime",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="AI-Pet",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

"""
音频文件解析 —— 从模型目录读取 .ogg/.mp3 并编码为 base64
"""
import os
import sys as _sys


def _model_base():
    if getattr(_sys, "frozen", False):
        return os.path.join(_sys._MEIPASS, "ui", "model")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "ui", "model",
    )


def resolve_audio_dir(model_name, audio_path):
    base = _model_base()
    clean = audio_path.replace("/", os.sep).replace("\\", os.sep)

    direct = os.path.join(base, model_name, clean)
    if os.path.exists(direct):
        return os.path.join(base, model_name)
    direct_audio = os.path.join(base, model_name, "audio", clean)
    if os.path.exists(direct_audio):
        return os.path.join(base, model_name, "audio")

    parts = model_name.replace("\\", "/").split("/")
    if len(parts) >= 2:
        fallback = os.path.join(base, parts[0], clean)
        if os.path.exists(fallback):
            return os.path.join(base, parts[0])
        fallback_audio = os.path.join(base, parts[0], "audio", clean)
        if os.path.exists(fallback_audio):
            return os.path.join(base, parts[0], "audio")

    return os.path.join(base, model_name)


def get_audio(model_name, audio_path):
    import base64

    audio_dir = resolve_audio_dir(model_name, audio_path)
    clean = audio_path.replace("/", os.sep).replace("\\", os.sep)
    file_path = os.path.join(audio_dir, clean)
    resolved = os.path.realpath(file_path)
    base_real = os.path.realpath(audio_dir)
    if not resolved.startswith(base_real):
        return {"audio": None, "mime": ""}
    if not os.path.exists(file_path):
        return {"audio": None, "mime": ""}
    try:
        with open(file_path, "rb") as f:
            data = base64.b64encode(f.read()).decode("utf-8")
        if file_path.endswith(".mp3"):
            mime = "audio/mpeg"
        elif file_path.endswith(".ogg"):
            mime = "audio/ogg"
        else:
            mime = "audio/wav"
        return {"audio": data, "mime": mime}
    except Exception:
        return {"audio": None, "mime": ""}

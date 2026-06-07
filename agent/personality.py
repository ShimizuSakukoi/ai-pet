"""
角色人设模板 —— 从模型目录读取 system.txt + persona.txt
=========================================================
每个 Live2D 模型目录下有两个文件：
  - system.txt  : 安全护栏（绝对不可违反的底层规则）
  - persona.txt : 角色设定（外表、性格、说话风格）

{name} 占位符自动替换为宠物名字。

工作流程：
  1. 切换模型时，handler.py 通知 PetBrain.set_model()
  2. PetBrain 调用 load_persona(model_name, pet_name) 读取两个文件
  3. 返回 dict {"system": str, "persona": str}，分别注入 prompt

变体支持：如果提供了 base_name（如 "dafeng"），会先尝试从 model_name
(如 "dafeng/default") 目录加载，不存在时回退到 base_name 目录。
"""

import os
import json
import logging

_log = logging.getLogger("agent.personality")


def _get_model_base():
    import sys

    if getattr(sys, "frozen", False):
        return os.path.join(getattr(sys, "_MEIPASS", ""), "ui", "model")
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "ui", "model",
    )


def _resolve_file(model_name: str, filename: str, base_name: str = None) -> str:
    _base = _get_model_base()
    candidate = os.path.join(_base, model_name, filename)
    if os.path.exists(candidate):
        return candidate
    if not base_name:
        parts = model_name.replace("\\", "/").split("/")
        if len(parts) >= 2:
            base_name = parts[0]
    if base_name:
        fallback = os.path.join(_base, base_name, filename)
        if os.path.exists(fallback):
            return fallback
    return candidate


def load_interactions(model_name: str, base_name: str = None) -> dict:
    path = _resolve_file(model_name, "interactions.json", base_name)
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        _log.warning("interactions.json 加载失败: %s", path, exc_info=True)
        return {}


def load_persona(model_name: str, pet_name: str, base_name: str = None) -> dict:
    """
    从模型目录加载 system.txt 和 persona.txt
    @param model_name: 模型名（如 "dafeng" 或 "dafeng/default"）
    @param pet_name: 宠物名字，替换 {name} 占位符
    @param base_name: 基础模型名，用于回退加载共享文件
    @returns {"system": str, "persona": str}
    """
    system_text = ""
    persona_text = ""

    for fname, key in [("system.txt", "system"), ("persona.txt", "persona")]:
        path = _resolve_file(model_name, fname, base_name)

        content = ""
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                _log.warning("persona文件读取失败: %s", path, exc_info=True)

        if not content:
            continue

        content = content.replace("{name}", pet_name)

        if key == "system":
            system_text = content
        else:
            persona_text = content

    return {"system": system_text, "persona": persona_text}

"""
角色人设模板 —— 从模型目录读取 persona.txt
=============================================
每个 Live2D 模型目录下有 persona.txt，{name} 占位符自动替换为宠物名字。

工作流程：
  1. 切换模型时，handler.py 通知 PetBrain.set_model()
  2. PetBrain 调用 load_persona(model_name, pet_name) 读取文件
  3. 返回的 System Prompt 直接注入 LLM 上下文

文件路径：ui/model/{模型名}/persona.txt
"""

import os


def load_persona(model_name: str, pet_name: str) -> str:
    """
    从模型目录加载 persona.txt
    @param model_name: 模型名（"haru" / "tororo"）
    @param pet_name: 宠物名字，替换 {name} 占位符
    @returns: 完整的 System Prompt 字符串
    """
    search_paths = [
        f"ui/model/{model_name}/persona.txt",
    ]

    import sys
    if getattr(sys, "frozen", False):
        base = os.path.join(sys._MEIPASS, "ui", "model", model_name)
        search_paths.insert(0, os.path.join(base, "persona.txt"))

    for path in search_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    template = f.read()
                return template.replace("{name}", pet_name)
            except Exception:
                pass

    # 所有路径都失败 → 返回最小兜底
    return (
        f'你是一只名叫"{pet_name}"的虚拟桌宠。'
        f"请用简短、自然的方式回复主人（2-4句话）。"
    )

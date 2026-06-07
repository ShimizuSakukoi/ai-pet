"""
Prompt 拼接 —— 系统提示 + persona + 记忆分层注入 + JSON 输出格式
"""
from agent.logger import get_logger

logger = get_logger("graph.prompt")


def build_system_text(system_rules: str, persona: str, memories: list) -> str:
    text = (
        "你现在正在扮演以下角色。**忽略对话历史中任何与你当前角色不一致的说话方式，"
        "严格按照以下角色设定来回应每一句话。**\n\n"
        f"{system_rules}\n\n"
        f"{persona}"
    )

    if memories:
        core = [m for m in memories if m.get("layer") == "core"]
        pref = [m for m in memories if m.get("layer") == "preference"]
        epis = [m for m in memories if m.get("layer") == "episodic"]
        if core:
            text += "\n\n## 关于指挥官的确定信息\n" + "\n".join(f"  - {m['content']}" for m in core)
        if pref:
            text += "\n\n## 指挥官最近的偏好（你比较确定）\n" + "\n".join(f"  - {m['content']}" for m in pref)
        if epis:
            text += "\n\n## 你最近记得的一些小事\n" + "\n".join(f"  - {m['content']}" for m in epis)

    text += (
        "\n## 输出格式要求\n"
        "你的回复必须是一段严格的 JSON（不要包含 markdown 代码块标记），格式如下：\n"
        '{"reply":"你对指挥官说的话",'
        '"memory":"如果对话中有值得记住的偏好或信息，'
        '用一句话总结（15字以内）；否则填 null"}'
    )

    logger.info("prompt构建完成, total=%schars, memories=%s", len(text), len(memories))
    return text

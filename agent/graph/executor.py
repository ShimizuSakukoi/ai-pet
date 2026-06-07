"""
LLM 执行 —— 调用 LLM + JSON 解析 + 记忆提取
"""
import json

from langchain_core.messages import AIMessage, SystemMessage

from agent.graph.prompt import build_system_text
from agent.logger import get_logger

logger = get_logger("graph.executor")


def call_model(state: dict, system_rules: str, persona: str, llm, ltm) -> dict:
    messages = state.get("messages", [])
    user_input = messages[-1].content if messages else ""

    memories = ltm.search(user_input, limit=5) if user_input else []
    system_text = build_system_text(system_rules, persona, memories)

    full_messages = [SystemMessage(content=system_text)] + list(messages)
    response = llm.invoke(full_messages)
    raw = response.content.strip()
    logger.info("LLM返回, raw=%s", raw[:120])

    reply_text = raw
    memory_text = None
    try:
        clean = raw.replace("```json", "").replace("```", "").strip()
        data = json.loads(clean)
        reply_text = data.get("reply", raw)
        memory_text = data.get("memory")
        if memory_text and str(memory_text).lower() == "null":
            memory_text = None
        elif memory_text and isinstance(memory_text, str):
            memory_text = memory_text.strip()[:50]
    except Exception:
        logger.warning("LLM JSON解析失败,使用原始回复", exc_info=True)

    logger.info("parsed, memory=%s", memory_text)
    return {
        "messages": [AIMessage(content=reply_text)],
        "_memory_text": memory_text,
        "_raw_response": raw,
        "_system_text": system_text,
        "_messages": list(messages),
    }

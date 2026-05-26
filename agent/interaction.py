"""
交互动作 & 每日回顾
===================
从模型 interactions.json 读取提示词，不再硬编码。
"""
import random

from langchain_core.messages import HumanMessage, SystemMessage

from agent.personality import load_interactions
from agent.logger import get_logger

logger = get_logger("interaction")

DEFAULT_PROMPTS = {
    "pet": ["主人摸了摸你"],
    "drag": ["主人拽了你一下"],
    "welcome": ["主人回来了"],
    "idle": ["你很久没说话了，想主动聊聊"],
}


class InteractionHandler:
    def __init__(self, model_name: str, pet_name: str, chat_fn, graph):
        self.model_name = model_name
        self.pet_name = pet_name
        self._chat_fn = chat_fn
        self._graph = graph

    def action(self, action_type: str, thread_id: str = None) -> dict:
        interactions = load_interactions(self.model_name)
        prompts = interactions.get("prompts", DEFAULT_PROMPTS)
        variants = prompts.get(action_type, [f"[{action_type}]"])
        msg = random.choice(variants) if variants else f"[{action_type}]"
        msg = msg.replace("{name}", self.pet_name)
        return self._chat_fn(msg, thread_id or self.model_name)

    def daily_review(self, thread_id: str = None) -> dict:
        try:
            current = self._graph.get_state(thread_id or self.model_name)
            messages = (
                list(current.values.get("messages", []))
                if current and current.values else []
            )
        except Exception:
            messages = []

        if len(messages) < 4:
            return {"text": "今天还没有什么对话呢~", "friendship": 50}

        recent = list(messages[-min(20, len(messages)):])
        convo_text = "\n".join(
            f"{'主人' if isinstance(m, HumanMessage) else self.pet_name}: {m.content}"
            for m in recent
        )

        persona_data = self._load_persona()
        prompt = (
            f"{persona_data['system']}\n{persona_data['persona']}\n\n"
            f"以下是主人和你的今日对话记录：\n{convo_text}\n\n"
            f"请用 2-3 句话总结今天和主人聊了什么，语气保持你自己的风格，"
            f"不要提「总结」「回顾」这些词，就像在自言自语回忆今天。"
        )

        try:
            response = self._graph.llm.invoke([SystemMessage(content=prompt)])
            return {"text": response.content.strip(), "friendship": 50}
        except Exception:
            return {"text": "（今天过得还不错~）", "friendship": 50}

    def _load_persona(self) -> dict:
        from agent.personality import load_persona
        return load_persona(self.model_name, self.pet_name)

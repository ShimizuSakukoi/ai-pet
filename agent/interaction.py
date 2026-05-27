"""
交互动作 & 每日回顾
===================
从模型 interactions.json 读取提示词，不再硬编码。
"""
import random
import json

from langchain_core.messages import HumanMessage, SystemMessage

from agent.personality import load_interactions, load_persona
from agent.logger import get_logger

logger = get_logger("interaction")

DEFAULT_PROMPTS = {
    "touch": ["摸一摸", "拍拍头", "轻抚", "戳一戳"],
    "drag": ["拽一下", "拉一把", "拖一拖"],
    "welcome": ["回来了", "等你很久了"],
    "idle": ["有点寂寞", "好久没说话了", "在吗"],
}


class InteractionHandler:
    def __init__(self, model_name: str, pet_name: str, chat_fn, graph,
                 base_name: str = None):
        self.model_name = model_name
        self.pet_name = pet_name
        self._chat_fn = chat_fn
        self._graph = graph
        self._base_name = base_name

    def action(self, action_type: str, thread_id: str = None) -> dict:
        interactions = load_interactions(self.model_name, self._base_name)
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
            return {"text": "今天还没有什么对话呢~"}

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
            return {"text": response.content.strip()}
        except Exception:
            return {"text": "（今天过得还不错~）"}

    def _load_persona(self) -> dict:
        from agent.personality import load_persona as _lp
        return _lp(self.model_name, self.pet_name, self._base_name)

    def generate_quick_replies(self) -> list:
        persona_data = load_persona(self.model_name, self.pet_name, self._base_name)
        prompt = (
            "你的任务是生成聊天快捷回复按钮的文本。\n\n"
            "聊天对象是以下角色：\n"
            f"{persona_data['persona']}\n\n"
            "请生成6个用户可能对这个角色说的简短句子。\n"
            "规则：从用户视角出发，是用户对角色说的话，不是角色说的话。\n"
            "3-12字，简洁完整，严格JSON数组，不要markdown。\n\n"
            "❌ 禁止以下类型（角色视角，错误示例）：\n"
            "\"早上好\" — 像角色在打招呼，不要\n"
            "\"想和你喝咖啡\" — 像角色在邀请，不要\n"
            "\"过来抱一下\" — 像角色在撒娇，不要\n\n"
            "✅ 正确（用户视角）：\n"
            "\"今天心情怎样\" — 用户在询问\n"
            "\"摸摸头\" — 用户在互动\n"
            "\"一起去玩吧\" — 用户在邀请\n\n"
            "直接返回JSON数组：[\"句子1\", \"句子2\", ...]"
        )
        try:
            response = self._graph.llm.invoke([SystemMessage(content=prompt)])
            raw = response.content.strip()
            clean = raw.replace("```json", "").replace("```", "").strip()
            replies = json.loads(clean)
            if isinstance(replies, list) and len(replies) > 0:
                return [str(r)[:20] for r in replies[:6]]
        except Exception:
            pass
        return ["在干嘛？", "摸摸头", "饿了吗", "讲个笑话", "不理你了", "晚安"]

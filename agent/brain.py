"""
LangGraph 图定义 —— 宠物的核心"大脑"
===========================================
这是整个项目最关键的文件，定义了 Agent 的工作流程：

图结构（节点 → 边）:
  START
    ↓
  [检索长期记忆]  —— 根据用户输入，找相关的历史记忆（无 LLM，快）
    ↓
  [调用 LLM]      —— 一次调用完成：回复 + 情绪分析 + 记忆提取
    ↓
  [后处理]        —— 更新 mood/friendship，保存记忆（无 LLM，快）
    ↓
  END

相比之前少了 2 次 LLM 调用，速度提升约 3 倍

LLM 初始化改为接收 settings dict（由前端设置面板传入），不再读 .env
"""

import os
import json
import sqlite3
import threading
from datetime import datetime
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI

from agent.state import PetState
from agent.personality import load_persona
from agent.memory import LongTermMemory
from agent.logger import get_logger
from config import (
    DEFAULT_PET_NAME,
    DEFAULT_PET_TYPE,
    INITIAL_MOOD,
    INITIAL_FRIENDSHIP,
    LLM_PROVIDERS,
)
from config import STORAGE_DIR_NAME  # noqa: E402

logger = get_logger("brain")


MOOD_LIST = ["happy", "sad", "angry", "sleepy", "excited", "neutral"]


def build_llm_from_settings(settings: dict) -> ChatOpenAI:
    """根据设置字典创建 LLM 实例（不读 .env，纯参数驱动）"""
    provider = settings.get("provider", "deepseek")
    provider_cfg = LLM_PROVIDERS.get(provider, LLM_PROVIDERS["deepseek"])

    api_key = settings.get("api_key", "")
    base_url = settings.get("base_url", provider_cfg["base_url"])
    model_name = settings.get("model_name", provider_cfg["default_model"])

    if not api_key:
        raise ValueError("未提供 API Key")

    return ChatOpenAI(
        model=model_name,
        api_key=api_key,
        base_url=base_url,
        temperature=0.8,
    )


class PetBrain:
    """宠物的"大脑" —— 封装了 LangGraph 图的创建和调用"""

    def __init__(self, pet_type: str = DEFAULT_PET_TYPE, pet_name: str = DEFAULT_PET_NAME,
                 settings: dict = None, model_name: str = "haru"):
        self.pet_type = pet_type
        self.pet_name = pet_name
        self.model_name = model_name
        self._current_settings = settings or {}

        # 1. 初始化 LLM（由 settings 驱动）
        self.llm = build_llm_from_settings(self._current_settings)

        # 2. 加载人设（从模型目录的 system.txt + persona.txt）
        persona_data = load_persona(model_name, pet_name)
        self._system_rules = persona_data["system"]
        self._persona = persona_data["persona"]

        # 3. 长期记忆 + 检查点
        self.ltm = LongTermMemory()
        self._lock = threading.Lock()
        self._rebuild_graph()

    def set_model(self, model_name: str):
        """切换模型时更新性格提示词（无需重建图，只换 Prompt）"""
        self.model_name = model_name
        persona_data = load_persona(model_name, self.pet_name)
        self._system_rules = persona_data["system"]
        self._persona = persona_data["persona"]
        logger.info(f"[SetModel] model={model_name}")

    def _rebuild_graph(self):
        """(重新)构建 LangGraph 图 —— 2 节点，1 次 LLM 调用"""
        builder = StateGraph(PetState)

        builder.add_node("call_model", self._call_model)
        builder.add_node("after_model", self._after_model)

        builder.add_edge(START, "call_model")
        builder.add_edge("call_model", "after_model")
        builder.add_edge("after_model", END)

        # SQLite 持久化：存到 AppData，重启不丢对话
        db_dir = os.path.join(
            os.getenv("APPDATA") or os.path.expanduser("~"), "AI-Pet"
        )
        os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(db_dir, "conversations.db")
        conn = sqlite3.connect(db_path, check_same_thread=False)
        self.checkpointer = SqliteSaver(conn)
        self.graph = builder.compile(checkpointer=self.checkpointer)

    def _log_full_prompt(self, system_text: str, messages: list, response_text: str):
        log_dir = os.path.join(os.getenv("APPDATA") or os.path.expanduser("~"),
                               STORAGE_DIR_NAME, "logs")
        os.makedirs(log_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:19]
        path = os.path.join(log_dir, f"prompt_{timestamp}.txt")
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write("=" * 60 + "\n")
                f.write("SYSTEM PROMPT:\n")
                f.write("=" * 60 + "\n")
                f.write(system_text + "\n\n")
                f.write("=" * 60 + "\n")
                f.write("MESSAGES:\n")
                f.write("=" * 60 + "\n")
                for m in messages:
                    role = type(m).__name__.replace("Message", "").upper()
                    f.write(f"[{role}] {m.content}\n")
                f.write("\n" + "=" * 60 + "\n")
                f.write("RESPONSE:\n")
                f.write("=" * 60 + "\n")
                f.write(response_text + "\n")
            logger.info(f"[Prompt] saved to {os.path.basename(path)}")
        except Exception as e:
            logger.warning(f"[Prompt] save failed: {e}")

    def _call_model(self, state: PetState) -> dict:
        """
        一次 LLM 调用：生成回复 + 情绪分析 + 记忆提取

        要求 LLM 输出 JSON 格式，包含回复、情绪判断和值得记住的信息
        """
        messages = state.get("messages", [])
        mood = state.get("mood", INITIAL_MOOD)
        friendship = state.get("friendship", INITIAL_FRIENDSHIP)

        system_text = (
            f"{self._system_rules}\n\n"
            f"{self._persona}"
        )

        # Layer 3: 注入长期记忆
        memories = self.ltm.search(
            messages[-1].content if messages else "", limit=3
        )
        if memories:
            memory_lines = "\n".join(f"  - {m['content']}" for m in memories)
            system_text += f"\n\n## 你记得关于主人的以下事情：\n{memory_lines}"

        # Layer 4: 当前状态 + 输出格式
        system_text += (
            f"\n\n## 当前状态\n情绪: {mood}\n好感度: {friendship}/100\n"
            f"\n## 输出格式要求\n"
            f"你的回复必须是一段严格的 JSON（不要包含 markdown 代码块标记），格式如下：\n"
            f'{{"reply":"你对主人说的话","mood":"happy/sad/angry/sleepy/excited/neutral",'
            f'"friendship_delta":-5到5的整数,"memory":"如果对话中有值得记住的偏好或信息，'
            f'用一句话总结（10字以内）；否则填 null"}}'
        )

        logger.info(
            f"[Prompt] total={len(system_text)}chars, "
            f"memories={len(memories)}, mood={mood}, friendship={friendship}"
        )

        full_messages = [SystemMessage(content=system_text)] + list(messages)
        response = self.llm.invoke(full_messages)
        raw = response.content.strip()
        logger.info(f"[Raw] {raw[:120]}...")

        # 解析 JSON 回复
        reply_text = raw
        new_mood = mood
        delta = 0
        memory_text = None

        try:
            clean = raw.replace("```json", "").replace("```", "").strip()
            data = json.loads(clean)
            reply_text = data.get("reply", raw)
            # 白名单校验
            raw_mood = data.get("mood", mood)
            new_mood = raw_mood if raw_mood in MOOD_LIST else mood
            delta = max(-5, min(5, int(data.get("friendship_delta", 0) or 0)))
            memory_text = data.get("memory")
            if memory_text and str(memory_text).lower() == "null":
                memory_text = None
            elif memory_text and isinstance(memory_text, str):
                memory_text = memory_text.strip()[:50]
        except Exception:
            pass  # 解析失败就用原始回复

        logger.info(
            f"[Parsed] mood={new_mood}, delta={delta}, friendship={friendship + delta}, "
            f"memory={memory_text}"
        )

        # 存入 state 中的 _parsed 字段供 after_model 使用
        new_friendship = max(0, min(100, friendship + delta))

        self._log_full_prompt(system_text, list(messages), raw)

        return {
            "messages": [AIMessage(content=reply_text)],
            "mood": new_mood,
            "friendship": new_friendship,
            "_memory_text": memory_text,
        }

    def _after_model(self, state: PetState) -> dict:
        """
        后处理：保存长期记忆（无 LLM 调用，只写磁盘）
        """
        memory_text = state.get("_memory_text")
        if memory_text and isinstance(memory_text, str) and len(memory_text) < 100:
            self.ltm.add(memory_text)
            logger.info(f"[Memory] saved: {memory_text}")
        return {}

    # ==================== 互动动作 ====================

    def action(self, action_type: str, friendship_gain: int = 2,
               thread_id: str = "default") -> dict:
        """特殊交互：抚摸/拖拽/归回/搭话，走 LLM 对话"""
        action_prompts = {
            "pet":     "[主人轻轻抚摸了你]",
            "drag":    "[主人拖拽了你一下，你不爽]",
            "welcome": "[主人回来了，打个招呼吧]",
            "idle":    "[主人很久没理你了，你想主动说点什么]",
            "review":  "[回顾一下和主人最近的对话，说点感想]",
        }
        msg = action_prompts.get(action_type, f"[{action_type}]")
        return self.chat(msg, thread_id)

    def daily_review(self, thread_id: str = "default") -> dict:
        """每日回顾：用 LLM 总结昨天的对话"""
        with self._lock:
            config = {"configurable": {"thread_id": thread_id}}
            try:
                current = self.graph.get_state(config)
                messages = list(current.values.get("messages", [])) if current and current.values else []
            except Exception:
                messages = []

            if len(messages) < 4:
                return {"text": "今天还没有什么对话呢~", "mood": "neutral", "friendship": 50}

            # 取最近一轮对话文本
            recent = list(messages[-min(20, len(messages)):])
            convo_text = "\n".join(
                f"{'主人' if isinstance(m, HumanMessage) else self.pet_name}: {m.content}"
                for m in recent
            )

            prompt = (
                f"{self._system_rules}\n{self._persona}\n\n"
                f"以下是主人和你的今日对话记录：\n{convo_text}\n\n"
                f"请用 2-3 句话总结今天和主人聊了什么，语气保持你自己的风格，"
                f"不要提「总结」「回顾」这些词，就像在自言自语回忆今天。"
            )

            try:
                response = self.llm.invoke([SystemMessage(content=prompt)])
                return {"text": response.content.strip(),
                        "mood": "neutral", "friendship": 50}
            except Exception:
                return {"text": "（今天过得还不错~）", "mood": "neutral", "friendship": 50}

    # ==================== 公开方法 ====================

    def chat(self, user_text: str, thread_id: str = "default") -> dict:
        with self._lock:
            config = {"configurable": {"thread_id": thread_id}}
            try:
                current = self.graph.get_state(config)
                old_friendship = (
                    current.values.get("friendship", INITIAL_FRIENDSHIP)
                    if current and current.values else INITIAL_FRIENDSHIP
                )
            except Exception:
                old_friendship = INITIAL_FRIENDSHIP

            result = self.graph.invoke(
                {"messages": [HumanMessage(content=user_text)]}, config
            )

            if result is None:
                return {
                    "text": "（大脑短路了，再说一遍试试？）",
                    "mood": INITIAL_MOOD,
                    "friendship": old_friendship,
                }

            messages = result.get("messages", [])
            ai_text = ""
            for msg in reversed(messages):
                if isinstance(msg, AIMessage):
                    ai_text = msg.content
                    break

            return {
                "text": ai_text or "……（不知道该说什么）",
                "mood": result.get("mood", INITIAL_MOOD),
                "friendship": result.get("friendship", old_friendship),
            }

    def reset(self, thread_id: str = "default") -> dict:
        with self._lock:
            self.ltm.delete_all()
            # 删除 SQLite DB 文件
            try:
                self.checkpointer.conn.close()
            except Exception:
                pass
            db_dir = os.path.join(
                os.getenv("APPDATA") or os.path.expanduser("~"), "AI-Pet"
            )
            db_path = os.path.join(db_dir, "conversations.db")
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception:
                    pass
            self._rebuild_graph()
            return {
                "text": "记忆已全部清除！我们重新认识吧~",
                "mood": INITIAL_MOOD,
                "friendship": INITIAL_FRIENDSHIP,
            }

    def get_status(self, thread_id: str = "default") -> dict:
        try:
            config = {"configurable": {"thread_id": thread_id}}
            current = self.graph.get_state(config)
            if current and current.values:
                return {
                    "mood": current.values.get("mood", INITIAL_MOOD),
                    "friendship": current.values.get("friendship", INITIAL_FRIENDSHIP),
                    "memories_count": self.ltm.get_count(),
                }
        except Exception:
            pass
        return {
            "mood": INITIAL_MOOD,
            "friendship": INITIAL_FRIENDSHIP,
            "memories_count": 0,
        }

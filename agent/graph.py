"""
LangGraph 图定义 —— 2 节点 1 次 LLM 调用
==========================================
PetGraph 封装了图创建、call_model、after_model 和执行。
日志写入和记忆存盘使用线程异步，不阻塞 LLM 回复。
"""
import os
import json
import sqlite3
import threading
from datetime import datetime

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from agent.state import PetState
from agent.logger import get_logger
from config import STORAGE_DIR_NAME

logger = get_logger("graph")


class PetGraph:
    def __init__(self, system_rules: str, persona: str, llm, ltm,
                 pet_name: str = ""):
        self._system_rules = system_rules
        self._persona = persona
        self.llm = llm
        self.ltm = ltm
        self.pet_name = pet_name
        self.graph = None
        self.checkpointer = None
        self._rebuild()

    def _rebuild(self):
        builder = StateGraph(PetState)

        builder.add_node("call_model", self._call_model)
        builder.add_node("after_model", self._after_model)

        builder.add_edge(START, "call_model")
        builder.add_edge("call_model", "after_model")
        builder.add_edge("after_model", END)

        db_dir = os.path.join(
            os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME
        )
        os.makedirs(db_dir, exist_ok=True)
        db_path = os.path.join(db_dir, "conversations.db")
        conn = sqlite3.connect(db_path, check_same_thread=False)
        self.checkpointer = SqliteSaver(conn)
        self.graph = builder.compile(checkpointer=self.checkpointer)

    def _call_model(self, state: PetState) -> dict:
        messages = state.get("messages", [])

        system_text = (
            "你现在正在扮演以下角色。**忽略对话历史中任何与你当前角色不一致的说话方式，"
            "严格按照以下角色设定来回应每一句话。**\n\n"
            f"{self._system_rules}\n\n"
            f"{self._persona}"
        )

        user_input = messages[-1].content if messages else ""
        if user_input:
            memories = self.ltm.search(user_input, limit=3)
        else:
            memories = []

        if memories:
            memory_lines = "\n".join(f"  - {m['content']}" for m in memories)
            system_text += f"\n\n## 你记得关于主人的以下事情：\n{memory_lines}"

        system_text += (
            "\n## 输出格式要求\n"
            "你的回复必须是一段严格的 JSON（不要包含 markdown 代码块标记），格式如下：\n"
            '{"reply":"你对主人说的话",'
            '"memory":"如果对话中有值得记住的偏好或信息，'
            '用一句话总结（10字以内）；否则填 null"}'
        )

        logger.info(
            f"[Prompt] total={len(system_text)}chars, "
            f"memories={len(memories)}"
        )

        full_messages = [SystemMessage(content=system_text)] + list(messages)
        response = self.llm.invoke(full_messages)
        raw = response.content.strip()
        logger.info(f"[Raw] {raw[:120]}...")

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
            pass

        logger.info(f"[Parsed] memory={memory_text}")

        threading.Thread(
            target=self._log_full_prompt,
            args=(system_text, list(messages), raw),
            daemon=True,
        ).start()

        return {
            "messages": [AIMessage(content=reply_text)],
            "_memory_text": memory_text,
        }

    def _after_model(self, state: PetState) -> dict:
        memory_text = state.get("_memory_text")
        if memory_text and isinstance(memory_text, str) and len(memory_text) < 100:
            threading.Thread(
                target=self.ltm.add, args=(memory_text,), daemon=True
            ).start()
        return {}

    def _log_full_prompt(self, system_text: str, messages: list, response_text: str):
        log_dir = os.path.join(
            os.getenv("APPDATA") or os.path.expanduser("~"),
            STORAGE_DIR_NAME, "logs",
        )
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

    def invoke(self, user_text: str, thread_id: str) -> dict:
        return self.graph.invoke(
            {"messages": [HumanMessage(content=user_text)]},
            {"configurable": {"thread_id": thread_id}},
        )

    def get_state(self, thread_id: str):
        return self.graph.get_state(
            {"configurable": {"thread_id": thread_id}}
        )

    def close(self):
        if self.checkpointer:
            try:
                self.checkpointer.conn.close()
            except Exception:
                pass

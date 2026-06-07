"""
图构建 —— SQLite 连接 + WAL + LangGraph 编译
"""
import os
import sqlite3

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.sqlite import SqliteSaver

from agent.state import PetState
from config import STORAGE_DIR_NAME


def _db_path():
    db_dir = os.path.join(
        os.getenv("APPDATA") or os.path.expanduser("~"), STORAGE_DIR_NAME
    )
    os.makedirs(db_dir, exist_ok=True)
    return os.path.join(db_dir, "conversations.db")


def build_graph(call_model_fn, after_model_fn):
    builder = StateGraph(PetState)
    builder.add_node("call_model", call_model_fn)
    builder.add_node("after_model", after_model_fn)
    builder.add_edge(START, "call_model")
    builder.add_edge("call_model", "after_model")
    builder.add_edge("after_model", END)

    conn = sqlite3.connect(_db_path(), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    checkpointer = SqliteSaver(conn)
    return builder.compile(checkpointer=checkpointer), checkpointer

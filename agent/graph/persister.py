"""
持久化 —— invoke / get_state / close
"""
from langchain_core.messages import HumanMessage


def invoke_graph(graph, user_text: str, thread_id: str) -> dict:
    return graph.invoke(
        {"messages": [HumanMessage(content=user_text)]},
        {"configurable": {"thread_id": thread_id}},
    )


def get_graph_state(graph, thread_id: str):
    return graph.get_state(
        {"configurable": {"thread_id": thread_id}}
    )


def close_checkpointer(checkpointer) -> None:
    if checkpointer:
        from agent.logger import get_logger
        logger = get_logger("graph.persister")
        try:
            checkpointer.conn.close()
        except Exception:
            logger.warning("checkpointer关闭失败", exc_info=True)

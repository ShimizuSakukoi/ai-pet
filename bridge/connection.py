"""
LLM 连接测试
"""
from agent.llm import build_llm_from_settings
from bridge.utils import safe_err


def test_connection(settings):
    try:
        llm = build_llm_from_settings(settings)
        resp = llm.invoke("请回复一个字：嗨")
        return {"ok": True, "test_reply": resp.content.strip()}
    except Exception as e:
        return {"ok": False, "error": safe_err(e)}

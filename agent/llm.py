"""
LLM 构建 —— 从 settings dict 创建 ChatOpenAI 实例
=================================================
不读 .env，纯参数驱动，前端设置面板传什么就用什么。
"""
from langchain_openai import ChatOpenAI
from config import LLM_PROVIDERS


def build_llm_from_settings(settings: dict) -> ChatOpenAI:
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

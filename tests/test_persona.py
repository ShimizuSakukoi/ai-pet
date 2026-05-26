"""Persona 加载 & interactions 测试"""
from agent.personality import load_persona, load_interactions


def test_dafeng_persona():
    data = load_persona("dafeng", "指挥官")
    assert data["system"], "dafeng system 应为非空"
    assert data["persona"], "dafeng persona 应为非空"


def test_persona_name_replacement():
    data = load_persona("dafeng", "大鳳")
    assert "{name}" not in data["system"], "system 中 {name} 未替换"
    assert "{name}" not in data["persona"], "persona 中 {name} 未替换"


def test_fallback():
    data = load_persona("nonexistent", "测试")
    assert data["system"], "fallback system 应为非空"
    assert data["persona"], "fallback persona 应为非空"
    assert "测试" in data["system"] or "测试" in data["persona"], \
        "fallback 缺少 pet_name"


def test_dafeng_interactions():
    data = load_interactions("dafeng")
    assert "zones" in data, "dafeng interactions 缺少 zones"
    assert "prompts" in data, "dafeng interactions 缺少 prompts"
    assert all(
        a in data["prompts"] for a in ["pet", "drag", "welcome", "idle"]
    ), "缺少 action prompts"


def test_interactions_fallback():
    data = load_interactions("nonexistent")
    assert data == {}, "不存在的模型应返回空 dict"

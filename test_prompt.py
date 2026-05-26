"""Prompt 回归测试：确保 persona 加载 + JSON 输出格式正确"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agent.personality import load_persona


def test_haru_persona():
    data = load_persona("haru", "小橘")
    assert "安全护栏" in data["system"], "haru system 缺少安全护栏"
    assert "人类少女" in data["system"], "haru system 缺少人类少女"
    assert "元气少女" in data["persona"], "haru persona 缺少元气少女"
    print("[PASS] test_haru_persona")


def test_tororo_persona():
    data = load_persona("tororo", "嘟噜")
    assert "外星" in data["system"], "tororo system 缺少外星"
    assert "漂浮生物" in data["persona"], "tororo persona 缺少漂浮生物"
    print("[PASS] test_tororo_persona")


def test_persona_name_replacement():
    data = load_persona("haru", "小橘")
    assert "{name}" not in data["system"], "system 中 {name} 未替换"
    assert "{name}" not in data["persona"], "persona 中 {name} 未替换"
    assert "小橘" in data["system"], "system 中缺少宠物名"
    assert "小橘" in data["persona"], "persona 中缺少宠物名"
    print("[PASS] test_persona_name_replacement")


def test_fallback():
    data = load_persona("nonexistent", "测试")
    assert "测试" in data["system"] or "桌宠" in data["system"], "fallback system 失败"
    assert "测试" in data["persona"] or "桌宠" in data["persona"], "fallback persona 失败"
    print("[PASS] test_fallback")


if __name__ == "__main__":
    test_haru_persona()
    test_tororo_persona()
    test_persona_name_replacement()
    test_fallback()
    print("\n所有测试通过！")

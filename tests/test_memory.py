"""记忆 CRUD 测试"""

from agent.memory import LongTermMemory


def test_add_memory():
    ltm = LongTermMemory()
    count_before = ltm.get_count()
    m = ltm.add("主人喜欢喝咖啡")
    assert m["content"] == "主人喜欢喝咖啡"
    assert "id" in m
    assert "timestamp" in m
    assert ltm.get_count() == count_before + 1
    ltm.delete_all()


def test_search_memory():
    ltm = LongTermMemory()
    ltm.add("主人喜欢喝咖啡不加糖")
    ltm.add("主人在北京工作")
    ltm.add("主人养了一只猫")
    results = ltm.search("咖啡", limit=3)
    assert len(results) >= 1
    assert any("咖啡" in r["content"] for r in results)
    ltm.delete_all()


def test_search_empty_query():
    ltm = LongTermMemory()
    ltm.add("test")
    results = ltm.search("")
    assert results == []
    ltm.delete_all()


def test_delete_memory():
    ltm = LongTermMemory()
    m = ltm.add("test_delete")
    mid = m["id"]
    assert ltm.delete(mid) is True
    assert ltm.delete("nonexistent") is False
    ltm.delete_all()


def test_update_memory():
    ltm = LongTermMemory()
    m = ltm.add("old content")
    mid = m["id"]
    assert ltm.update(mid, "new content") is True
    assert ltm.update("nonexistent", "x") is False
    results = ltm.search("new content")
    assert any("new content" in r["content"] for r in results)
    ltm.delete_all()


def test_max_memories():
    ltm = LongTermMemory()
    for i in range(100):
        ltm.add(f"memory_{i}")
    assert ltm.get_count() <= 50
    ltm.delete_all()


def test_delete_all():
    ltm = LongTermMemory()
    ltm.add("a")
    ltm.add("b")
    ltm.delete_all()
    assert ltm.get_count() == 0
    assert ltm.get_all() == []

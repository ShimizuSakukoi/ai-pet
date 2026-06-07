"""
PetGraph facade —— 聚合 builder / prompt / executor / persister / logger
"""
from concurrent.futures import ThreadPoolExecutor

from agent.graph.builder import build_graph
from agent.graph.executor import call_model
from agent.graph.persister import invoke_graph, get_graph_state, close_checkpointer
from agent.graph.logger import save_prompt_log

_executor = ThreadPoolExecutor(max_workers=4)


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
        self.graph, self.checkpointer = build_graph(
            self._call_model, self._after_model,
        )

    def _call_model(self, state):
        result = call_model(
            state, self._system_rules, self._persona, self.llm, self.ltm,
        )
        _executor.submit(
            save_prompt_log,
            result["_system_text"], result["_messages"], result["_raw_response"],
        )
        return {
            "messages": result["messages"],
            "_memory_text": result["_memory_text"],
        }

    def _after_model(self, state):
        memory_text = state.get("_memory_text")
        if memory_text and isinstance(memory_text, str) and len(memory_text) < 100:
            _executor.submit(self.ltm.add, memory_text)
        _executor.submit(self.ltm.decay_all)
        return {}

    def invoke(self, user_text: str, thread_id: str):
        return invoke_graph(self.graph, user_text, thread_id)

    def get_state(self, thread_id: str):
        return get_graph_state(self.graph, thread_id)

    def close(self):
        close_checkpointer(self.checkpointer)

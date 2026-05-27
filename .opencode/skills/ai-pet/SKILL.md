---
name: ai-pet
description: Use when user mentions "ai-pet", "AI Pet", "桌面宠物", "Live2D pet", "ai-pet project", "宠物项目", or asks about the desktop AI pet application. ALWAYS search memory-serve before responding.
---

# AI-Pet Project Skill

## Mandatory: always use memory-serve first

Before answering any question about this project, you MUST:

1. Call `memory-serve_recall(project_path="C:\\ai-pet", n=3)` to get recent conversation context.
2. Call `memory-serve_search_code(query="<user's question>", project_path="C:\\ai-pet")` for semantic code search.
3. Only then answer based on the retrieved context + your knowledge of the project files.

## Project summary

Desktop AI pet (Live2D) built with LangGraph + pywebview. Two frameless windows: pet window (Live2D) + chat window. Emotional system, long-term memory, multi-LLM support (DeepSeek / OpenAI).

## Project structure

| Layer | Path | What |
|-------|------|------|
| Entry | `main.py` | Dual webview windows + tray |
| Config | `config.py` | LLM providers, models, app constants |
| Brain | `agent/brain.py` | LangGraph graph + LLM calls + emotion/memory extraction |
| Personality | `agent/personality.py` | Loads system.txt + persona.txt |
| Memory | `agent/memory.py` | Long-term memory (keyword JSON search) |
| State | `agent/state.py` | PetState TypedDict |
| Bridge | `bridge/handler.py` | Routes JS API calls |
| Settings | `bridge/settings.py` | Config persistence & LLM connection test |
| Windows | `bridge/windows.py` | Window control & model switching |
| UI Pet | `ui/pet.html` + `ui/js/pet-ui.js` | Live2D pet window |
| UI Chat | `ui/chat.html` + `ui/js/chat-ui.js` | Chat & settings window |
| Live2D | `ui/js/live2d.js` | Live2D model loading/switch/motion |
| Models | `ui/model/dafeng/` | Live2D character models |
| Tray | `tray.py` | System tray icon |

## Key design decisions

- Single LLM call per turn (reply + mood + memory in one JSON)
- No .env — all config from settings.json via UI
- pywebview dual window (lighter than Electron, ~50MB packaged)
- Keyword-based memory search (not vector, toy-grade for <50 entries)
- Prompt layers: system.txt (safety) → persona.txt (character) → memory → current mood

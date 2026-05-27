# AI-Pet 架构文档

## 项目概述

桌面 AI 宠物应用。两个独立窗口：Live2D 宠物窗口 + 聊天/设置窗口。后端用 LangGraph + LangChain 管理对话状态，前端用 pywebview + HTML/JS。

---

## 目录结构

```
ai-pet/
├── config.py              # 全局配置（LLM 提供商、模型列表、应用常量）
├── main.py                # 入口：双 webview 窗口 + 系统托盘
├── build.spec             # PyInstaller 打包配置
├── build.bat              # 一键打包脚本
├── pyproject.toml         # Ruff lint 配置
├── test_prompt.py         # Prompt 回归测试
├── requirements.txt
├── .gitignore
├── README.md
│
├── agent/                 # "大脑"层 —— LangGraph Agent
│   ├── brain.py           # 核心：LangGraph 图 + LLM 调用 + 情绪/记忆提取
│   ├── personality.py     # 加载 system.txt + persona.txt
│   ├── memory.py          # 长期记忆（关键词 JSON 搜索）
│   ├── state.py           # PetState TypedDict 定义
│   └── logger.py          # 统一日志（stdout + 文件）
│
├── bridge/                # 通信层 —— Python ↔ JS
│   ├── handler.py         # BridgeHandler：路由所有 JS API 调用
│   ├── settings.py        # SettingsManager：配置存取 & LLM 连接测试
│   ├── windows.py         # WindowManager：窗口控制 & 模型切换 & 开机自启
│   ├── memory_api.py      # MemoryController：记忆 CRUD
│   └── updater.py         # 版本检测：GitHub API 最新 release 检查
│
├── ui/                    # 前端
│   ├── pet.html           # 宠物窗口（Live2D 画布 + 情绪标签）
│   ├── chat.html          # 聊天窗口（消息列表 + 设置面板 + 记忆面板）
│   ├── css/
│   │   └── pet.css        # 全部样式
│   ├── js/
│   │   ├── bridge.js      # JS API 封装（pywebview.api.xxx）
│   │   ├── chat-ui.js     # 聊天窗口逻辑
│   │   ├── pet-ui.js      # 宠物窗口逻辑
│   │   ├── shared.js      # 共享状态：空闲检测、消息渲染、语音、记忆面板
│   │   ├── live2d.js      # Live2D 模型加载/切换/表情
│   │   ├── emotions.js    # 情绪 → 表情/动作映射表
│   │   └── lib/
│   │       └── L2Dwidget.min.js  # Live2D 渲染引擎
│   └── model/
│       └── dafeng/        # Live2D 角色：航空母舰大凤
│           ├── system.txt
│           ├── persona.txt
│           ├── interactions.json  # 触摸交互配置
│           ├── dafeng_2_hx.model3.json
│           ├── textures/
│           └── motions/       # 14 个动作文件
│
└── storage/               # 空目录（运行时数据存 AppData）
```

---

## 数据流

### 完整对话链路

```
用户输入文字
    │
    ▼
chat.html (input 框)
    │
    ▼
chat-ui.js → sendMessage()
    │
    ▼
bridge.js → sendChat(text, threadId)
    │  (pywebview.api.chat)
    ▼
handler.py → BridgeHandler.chat()
    │  delegate to
    ▼
agent/brain.py → PetBrain.chat()
    │  invoke LangGraph
    ▼
[LangGraph 图执行]
  START
    → call_model (1 次 LLM 调用)
    → after_model (保存记忆，无 LLM)
  → END
    │
    ▼
handler.py ← 返回 {text, mood, friendship}
    │  JSON 序列化
    ▼
bridge.js ← 解析结果
    │
    ▼
chat-ui.js → addMessage() 渲染到聊天区
```

### 宠物互动链路（抚摸/拖拽/归回/空闲搭话）

```
pet.html 触发交互
    │
    ▼
pet-ui.js → petAction("pet")
    │
    ▼
bridge.js → petAction(actionType)
    │  (pywebview.api.pet_action)
    ▼
handler.py → BridgeHandler.pet_action()
    │  delegate to PetBrain.action()
    │  走 chat() 同一套 LangGraph 链路
    │
    ▼
handler.py → chat_window.evaluate_js()
    │  跨窗口 JS 注入
    ▼
chat-ui.js → addMessage() 在当前聊天窗口渲染
```

### 双窗口跨通信

```
┌─────────────────┐      Python evaluate_js()      ┌─────────────────┐
│   宠物窗口       │ ←───────────────────────────→  │   聊天窗口       │
│  pet.html        │                                │  chat.html       │
│                  │   handler.py 持有两个 window    │                  │
│  Live2D 渲染     │   引用，可相互注入 JS 代码       │  消息列表        │
│  情绪标签        │                                │  设置面板        │
│  双击抚摸        │                                │  记忆面板        │
└─────────────────┘                                └─────────────────┘
         ↑                                              ↑
         └──────── 共享一个 BridgeHandler ───────────────┘
                        │
                  一个 PetBrain 实例
```

---

## Prompt 分层体系

```
┌────────────────────────────────────────────┐
│ Layer 1: 安全护栏                          │
│ 来源：ui/model/{name}/system.txt           │
│ 内容：不可违反的底层规则（角色身份、固定性格）│
├────────────────────────────────────────────┤
│ Layer 2: 角色设定                          │
│ 来源：ui/model/{name}/persona.txt          │
│ 内容：外表、性格、说话风格                   │
├────────────────────────────────────────────┤
│ Layer 3: 长期记忆                          │
│ 来源：memory.json（关键词搜索 top-3）       │
│ 内容：之前对话中提取的重要偏好/信息           │
├────────────────────────────────────────────┤
│ Layer 4: 当前状态                          │
│ 来源：LangGraph PetState                   │
│ 内容：情绪(mood)、好感度(friendship)、JSON格式│
└────────────────────────────────────────────┘
```

### Persona 流

```
模型切换（前端按钮 / 设置）
    │
    ▼
handler.py → switch_model(direction)
    │
    ▼
windows.py → WindowManager.switch_model()
    │  update BridgeState
    ▼
brain.py → PetBrain.set_model(model_name)
    │
    ▼
personality.py → load_persona(model_name, pet_name)
    │
    ├── 读 ui/model/{name}/system.txt  →  替换 {name}  →  self._system_rules
    └── 读 ui/model/{name}/persona.txt →  替换 {name}  →  self._persona
```

---

## Memory 流

```
用户对话
    │
    ▼
brain.py → _call_model()
    │  LLM 以 JSON 格式同时返回:
    │  { reply, mood, friendship_delta, memory }
    │
    ▼
brain.py → _after_model()
    │  如果 memory ≠ null:
    │     memory.py → ltm.add(memory_text)
    │       → 写入 %APPDATA%/AI-Pet/memory.json
    │       裁剪到 MAX_LONG_TERM_MEMORIES (50)
    │
    ▼
下次对话
    │
    ▼
brain.py → _call_model()
    │  ltm.search(user_input, limit=3)
    │  关键词匹配 → 返回 top-3 记忆
    │  注入 Layer 3
```

### 记忆格式

```json
[
  {
    "id": "uuid",
    "content": "主人喜欢喝咖啡",
    "timestamp": "2026-05-26 14:30:01",
    "category": "偏好"
  }
]
```

---

## 持久化体系

| 数据 | 路径 (%APPDATA%/AI-Pet/) | 格式 | 用途 |
|---|---|---|---|
| 设置 | settings.json | JSON | LLM 配置、宠物名、置顶偏好 |
| 记忆 | memory.json | JSON Array | 长期记忆列表 |
| 对话 | conversations.db | SQLite (LangGraph checkpoint) | 对话历史持久化 |
| 回顾状态 | review_state.json | JSON | 每日回顾日期去重 |
| 日志 | logs/pet_YYYYMMDD.log | 文本 | 请求/响应诊断日志 |
| 调试 | logs/prompt_YYYYMMDD_HHMMSS.txt | 文本 | 完整 prompt+response 快照 |

---

## 关键设计决策

### 1. 单次 LLM 调用

LangGraph 图只有 2 个节点：`call_model` → `after_model` → END。回复、情绪分析、记忆提取都在一次调用中完成（LLM 输出 JSON），比之前快了约 3 倍。

### 2. 纯 UI 配置驱动（无 .env）

LLM 配置完全从 settings.json 读取，用户通过 HTML 设置面板修改。`build_llm_from_settings(dict)` 根据传参创建 ChatOpenAI 实例，无需环境变量。

### 3. pywebview 双窗口

两个独立 frameless 窗口共享一个 Brain 实例。跨窗口通信通过 Python 端的 `window.evaluate_js()` 注入 JS。比 Electron 轻量，打包后约 50MB。

### 4. 关键词记忆搜索（非向量）

当前使用简单的关键词匹配搜索记忆。标注为 "toy-grade"，对 50 条以内的记忆量足够。待升级到 embedding + 向量库。

### 5. Prompt 分层

`system.txt`（安全规则）+ `persona.txt`（角色设定）分离存储。防止 Persona 污染：安全护栏不会因为修改角色设定被意外覆盖。每层独立注入，日志可追踪各自长度。

---

## 技术栈

| 层 | 技术 |
|---|---|
| Agent 框架 | LangGraph + LangChain |
| LLM | DeepSeek / OpenAI / 自定义（兼容 OpenAI API） |
| 前端容器 | pywebview (Chromium Edge) |
| Live2D | L2Dwidget.js |
| 持久化 | JSON + SQLite (LangGraph SqliteSaver) |
| 日志 | Python logging（stdout + 文件） |
| 打包 | PyInstaller |
| Lint | Ruff |
| 测试 | pytest（可通过 pytest 运行 test_prompt.py） |

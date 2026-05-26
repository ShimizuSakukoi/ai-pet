# 🐱 AI Pet - 你的 Live2D 桌面宠物

一个基于 **LangGraph** 的桌面宠物，拥有情绪系统、记忆和 Live2D 动态角色。

## ✨ 功能

- 💬 **智能聊天**：角色扮演式对话，支持多种 LLM
- 🎭 **情绪系统**：6 种情绪 + 好感度，影响回复风格
- 🧠 **长期记忆**：跨会话记住主人的喜好
- 🗑️ **一键清除记忆**
- 🎨 **Live2D 支持**（可选，无模型时自动回退 emoji）
- 🔌 **多 API 支持**：DeepSeek / OpenAI / 自定义兼容 API
- ⚙ **设置留存**：配置保存到本地，下次自动加载

## 📸 界面截图

![聊天界面](screenshots/chat.png)

## 🚀 快速开始

```bash
pip install -r requirements.txt
python main.py
```

首次启动会弹出设置面板：

```
1. 选择 API 提供商   → DeepSeek / OpenAI / 自定义
2. 填入 API Key      → 可点眼睛按钮查看
3. 选择模型          → 下拉选择或手动输入
4. 点击「测试连接」   → 验证 Key 是否可用
5. 点击「保存并开始」 → 进入聊天
```

> 设置会保存到本地，下次启动自动加载，无需重新填写。
> 标题栏 ⚙ 按钮可随时修改设置。

## 📂 项目结构

```
ai-pet/
├── main.py                 ← 启动入口
├── config.py               ← 所有配置
├── agent/                  ← 宠物大脑（LangGraph）
│   ├── state.py            │  状态定义
│   ├── personality.py      │  人设模板
│   ├── memory.py           │  长期记忆管理
│   └── brain.py            │  图定义核心
├── bridge/                 ← 前后端通信
│   ├── handler.py          │  消息路由（组合以下管理器）
│   ├── settings.py         │  配置存取 & 连接测试
│   ├── windows.py          │  窗口控制 & 模型切换 & 开机自启
│   └── memory_api.py       │  长期记忆 CRUD
├── ui/                     ← 前端
│   ├── pet.html            │  宠物窗口（Live2D）
│   ├── chat.html           │  聊天窗口（对话 & 设置）
│   ├── css/pet.css         │  样式
│   ├── js/
│   │   ├── bridge.js       │  pywebview API 封装
│   │   ├── emotions.js     │  情绪 emoji 映射
│   │   ├── shared.js       │  公共 UI 逻辑
│   │   ├── chat-ui.js      │  聊天窗口控制器
│   │   ├── pet-ui.js       │  宠物窗口控制器
│   │   ├── live2d.js       │  Live2D 加载/切换
│   │   └── lib/            │  第三方库
│   └── model/              │  Live2D 模型文件
├── screenshots/             ← 界面截图
└── README.md
```

## 🎯 修改指南

| 想改什么 | 去哪个文件 |
|----------|-----------|
| 宠物性格 | `agent/personality.py` + `ui/model/*/persona.txt` |
| 情绪判断 | `agent/brain.py` → `_call_model` |
| 长期记忆策略 | `agent/memory.py` |
| 支持的 API 提供商 | `config.py` → `LLM_PROVIDERS` |
| 设置面板 | `ui/js/chat-ui.js` + `ui/css/pet.css` |
| Live2D 模型 | `ui/model/` + `ui/js/live2d.js` |
| 窗口控制 | `bridge/windows.py` |
| API 连接 | `bridge/settings.py` |

## 📦 打包 EXE

```bash
pyinstaller build.spec
# 输出: dist/AI-Pet.exe
```

## 🔧 技术栈

- **Agent**：LangGraph（有状态图编排）
- **LLM**：LangChain + OpenAI 兼容 API
- **桌面窗口**：pywebview（双 frameless 窗口）
- **Live2D**：live2d-widget
- **打包**：PyInstaller

## 📄 License

MIT

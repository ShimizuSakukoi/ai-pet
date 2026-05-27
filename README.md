# 🤖 AI Pet - 你的 Live2D 互动角色

基于 **LangGraph** 的桌面宠物，Live2D 动态角色 + LLM 驱动对话。

## ✨ 功能

- 💬 **智能聊天**：角色扮演式对话，支持 DeepSeek / OpenAI / 自定义 API
- 🖱 **触摸交互**：双击摸头/身体 → Live2D 动画 + 角色台词，拖拽触发 drag 反应
- 🔊 **触摸音频**：每个触摸区域配 .ogg/.mp3，随机播放，支持**静音**和**音量调节**
- 🔄 **对话隔离**：切换角色自动开新对话，旧对话保留
- 🎨 **双主题**：深色 / 浅色 / 跟随系统
- 💡 **快捷回复动态化**：点击 🔄 基于角色性格 LLM 生成主人→角色的快捷句子
- 📦 **新角色即插即用**：放入 `ui/model/` 自动识别，详见 `ui/model/MODEL_GUIDE.md`
- 👗 **角色变体/皮肤**：同一角色多形态（不同服装），人设共享，Live2D 独立，点击角色名切换
- 🧠 **长期记忆**：跨会话记住主人的喜好
- 🔌 **多 API 支持**：DeepSeek / OpenAI / 自定义兼容 API
- ⚙ **设置留存**：配置保存到本地，下次自动加载

## 📸 界面截图

![聊天界面](screenshots/chat.png)

## 🚀 快速开始

```bash
pip install -r requirements.txt
python main.py
```

首次启动弹出设置面板：

```
1. 选择 API 提供商
2. 填入 API Key
3. 选择模型
4. 点击「测试连接」
5. 点击「保存并开始」
```

设置保存到本地，下次自动加载。

## 📂 项目结构

```
ai-pet/
├── main.py                 ← 启动入口
├── config.py               ← 所有配置
├── agent/                  ← 宠物大脑（LangGraph）
│   ├── brain.py            │  门面
│   ├── llm.py              │  LLM 构建
│   ├── graph.py            │  LangGraph 图定义
│   ├── interaction.py      │  交互动作 / 每日回顾 / 快捷回复生成
│   ├── personality.py      │  人设 + 交互配置加载
│   ├── memory.py           │  长期记忆管理
│   ├── state.py            │  状态定义
│   └── logger.py           │  统一日志
├── bridge/                 ← 前后端通信
│   ├── handler.py          │  JS API 路由
│   ├── interaction.py      │  对话/互动/音频/TTS
│   ├── settings.py         │  配置存取 & 连接测试
│   ├── windows.py          │  窗口控制 & 模型切换
│   ├── memory_api.py       │  长期记忆 CRUD
│   ├── updater.py          │  GitHub 版本检测
│   └── utils.py            │  共享工具函数
├── tray.py                 ← 系统托盘
├── ui/                     ← 前端
│   ├── pet.html            │  宠物窗口（Live2D 渲染 + 触摸事件）
│   ├── chat.html           │  聊天窗口（对话 + 设置 + 快捷回复）
│   ├── css/pet.css         │  样式（CSS 变量主题）
│   ├── js/
│   │   ├── bridge.js       │  pywebview API 封装
│   │   ├── common.js       │  全局状态 + 主题/音量
│   │   ├── message.js      │  消息渲染 + 新对话
│   │   ├── idle.js         │  空闲检测
│   │   ├── voice.js        │  语音输入
│   │   ├── notify.js       │  桌面通知
│   │   ├── memory-panel.js │  记忆面板
│   │   ├── setup-ui.js     │  设置面板
│   │   ├── chat.js         │  聊天主控 + 变体菜单
│   │   ├── live2d.js       │  Live2D 加载/切换/Motion
│   │   ├── pet-ui.js       │  触摸命中检测 + 拖拽 + 音频播放
│   │   └── lib/            │  第三方库
│   └── model/
│       ├── MODEL_GUIDE.md  │  添加新角色规范
│       ├── taihou/         │  角色：航空母舰大鳳
│       │   ├── persona.txt │    角色设定（共享）
│       │   ├── system.txt  │    安全护栏（共享）
│       │   ├── interactions.json  │  交互配置（共享回退）
│       │   ├── variants.json      │  变体清单
│       │   ├── 毒苹果/          │  变体：禁断の果実
│       │   │   ├── interactions.json │ 变体专属交互
│       │   │   ├── audio/      │  触摸语音 .ogg
│       │   │   ├── *.model3.json │ 模型入口
│       │   │   ├── *.moc3      │  模型文件
│       │   │   ├── textures/   │  贴图
│       │   │   └── motions/    │  动作文件
│       │   └── 放学后的甜蜜时光/  │  变体：下校の甘き時間
│       │       └── ...         │  同上结构
│       └── shimakaze/     │  角色：驱逐舰岛风
│           ├── persona.txt │    角色设定（共享）
│           ├── system.txt  │    安全护栏（共享）
│           ├── interactions.json  │  交互配置（共享）
│           ├── variants.json      │  变体清单
│           └── 不思议国度的白兔/ │  变体：The White Rabbit of Wonderland
│               ├── audio/      │  触摸语音 .ogg
│               ├── *.model3.json │ 模型入口
│               ├── *.moc3      │  模型文件
│               ├── textures/   │  贴图
│               └── motions/    │  动作文件
└── screenshots/            ← 界面截图
```

## 🎯 添加新角色

只需放入 `ui/model/新角色名/` 即可自动识别，无需修改其他文件。详见 [MODEL_GUIDE.md](ui/model/MODEL_GUIDE.md)。

**单形态结构**：
```
ui/model/新角色/
├── 角色.model3.json        # [必须] Live2D 模型入口
├── persona.txt             # [必须] 角色性格
├── system.txt              # [必须] 安全规则
├── interactions.json       # [必须] 触摸配置
├── audio/                  # [可选] 触摸语音 .ogg/.mp3
├── textures/               # [必须] 贴图
└── motions/                # [必须] 动作文件
```

**多形态/多皮肤结构**（添加 `variants.json`，Live2D 文件放入子目录）：
```
ui/model/新角色/
├── persona.txt             # [必须] 共享性格
├── system.txt              # [必须] 共享规则
├── interactions.json       # [可选] 共享交互回退（变体缺配置时兜底）
├── variants.json           # [必须] 变体清单（id 必须 = 目录名）
├── 变体目录A/              # 变体子目录
│   ├── interactions.json   # [可选] 变体专属交互 + 音频列表
│   ├── audio/              # [可选] 变体专属语音 .ogg/.mp3
│   ├── *.model3.json
│   ├── *.moc3
│   ├── textures/
│   └── motions/
└── 变体目录B/
    └── ...
```

> **注意**：`variants.json` 中 `id` 和 `model_file` 路径中的目录名**必须与实际子目录名一致**。

## 🔊 音频配置

音频文件放入角色或变体的 `audio/` 目录，支持 `.ogg`、`.mp3`、`.wav` 格式。在 `interactions.json` 的 `zones[].audio` 数组中列出文件名即可，触摸时随机播放：

```json
{
  "zones": [
    {
      "id": "body",
      "audio": ["Touch.ogg", "Idle1.ogg", "Idle2.ogg"]
    }
  ]
}
```

**声音控制**：聊天窗口输入栏左侧有 🔊 静音按钮和音量滑块，设置自动保存到 localStorage。

## 📦 打包 EXE

```bash
# 使用 venv（避免引入多余包）
.venv\Scripts\python.exe -m PyInstaller build.spec
# 输出: dist/AI-Pet.exe
```

## 🧪 测试

```bash
ruff check agent/ bridge/ config.py main.py
```

## 🔧 技术栈

- **Agent**：LangGraph（有状态图编排）
- **LLM**：LangChain + OpenAI 兼容 API
- **桌面窗口**：pywebview（双 frameless 窗口）
- **Live2D**：PIXI.live2d + Cubism 4 SDK
- **日志**：Python logging（stdout + 日志文件）
- **Lint**：Ruff
- **打包**：PyInstaller

## 📄 License

MIT

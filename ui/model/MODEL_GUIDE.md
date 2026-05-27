# 角色模型规范

新角色只需放入 `ui/model/` 下即可自动识别，无需修改任何其他文件。

## 基础结构（单模型）

没有变体的角色使用以下扁平结构：

```
ui/model/新角色名/
├── 角色名.model3.json        # [必须] Live2D 模型入口（Cubism 3/4）
├── 角色名.moc3               # [必须] Live2D 二进制模型文件
├── 角色名.physics3.json      # [可选] 物理演算配置
├── persona.txt               # [必须] 角色性格设定（外表/性格/说话风格）
├── system.txt                # [必须] 安全护栏规则（底层行为约束）
├── interactions.json         # [必须] 触摸交互配置（见下方格式）
├── audio/                    # [可选] 触摸语音 mp3
│   ├── head_01.mp3
│   ├── head_02.mp3
│   ├── body_01.mp3
│   └── drag_01.mp3
├── textures/                 # [必须] 模型贴图目录
│   └── *.png
└── motions/                  # [必须] 动作文件目录
    ├── touch_head.motion3.json   # 被 interactions.json 引用
    ├── touch_body.motion3.json
    └── touch_special.motion3.json
```

## 多形态/多皮肤结构（变体）

同一角色有不同服装或形态时，在角色根目录添加 `variants.json`，
每个变体的 Live2D 文件放入独立子目录，`persona.txt` / `system.txt` / `interactions.json` 放在根目录共享。

```
ui/model/新角色名/
├── persona.txt               # [必须] 共享：性格设定
├── system.txt                # [必须] 共享：安全护栏
├── interactions.json         # [必须] 共享：触摸交互
├── variants.json             # [必须] 变体清单（见下方格式）
├── default/                  # 变体1：默认形态
│   ├── 模型.model3.json
│   ├── 模型.moc3
│   ├── 模型.physics3.json
│   ├── audio/
│   ├── textures/
│   └── motions/
└── skin2/                    # 变体2：另一形态
    ├── 模型.model3.json
    ├── 模型.moc3
    ├── textures/
    └── motions/
```

每个变体子目录可选择性覆盖 `interactions.json`（如特定皮肤有专属触摸动作），
未覆盖则自动继承根目录的共享文件。

### variants.json 格式

```json
{
  "variants": [
    {"id": "default", "label": "默认", "model_file": "default/模型.model3.json"},
    {"id": "skin2", "label": "皮肤2", "model_file": "skin2/模型.model3.json"}
  ]
}
```

| 字段 | 说明 |
|---|---|
| `id` | 变体标识，用于内部唯一名 `角色名/id` |
| `label` | 在切换菜单中显示的名称 |
| `model_file` | 相对于角色根目录的 `.model3.json` 路径 |

## interactions.json 格式

```json
{
  "zones": [
    {
      "id": "head",
      "hit": [0.25, 0.00, 0.50, 0.30],
      "trigger": "dblclick",
      "action": "pet",
      "motion": "touch_head",
      "audio": ["audio/head_01.mp3", "audio/head_02.mp3"]
    },
    {
      "id": "body",
      "hit": [0.15, 0.30, 0.70, 0.50],
      "trigger": "dblclick",
      "action": "pet",
      "motion": "touch_body",
      "audio": ["audio/body_01.mp3"]
    },
    {
      "id": "full",
      "hit": [0, 0, 1, 1],
      "trigger": "drag",
      "action": "drag",
      "motion": "touch_special",
      "audio": ["audio/drag_01.mp3"]
    }
  ],
  "idle_timeout": 600,
  "welcome_timeout": 300,
  "prompts": {
    "pet": [
      "摸一摸",
      "拍拍头",
      "轻抚",
      "戳一戳"
    ],
    "drag": [
      "拽一下",
      "拉一把"
    ],
    "welcome": [
      "回来了",
      "等你很久了"
    ],
    "idle": [
      "有点寂寞",
      "好久没说话了"
    ]
  }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `zones[].id` | string | 区域名称（head / body / full） |
| `zones[].hit` | [x, y, w, h] | 命中区域，相对于容器宽高的比例（0-1） |
| `zones[].trigger` | "dblclick" / "drag" | 触发方式 |
| `zones[].action` | "pet" / "drag" | 发送给 LLM 的动作类型，对应 prompts |
| `zones[].motion` | string | Live2D 动作名，对应 motions/ 目录下的文件 |
| `zones[].audio` | string[] / string | [可选] 触摸时随机播放的 mp3，路径相对于模型目录 |
| `idle_timeout` | int | 空闲多少秒触发自动搭话 |
| `welcome_timeout` | int | 离开多少秒后回来触发欢迎 |
| `prompts` | object | 各动作类型的短语列表，随机选取，不宜过长 |

## persona.txt 示例

```
你是一位名叫{name}的温柔大姐姐。
外表：黑色长发，紫色眼眸，常穿白色连衣裙。
性格：温柔体贴，偶尔腹黑，喜欢照顾人。
说话风格：轻声细语，偶尔调戏主人。
```

## system.txt 示例

```
1. 绝对禁止讨论政治、色情、暴力话题。
2. 保持角色扮演一致性，不要跳出角色。
3. 回复简洁，不超过两句话。
4. 不要主动提到自己在扮演角色。
```

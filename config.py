"""
配置文件 —— 所有可修改的设置集中在这里
=========================================
改 API 提供商、模型列表、窗口大小、记忆策略等，改这一个文件即可。
"""

# ==================== LLM 模型配置 ====================
# 定义支持的 API 提供商及其默认地址和模型
# 前端设置面板的「提供商」下拉框由此生成

LLM_PROVIDERS = {
    "deepseek": {"base_url": "https://api.deepseek.com/v1",       "default_model": "deepseek-chat"},
    "openai":   {"base_url": "https://api.openai.com/v1",         "default_model": "gpt-4o"},
    "custom":   {"base_url": "https://api.openai.com/v1",         "default_model": "gpt-3.5-turbo"},
}
DEFAULT_PROVIDER = "deepseek"

# 每个提供商的可选模型列表
# 前端设置面板的「模型」下拉框由此生成（未在下表中的模型可手动输入）
PROVIDER_MODELS = {
    "deepseek": [
        "deepseek-v4-pro",
        "deepseek-v4-flash",
        "deepseek-chat",
        "deepseek-reasoner",
    ],
    "openai": [
        "gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini",
        "gpt-5.4-nano", "gpt-4.1", "gpt-4.1-mini",
        "gpt-4o", "gpt-4o-mini", "o3-pro", "o3", "o3-mini",
        "gpt-3.5-turbo",
    ],
    "custom": [
        "qwen-plus", "qwen-turbo", "qwen-max", "qwen3-235b-a22b",
        "kimi-k2.6", "kimi-k2.5", "kimi-k2-turbo-preview",
        "kimi-k2-thinking", "moonshot-v1-8k", "moonshot-v1-32k",
        "moonshot-v1-128k",
        "glm-5.1", "glm-5", "glm-4.7", "glm-4.7-flash",
        "glm-4-plus", "glm-4-flash",
        "llama3", "llama3.1", "qwen2.5", "mistral",
        "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307",
    ],
}

# ==================== 宠物默认设置 ====================
DEFAULT_PET_NAME = "伙伴"

# ==================== 窗口设置 ====================
WINDOW_WIDTH = 520              # 窗口宽度（像素）
WINDOW_HEIGHT = 700             # 窗口高度（像素）
WINDOW_TITLE = "AI Pet - 桌宠"  # 窗口标题（无边框时不显示，仅托盘用）

# ==================== 记忆控制 ====================
MAX_MESSAGES_BEFORE_TRIM = 40   # 对话消息超过此数量时触发裁剪
MAX_LONG_TERM_MEMORIES = 50     # 长期记忆最多保留条数
STORAGE_DIR_NAME = "AI-Pet"     # 存储目录名（位于 %APPDATA% 下）

# ==================== 互动配置 ====================
IDLE_CHAT_SECONDS = 600          # 空闲多久触发主动搭话（秒）→ 10 分钟
IDLE_WELCOME_SECONDS = 300       # 离开多久触发欢迎回来（秒）→ 5 分钟

# ==================== 版本 & GitHub ====================
APP_VERSION = "V1.4"
GITHUB_REPO = "ShimizuSakukoi/ai-pet"

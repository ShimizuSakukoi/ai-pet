/**
 * 全局状态 + 工具函数 + 兜底配置
 * ============================================================
 * 依赖：无（最底层，最先加载）
 */
let isWaiting = false;
let connectionTested = false;
let currentProvider = "deepseek";
let savedSettings = null;
let providerData = {};

let MODEL_NAMES = [];
let currentModelIdx = 0;

let currentThreadId = null;

let lastInteraction = Date.now();
let idleChatSent = false;
let wasAway = false;
let awayStart = 0;

const FALLBACK_MODELS = {
    deepseek: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-chat", "deepseek-reasoner"],
    openai: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "o3-pro", "o3", "o3-mini", "gpt-3.5-turbo"],
    custom: ["qwen-plus", "qwen-turbo", "qwen-max", "kimi-k2.6", "kimi-k2.5", "glm-5.1", "glm-5", "glm-4.7", "glm-4-plus", "glm-4-flash", "llama3", "qwen2.5", "claude-3-5-sonnet-20241022"],
};

const FALLBACK_DEFAULTS = {
    deepseek: { base_url: "https://api.deepseek.com/v1", model: "deepseek-v4-pro" },
    openai: { base_url: "https://api.openai.com/v1", model: "gpt-5.5" },
    custom: { base_url: "", model: "qwen-plus" },
};

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

function applyTheme(theme) {
    if (theme === "light") {
        document.body.classList.add("light-theme");
    } else if (theme === "dark") {
        document.body.classList.remove("light-theme");
    } else {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        document.body.classList.toggle("light-theme", !mq.matches);
        mq.addEventListener("change", (e) => {
            document.body.classList.toggle("light-theme", !e.matches);
        });
    }
}

async function getMemCount() { const st = await getStatus(); return st.memories_count || 0; }

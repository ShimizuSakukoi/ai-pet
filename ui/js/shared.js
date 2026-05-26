/**
 * 共享 UI 逻辑 —— 聊天窗口 & 宠物窗口共用
 * ============================================================
 * 从 chat-ui.js 抽出，消除与已删除 ui.js 的重复
 *
 * 包含：全局状态、空闲检测、消息渲染、语音输入、记忆面板、通知、工具函数
 *
 * 依赖：bridge.js（pywebview API 封装）、emotions.js（先于本文件加载）
 */

// ==================== 全局状态 ====================

let isWaiting = false;
let connectionTested = false;
let currentProvider = "deepseek";
let savedSettings = null;
let providerData = {};
let currentThreadId = genId();

let MODEL_NAMES = ["haru", "tororo"];
let currentModelIdx = 0;

let lastInteraction = Date.now();
let idleChatSent = false;
let wasAway = false;
let awayStart = 0;
const IDLE_CHAT_MS = 600000;
const IDLE_WELCOME_MS = 300000;

// ==================== 模型 & API 兜底 ====================

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

// ==================== 辅助函数 ====================

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

async function getMemCount() { const st = await getStatus(); return st.memories_count || 0; }

// ==================== 消息渲染 ====================

function addMessage(role, content, withSpeak) {
    const chatArea = document.getElementById("chat-area");
    const modelName = MODEL_NAMES[currentModelIdx] || "Pet";
    const prefix = role === "user" ? "你: " : role === "pet" ? modelName + ": " : role === "system" ? "⚡ " : "";
    const d = document.createElement("div");
    d.className = `message ${role}`;
    d.textContent = prefix + content;
    chatArea.appendChild(d);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function updateFriendship(v) {
    const el = document.getElementById("friendship-bar");
    if (el) { el.style.width = v + "%"; el.title = "好感度: " + v + "/100"; }
}

function updateMemoryCount(c) {
    const el = document.getElementById("mem-count");
    if (el) el.textContent = c;
}

// ==================== 新对话 ====================

function newConversation() {
    if (isWaiting) return;
    currentThreadId = genId();
    document.getElementById("chat-area").innerHTML = "";
    addMessage("system", "新对话开始~");
    idleChatSent = false;
    wasAway = false;
    document.getElementById("chat-input").focus();
}

// ==================== 快捷回复 ====================

function sendQuickReply(text) {
    document.getElementById("chat-input").value = text;
    sendMessage();
}

// ==================== 空闲检测 ====================

function recordActivity() {
    lastInteraction = Date.now();
    if (wasAway && (Date.now() - awayStart > IDLE_WELCOME_MS)) onWelcomeBack();
    wasAway = false;
    idleChatSent = false;
}

function startIdleWatcher() {
    setInterval(() => {
        const idle = Date.now() - lastInteraction;
        if (idle > IDLE_WELCOME_MS && !wasAway) { wasAway = true; awayStart = Date.now() - idle; }
        if (idle > IDLE_CHAT_MS && !idleChatSent) onIdleChat();
    }, 5000);
}

// ==================== 互动 ====================

async function onWelcomeBack() {
    wasAway = false;
    const result = await petAction("welcome");
    if (result.text) { addMessage("pet", result.text, true); updateFriendship(result.friendship); notifyPet(result.text); }
}

async function onIdleChat() {
    if (idleChatSent) return; idleChatSent = true;
    const result = await petAction("idle");
    if (result.text) { addMessage("pet", result.text, true); updateFriendship(result.friendship); notifyPet(result.text); }
}

// ==================== 通知 ====================

function notifyPet(text) {
    if (!text || text.length < 2) return;
    try { if (Notification.permission === "granted") new Notification("Pet 说：", { body: text.substring(0, 100), silent: true }); } catch (_) {}
}

function requestNotifyPermission() {
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (_) {}
}

// ==================== 语音输入 ====================

let recognition = null, isRecording = false;

function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { const b = document.getElementById("btn-voice"); if (b) b.style.display = "none"; return; }
    recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = e => { const t = e.results[0][0].transcript.trim(); if (t) { document.getElementById("chat-input").value = t; document.getElementById("chat-input").focus(); } stopVoiceUI(); };
    recognition.onerror = recognition.onend = () => stopVoiceUI();
}

function toggleVoice() {
    if (!recognition) return;
    if (isRecording) { recognition.stop(); } else {
        try { recognition.start(); isRecording = true; const b = document.getElementById("btn-voice"); b.classList.add("recording"); b.textContent = "🔴"; } catch (_) { stopVoiceUI(); }
    }
}

function stopVoiceUI() {
    isRecording = false;
    const b = document.getElementById("btn-voice");
    b.classList.remove("recording");
    b.textContent = "🎤";
}

// ==================== 记忆面板 ====================

let editingMemId = null;

function bindMemoryPanel() {
    document.getElementById("btn-memories").addEventListener("click", () => showMemories());
    document.getElementById("mem-btn-close").addEventListener("click", hideMemories);
    document.getElementById("mem-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) hideMemories(); });
    document.getElementById("mem-btn-cancel").addEventListener("click", cancelEdit);
    document.getElementById("mem-btn-save").addEventListener("click", saveEdit);
}

async function showMemories() {
    document.getElementById("mem-overlay").style.display = "flex";
    cancelEdit();
    await refreshMemList();
}

function hideMemories() {
    document.getElementById("mem-overlay").style.display = "none";
    cancelEdit();
}

async function refreshMemList() {
    const l = document.getElementById("mem-list");
    const { memories } = await getMemories();
    if (!memories || !memories.length) {
        l.innerHTML = '<div style="color:#555;text-align:center;padding:20px;">暂无记忆</div>';
        return;
    }
    l.innerHTML = memories.map(m =>
        `<div class="mem-item"><div class="mem-content"><div>${esc(m.content)}</div><div class="mem-meta">${m.timestamp ? m.timestamp.slice(0, 16).replace('T', ' ') : ''} · ${m.category || ''}</div></div><div class="mem-actions"><button onclick="startEdit('${m.id}','${esc(m.content)}')">✎</button><button class="del-btn" onclick="doDeleteMemory('${m.id}')">✕</button></div></div>`
    ).join("");
}

function startEdit(mid, content) {
    editingMemId = mid;
    document.getElementById("mem-edit-area").classList.remove("hidden");
    document.getElementById("mem-edit-input").value = content;
    document.getElementById("mem-edit-input").focus();
}

function cancelEdit() {
    editingMemId = null;
    document.getElementById("mem-edit-area").classList.add("hidden");
    document.getElementById("mem-edit-input").value = "";
}

async function saveEdit() {
    const i = document.getElementById("mem-edit-input"), c = i.value.trim();
    if (!c || !editingMemId) return;
    await updateMemory(editingMemId, c);
    cancelEdit();
    await refreshMemList();
}

async function doDeleteMemory(mid) {
    await deleteMemory(mid);
    await refreshMemList();
    updateMemoryCount(await getMemCount());
}

// ==================== 初始化辅助 ====================

function loadSettingsWithRetry(n = 20) {
    return new Promise(async resolve => {
        for (let i = 0; i < n; i++) {
            if (typeof pywebview === "undefined" || !pywebview.api) {
                await new Promise(x => setTimeout(x, 500));
                continue;
            }
            const r = await loadSettings();
            if (r.settings !== null) return resolve(r);
            await new Promise(x => setTimeout(x, 500));
        }
        resolve({ ok: false, settings: null });
    });
}

async function doAutoInit(s) {
    const st = await getStatus();
    if (st.ready) {
        document.getElementById("btn-model-name").textContent = s.model || "haru";
        updateMemoryCount(st.memories_count || 0);
        checkDailyReview();
    }
}

async function checkDailyReview() {
    const r = await dailyReview();
    if (r.ok && r.text) addMessage("system", "📝 昨日回顾：" + r.text);
}

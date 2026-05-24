/**
 * 聊天窗口控制器
 * ============================================================
 * 职责：LLM 对话、设置面板、记忆管理、工具栏、空闲检测、状态栏
 *
 * 与宠物窗口通信：
 *   - 模型切换 → handler.py → pet_window.evaluate_js("switchModel(...)")
 *   - 宠物抚摸 → handler.py → 本窗口 addMessage("pet", ...)
 *
 * 窗口拖拽：chat-header 区域为 -webkit-app-region: drag
 */

// ==================== 全局状态 ====================

let isWaiting = false;
let connectionTested = false;
let currentProvider = "deepseek";
let savedSettings = null;
let providerData = {};
let currentThreadId = genId();

// --- 空闲计时 ---
let lastInteraction = Date.now();
let idleChatSent = false;
let wasAway = false;
let awayStart = 0;
const IDLE_CHAT_MS = 600000;
const IDLE_WELCOME_MS = 300000;

// --- TTS ---
let ttsEnabled = false;

// --- 聊天开关 ---
let chatOpen = false;

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

// ==================== 初始化 ====================

window.addEventListener("load", async () => {
    // 获取模型列表（自动发现）
    const modelsResult = await getModels();
    if (modelsResult.models && modelsResult.models.length) {
        MODEL_NAMES = modelsResult.models.map(m => m.name);
        document.getElementById("btn-model-name").textContent = MODEL_NAMES[0];
    }

    const p = await getProviders();
    if (p.providers) providerData = p.providers;
    const result = await loadSettingsWithRetry();
    if (result.ok && result.settings && result.settings.api_key) {
        savedSettings = result.settings;
        if (result.ready) await doAutoInit(savedSettings);
        else {
            document.body.classList.remove("pet-mode");
            addMessage("system", "⚡ 自动连接失败：" + (result.error || "未知错误"));
        }
    } else {
        document.body.classList.remove("pet-mode");
        let hint = "⚡ 欢迎！点击 ⚙ 设置 配置 API Key 后开始聊天";
        if (result.settings === null) {
            hint += " (未找到已保存的配置)";
        }
        addMessage("system", hint);
    }
    bindEvents();
    startIdleWatcher();
});

function loadSettingsWithRetry(n = 20) {
    return new Promise(async resolve => {
        for (let i = 0; i < n; i++) {
            // 等 pywebview bridge 就绪
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
        document.getElementById("btn-model-name").textContent = s.live2d_model || "haru";
        updateMemoryCount(st.memories_count || 0);
        checkDailyReview();
    }
}

async function checkDailyReview() {
    const r = await dailyReview();
    if (r.ok && r.text) addMessage("system", "📝 昨日回顾：" + r.text);
}

// ==================== 设置面板 ====================

function showSetup(isEdit) {
    const ov = document.getElementById("setup-overlay"); ov.style.display = "flex";
    document.getElementById("setup-subtitle").textContent = isEdit ? "修改设置" : "首次使用，请配置 LLM 连接";
    document.getElementById("setup-test-result").innerHTML = ""; document.getElementById("setup-error").textContent = "";
    document.getElementById("setup-btn-save").disabled = true; connectionTested = false;
    if (isEdit && savedSettings) {
        document.getElementById("setup-provider").value = savedSettings.provider || "deepseek";
        document.getElementById("setup-apikey").value = savedSettings.api_key || "";
        document.getElementById("setup-baseurl").value = savedSettings.base_url || "";
        document.getElementById("setup-ontop").checked = savedSettings.on_top || false;
        document.getElementById("setup-autostart").checked = savedSettings.autostart || false;
    } else { document.getElementById("setup-apikey").value = ""; document.getElementById("setup-ontop").checked = false; document.getElementById("setup-autostart").checked = false; }
    onProviderChange();
    if (isEdit && savedSettings && savedSettings.model_name) {
        const sel = document.getElementById("setup-model"); let found = false;
        for (let i = 0; i < sel.options.length; i++) if (sel.options[i].value === savedSettings.model_name) { sel.value = savedSettings.model_name; found = true; break; }
        if (!found) { const o = document.createElement("option"); o.value = savedSettings.model_name; o.textContent = savedSettings.model_name; o.selected = true; sel.appendChild(o); }
    }
}
function hideSetup() { document.getElementById("setup-overlay").style.display = "none"; }
function onProviderChange() {
    const s = document.getElementById("setup-provider"); currentProvider = s.value; const info = providerData[currentProvider];
    const ug = document.getElementById("setup-url-group");
    if (currentProvider === "custom") ug.classList.remove("hidden"); else { ug.classList.add("hidden"); const fb = FALLBACK_DEFAULTS[currentProvider]; document.getElementById("setup-baseurl").value = info ? info.base_url : (fb ? fb.base_url : ""); }
    const ms = document.getElementById("setup-model"); ms.innerHTML = "";
    const models = (info && info.models && info.models.length > 0) ? info.models : (FALLBACK_MODELS[currentProvider] || []);
    models.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; ms.appendChild(o); });
    const dm = (info && info.default_model) ? info.default_model : (FALLBACK_DEFAULTS[currentProvider] ? FALLBACK_DEFAULTS[currentProvider].model : "");
    for (let i = 0; i < ms.options.length; i++) if (ms.options[i].value === dm) ms.value = dm;
    connectionTested = false; document.getElementById("setup-btn-save").disabled = true; document.getElementById("setup-test-result").innerHTML = "";
}
function getCurrentSettings() {
    const info = providerData[currentProvider]; const fb = FALLBACK_DEFAULTS[currentProvider];
    return { provider: currentProvider, api_key: document.getElementById("setup-apikey").value.trim(), base_url: document.getElementById("setup-baseurl").value.trim() || (info ? info.base_url : (fb ? fb.base_url : "")), model_name: document.getElementById("setup-model").value || (info ? info.default_model : (fb ? fb.model : "")), on_top: document.getElementById("setup-ontop").checked, autostart: document.getElementById("setup-autostart").checked };
}

async function doTestConnection() {
    const b = document.getElementById("setup-btn-test"), r = document.getElementById("setup-test-result"), k = document.getElementById("setup-apikey").value.trim();
    if (!k) { r.innerHTML = '<span class="test-result error">请先填写 API Key</span>'; return; }
    b.disabled = true; b.textContent = "测试中..."; r.innerHTML = "";
    const s = getCurrentSettings(), res = await testConnection(s);
    b.disabled = false; b.textContent = "🔌 测试连接";
    if (res.ok) { r.innerHTML = `<span class="test-result success">✓ 连接成功！回复: "${res.test_reply}"</span>`; connectionTested = true; document.getElementById("setup-btn-save").disabled = false; }
    else { r.innerHTML = `<span class="test-result error">✗ 连接失败: ${res.error}</span>`; connectionTested = false; document.getElementById("setup-btn-save").disabled = true; }
}

async function doSaveSettings() {
    if (!connectionTested) { document.getElementById("setup-error").textContent = "请先测试连接"; return; }
    const b = document.getElementById("setup-btn-save"); b.disabled = true; b.textContent = "保存中..."; document.getElementById("setup-error").textContent = "";
    const s = getCurrentSettings(); savedSettings = s;
    const res = await saveSettings(s);
    if (res.ok) { hideSetup(); document.body.classList.remove("pet-mode"); updateMemoryCount(0); setAutoStart(s.autostart || false); }
    else { document.getElementById("setup-error").textContent = "保存失败：" + (res.error || "未知错误"); b.disabled = false; b.textContent = "💾 保存并开始"; }
}

// ==================== 消息收发 ====================

async function sendMessage() {
    if (isWaiting) return;
    const input = document.getElementById("chat-input"), text = input.value.trim();
    if (!text) return;
    recordActivity();
    addMessage("user", text); input.value = ""; idleChatSent = false;
    isWaiting = true; const btn = document.getElementById("send-btn"); btn.disabled = true; btn.textContent = "…";
    const result = await sendChat(text, currentThreadId);
    addMessage("pet", result.text, true); updateFriendship(result.friendship); notifyPet(result.text);
    isWaiting = false; btn.disabled = false; btn.textContent = "发送"; input.focus();
}

async function doReset() {
    if (!confirm("确定要清除所有记忆吗？")) return;
    const result = await resetMemory();
    addMessage("system", result.text); updateFriendship(result.friendship); updateMemoryCount(0);
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

// ==================== 空闲检测 ====================

function recordActivity() {
    lastInteraction = Date.now();
    if (wasAway && (Date.now() - awayStart > IDLE_WELCOME_MS)) onWelcomeBack();
    wasAway = false; idleChatSent = false;
}

function startIdleWatcher() {
    setInterval(() => {
        const idle = Date.now() - lastInteraction;
        if (idle > IDLE_WELCOME_MS && !wasAway) { wasAway = true; awayStart = Date.now() - idle; }
        if (idle > IDLE_CHAT_MS && !idleChatSent) onIdleChat();
    }, 5000);
}

// ==================== 通知 ====================

function notifyPet(text) { if (!text || text.length < 2) return; try { if (Notification.permission === "granted") new Notification("Pet 说：", { body: text.substring(0, 100), silent: true }); } catch (_) {} }
function requestNotifyPermission() { try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (_) {} }

// ==================== TTS ====================

async function doSpeak(text) { if (!ttsEnabled) return; await speak(text); }
function toggleTTS() {
    ttsEnabled = !ttsEnabled; const b = document.getElementById("btn-speak-toggle");
    if (ttsEnabled) { b.textContent = "🔊"; b.classList.add("speak-on"); document.getElementById("tts-status").textContent = "TTS:就绪"; }
    else { b.textContent = "🔇"; b.classList.remove("speak-on"); document.getElementById("tts-status").textContent = "TTS:待接入"; }
}

// ==================== 辅助 ====================

function addMessage(role, content, withSpeak) {
    const chatArea = document.getElementById("chat-area");
    const prefix = role === "user" ? "你: " : role === "pet" ? "Pet: " : role === "system" ? "⚡ " : "";
    if (role === "pet" && withSpeak) {
        const row = document.createElement("div"); row.className = "message-row";
        const spk = document.createElement("button"); spk.className = "speak-btn"; spk.textContent = "🔊"; spk.title = "播放"; spk.addEventListener("click", () => doSpeak(content));
        const msg = document.createElement("div"); msg.className = "message pet msg-content"; msg.textContent = prefix + content;
        row.appendChild(spk); row.appendChild(msg); chatArea.appendChild(row);
    } else {
        const d = document.createElement("div"); d.className = `message ${role}`; d.textContent = prefix + content; chatArea.appendChild(d);
    }
    chatArea.scrollTop = chatArea.scrollHeight;
}

function updateFriendship(v) { const el = document.getElementById("friendship-bar"); if (el) { el.style.width = v + "%"; el.title = "好感度: " + v + "/100"; } }
function updateMemoryCount(c) { const el = document.getElementById("mem-count"); if (el) el.textContent = c; }

// ==================== 新对话 ====================

function newConversation() { if (isWaiting) return; currentThreadId = genId(); document.getElementById("chat-area").innerHTML = ""; addMessage("system", "新对话开始~"); idleChatSent = false; wasAway = false; document.getElementById("chat-input").focus(); }
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

// ==================== 快捷回复 ====================

function sendQuickReply(text) { document.getElementById("chat-input").value = text; sendMessage(); }

// ==================== 语音输入 ====================

let recognition = null, isRecording = false;
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { document.getElementById("btn-voice").style.display = "none"; return; }
    recognition = new SR(); recognition.lang = "zh-CN"; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = e => { const t = e.results[0][0].transcript.trim(); if (t) { document.getElementById("chat-input").value = t; document.getElementById("chat-input").focus(); } stopVoiceUI(); };
    recognition.onerror = recognition.onend = () => stopVoiceUI();
}
function toggleVoice() { if (!recognition) return; if (isRecording) { recognition.stop(); } else { try { recognition.start(); isRecording = true; const b = document.getElementById("btn-voice"); b.classList.add("recording"); b.textContent = "🔴"; } catch (_) { stopVoiceUI(); } } }
function stopVoiceUI() { isRecording = false; const b = document.getElementById("btn-voice"); b.classList.remove("recording"); b.textContent = "🎤"; }

// ==================== 记忆管理面板 ====================

let editingMemId = null;
function bindMemoryPanel() {
    document.getElementById("btn-memories").addEventListener("click", () => showMemories());
    document.getElementById("mem-btn-close").addEventListener("click", hideMemories);
    document.getElementById("mem-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) hideMemories(); });
    document.getElementById("mem-btn-cancel").addEventListener("click", cancelEdit);
    document.getElementById("mem-btn-save").addEventListener("click", saveEdit);
}
async function showMemories() { document.getElementById("mem-overlay").style.display = "flex"; cancelEdit(); await refreshMemList(); }
function hideMemories() { document.getElementById("mem-overlay").style.display = "none"; cancelEdit(); }
async function refreshMemList() { const l = document.getElementById("mem-list"); const { memories } = await getMemories(); if (!memories || !memories.length) { l.innerHTML = '<div style="color:#555;text-align:center;padding:20px;">暂无记忆</div>'; return; } l.innerHTML = memories.map(m => `<div class="mem-item"><div class="mem-content"><div>${esc(m.content)}</div><div class="mem-meta">${m.timestamp ? m.timestamp.slice(0, 16).replace('T', ' ') : ''} · ${m.category || ''}</div></div><div class="mem-actions"><button onclick="startEdit('${m.id}','${esc(m.content)}')">✎</button><button class="del-btn" onclick="doDeleteMemory('${m.id}')">✕</button></div></div>`).join(""); }
function startEdit(mid, content) { editingMemId = mid; document.getElementById("mem-edit-area").classList.remove("hidden"); document.getElementById("mem-edit-input").value = content; document.getElementById("mem-edit-input").focus(); }
function cancelEdit() { editingMemId = null; document.getElementById("mem-edit-area").classList.add("hidden"); document.getElementById("mem-edit-input").value = ""; }
async function saveEdit() { const i = document.getElementById("mem-edit-input"), c = i.value.trim(); if (!c || !editingMemId) return; await updateMemory(editingMemId, c); cancelEdit(); await refreshMemList(); }
async function doDeleteMemory(mid) { await deleteMemory(mid); await refreshMemList(); updateMemoryCount(await getMemCount()); }
async function getMemCount() { const st = await getStatus(); return st.memories_count || 0; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }

// ==================== 事件绑定 ====================

function bindEvents() {
    // --- 聊天输入 ---
    document.getElementById("send-btn").addEventListener("click", sendMessage);
    document.getElementById("chat-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

    // --- 工具栏 ---
    document.getElementById("btn-reset").addEventListener("click", doReset);
    document.getElementById("btn-settings").addEventListener("click", () => showSetup(true));
    document.getElementById("btn-new-chat").addEventListener("click", newConversation);
    document.getElementById("btn-chat-close").addEventListener("click", () => { try { pywebview.api.window_minimize().catch(() => {}); } catch (_) {} });
    document.getElementById("btn-speak-toggle").addEventListener("click", toggleTTS);

    // 模型切换 → 通知宠物窗口 + 更新本地显示
    document.getElementById("btn-model-prev").addEventListener("click", () => { switchPetModel(-1); updateModelBtn(-1); addMessage("system", `已切换到 ${MODEL_NAMES[currentModelIdx]}`); });
    document.getElementById("btn-model-next").addEventListener("click", () => { switchPetModel(1); updateModelBtn(1); addMessage("system", `已切换到 ${MODEL_NAMES[currentModelIdx]}`); });

    // --- 窗口控制 ---
    document.getElementById("btn-minimize").addEventListener("click", () => { try { pywebview.api.window_minimize().catch(() => {}); } catch (_) {} });
    document.getElementById("btn-quit").addEventListener("click", () => quitApp());

    // --- 设置面板 ---
    document.getElementById("setup-provider").addEventListener("change", onProviderChange);
    document.getElementById("btn-toggle-key").addEventListener("click", () => { const i = document.getElementById("setup-apikey"); const p = i.type === "password"; i.type = p ? "text" : "password"; document.getElementById("btn-toggle-key").textContent = p ? "🙈" : "👁"; });
    document.getElementById("setup-btn-test").addEventListener("click", doTestConnection);
    document.getElementById("setup-btn-save").addEventListener("click", doSaveSettings);
    document.getElementById("setup-btn-close").addEventListener("click", hideSetup);
    document.getElementById("setup-apikey").addEventListener("keydown", e => { if (e.key === "Enter") doTestConnection(); });

    // --- 快捷回复 ---
    document.querySelectorAll(".quick-replies button").forEach(b => b.addEventListener("click", () => sendQuickReply(b.dataset.text)));

    // --- 语音 ---
    initVoice();
    document.getElementById("btn-voice").addEventListener("click", toggleVoice);

    // --- 全局活动检测 ---
    document.addEventListener("click", () => recordActivity());
    document.addEventListener("keydown", () => recordActivity());

    // --- 通知权限 ---
    requestNotifyPermission();

    // --- 记忆面板 ---
    bindMemoryPanel();

    // --- 定时刷新记忆计数 ---
    setInterval(async () => { const st = await getStatus(); if (st.ready) updateMemoryCount(st.memories_count || 0); }, 30000);
}

// ==================== 模型按钮 ====================

let MODEL_NAMES = ["haru", "tororo"];  // 默认兜底，load 时被 getModels() 覆盖
let currentModelIdx = 0;

function updateModelBtn(direction) {
    currentModelIdx = (currentModelIdx + direction + MODEL_NAMES.length) % MODEL_NAMES.length;
    document.getElementById("btn-model-name").textContent = MODEL_NAMES[currentModelIdx];
}

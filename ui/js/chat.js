/**
 * 聊天主控：消息发送 + 事件绑定 + 初始化
 * ============================================================
 * 依赖：bridge.js, common.js, message.js, idle.js, voice.js,
 *        notify.js, memory-panel.js, setup-ui.js
 */
let _allModels = [];

function updateModelBtn(direction) {
    currentModelIdx = (currentModelIdx + direction + MODEL_NAMES.length) % MODEL_NAMES.length;
    document.getElementById("btn-model-name").textContent = MODEL_NAMES[currentModelIdx];
    if (_allModels[currentModelIdx]) {
        updateIdleConfig(_allModels[currentModelIdx].interactions);
    }
}

async function sendMessage() {
    if (isWaiting) return;
    const input = document.getElementById("chat-input"), text = input.value.trim();
    if (!text) return;
    recordActivity();
    addMessage("user", text); input.value = ""; idleChatSent = false;
    isWaiting = true; const btn = document.getElementById("send-btn"); btn.disabled = true; btn.textContent = "…";
    const result = await sendChat(text);
    addMessage("pet", result.text, true); updateFriendship(result.friendship); notifyPet(result.text);
    isWaiting = false; btn.disabled = false; btn.textContent = "发送"; input.focus();
}

async function doReset() {
    if (!confirm("确定要清除所有记忆吗？")) return;
    const result = await resetMemory();
    addMessage("system", result.text); updateFriendship(result.friendship); updateMemoryCount(0);
}

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
        updateMemoryCount(st.memories_count || 0);
        checkDailyReview();
    }
}

async function checkDailyReview() {
    const r = await dailyReview();
    if (r.ok && r.text) addMessage("system", "📝 昨日回顾：" + r.text);
}

function bindEvents() {
    document.getElementById("send-btn").addEventListener("click", sendMessage);
    document.getElementById("chat-input").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

    document.getElementById("btn-reset").addEventListener("click", doReset);
    document.getElementById("btn-settings").addEventListener("click", () => showSetup(true));
    document.getElementById("btn-new-chat").addEventListener("click", newConversation);
    document.getElementById("btn-chat-close").addEventListener("click", () => { try { pywebview.api.window_minimize().catch(() => {}); } catch (_) {} });

    document.getElementById("btn-model-prev").addEventListener("click", () => { switchPetModel(-1); updateModelBtn(-1); addMessage("system", `已切换到 ${MODEL_NAMES[currentModelIdx]}`); });
    document.getElementById("btn-model-next").addEventListener("click", () => { switchPetModel(1); updateModelBtn(1); addMessage("system", `已切换到 ${MODEL_NAMES[currentModelIdx]}`); });

    document.getElementById("btn-minimize").addEventListener("click", () => { try { pywebview.api.window_minimize().catch(() => {}); } catch (_) {} });
    document.getElementById("btn-quit").addEventListener("click", () => quitApp());

    document.getElementById("setup-provider").addEventListener("change", onProviderChange);
    document.getElementById("btn-toggle-key").addEventListener("click", () => { const i = document.getElementById("setup-apikey"); const p = i.type === "password"; i.type = p ? "text" : "password"; document.getElementById("btn-toggle-key").textContent = p ? "🙈" : "👁"; });
    document.getElementById("setup-btn-test").addEventListener("click", doTestConnection);
    document.getElementById("setup-btn-save").addEventListener("click", doSaveSettings);
    document.getElementById("setup-btn-close").addEventListener("click", hideSetup);
    document.getElementById("setup-btn-update").addEventListener("click", doCheckUpdate);
    document.getElementById("setup-apikey").addEventListener("keydown", e => { if (e.key === "Enter") doTestConnection(); });

    document.querySelectorAll(".quick-replies button").forEach(b => b.addEventListener("click", () => sendQuickReply(b.dataset.text)));

    initVoice();
    document.getElementById("btn-voice").addEventListener("click", toggleVoice);

    document.addEventListener("click", () => recordActivity());
    document.addEventListener("keydown", () => recordActivity());

    requestNotifyPermission();
    bindMemoryPanel();

    setInterval(async () => { const st = await getStatus(); if (st.ready) updateMemoryCount(st.memories_count || 0); }, 30000);
}

window.addEventListener("load", async () => {
    const modelsResult = await getModels();
    if (modelsResult.models && modelsResult.models.length) {
        _allModels = modelsResult.models;
        MODEL_NAMES = _allModels.map(m => m.name);
        document.getElementById("btn-model-name").textContent = MODEL_NAMES[0];
        if (_allModels[0]) updateIdleConfig(_allModels[0].interactions);
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
        if (result.settings === null) hint += " (未找到已保存的配置)";
        addMessage("system", hint);
    }

    bindEvents();
    startIdleWatcher();
});

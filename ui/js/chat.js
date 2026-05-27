/**
 * 聊天主控：消息发送 + 事件绑定 + 初始化
 * ============================================================
 * 依赖：bridge.js, common.js, message.js, idle.js, voice.js,
 *        notify.js, memory-panel.js, setup-ui.js
 */

function modelLabel(m) {
    if (!m) return "";
    if (m.variant_label) return m.display + " · " + m.variant_label;
    return m.display || m.name;
}

function getVariantModels() {
    const cur = getCurrentModel();
    if (!cur || !cur.base_name) return [];
    return _allModels.filter(m => m.base_name === cur.base_name);
}

function showVariantMenu() {
    const variants = getVariantModels();
    if (variants.length < 1) return;
    const menu = document.getElementById("variant-menu");
    menu.innerHTML = "";
    variants.forEach((v) => {
        const item = document.createElement("div");
        item.className = "variant-item";
        item.textContent = v.variant_label || v.display || v.name;
        if (v.name === (getCurrentModel() || {}).name) {
            item.classList.add("variant-active");
        }
        item.addEventListener("click", (e) => {
            e.stopPropagation();
            onSelectVariant(v.name);
            menu.style.display = "none";
        });
        menu.appendChild(item);
    });
    const btn = document.getElementById("btn-model-name");
    const rect = btn.getBoundingClientRect();
    menu.style.left = rect.left + "px";
    menu.style.top = (rect.bottom + 2) + "px";
    menu.style.display = "block";
    setTimeout(() => {
        document.addEventListener("click", function closeMenu() {
            menu.style.display = "none";
            document.removeEventListener("click", closeMenu);
        }, { once: true });
    }, 10);
}

async function onSelectVariant(modelName) {
    for (let i = 0; i < _allModels.length; i++) {
        if (_allModels[i].name === modelName) { currentModelIdx = i; break; }
    }
    await switchToModel(modelName);
    const m = getCurrentModel();
    if (m) {
        document.getElementById("btn-model-name").textContent = modelLabel(m);
        updateIdleConfig(m.interactions);
    }
    newConversation();
    addMessage("system", "已切换至 " + modelLabel(m));
}

function updateModelBtn(direction) {
    currentModelIdx = (currentModelIdx + direction + _allModels.length) % _allModels.length;
    const m = _allModels[currentModelIdx];
    document.getElementById("btn-model-name").textContent = modelLabel(m);
    if (m) updateIdleConfig(m.interactions);
}

async function sendMessage() {
    if (isWaiting) return;
    const input = document.getElementById("chat-input"), text = input.value.trim();
    if (!text) return;
    recordActivity();
    addMessage("user", text); input.value = ""; idleChatSent = false;
    isWaiting = true; const btn = document.getElementById("send-btn"); btn.disabled = true; btn.textContent = "…";
    const result = await sendChat(text, currentThreadId);
    addMessage("pet", result.text, true); notifyPet(result.text);
    isWaiting = false; btn.disabled = false; btn.textContent = "发送"; input.focus();
}

async function doReset() {
    if (!confirm("确定要清除所有记忆吗？")) return;
    const result = await resetMemory();
    addMessage("system", result.text); updateMemoryCount(0);
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

    document.getElementById("btn-model-prev").addEventListener("click", () => { switchPetModel(-1); updateModelBtn(-1); newConversation(); addMessage("system", "已切换到 " + modelLabel(_allModels[currentModelIdx])); });
    document.getElementById("btn-model-next").addEventListener("click", () => { switchPetModel(1); updateModelBtn(1); newConversation(); addMessage("system", "已切换到 " + modelLabel(_allModels[currentModelIdx])); });

    document.getElementById("btn-model-name").addEventListener("click", (e) => { e.stopPropagation(); showVariantMenu(); });

    document.getElementById("btn-minimize").addEventListener("click", () => { try { pywebview.api.window_minimize().catch(() => {}); } catch (_) {} });
    document.getElementById("btn-quit").addEventListener("click", () => quitApp());

    document.getElementById("setup-provider").addEventListener("change", onProviderChange);
    document.getElementById("btn-toggle-key").addEventListener("click", () => { const i = document.getElementById("setup-apikey"); const p = i.type === "password"; i.type = p ? "text" : "password"; document.getElementById("btn-toggle-key").textContent = p ? "🙈" : "👁"; });
    document.getElementById("setup-btn-test").addEventListener("click", doTestConnection);
    document.getElementById("setup-btn-save").addEventListener("click", doSaveSettings);
    document.getElementById("setup-btn-close").addEventListener("click", hideSetup);
    document.getElementById("setup-btn-update").addEventListener("click", doCheckUpdate);
    document.getElementById("setup-apikey").addEventListener("keydown", e => { if (e.key === "Enter") doTestConnection(); });

    document.querySelectorAll(".quick-replies button:not(#btn-refresh-replies)").forEach(b => b.addEventListener("click", () => sendQuickReply(b.dataset.text)));

    document.getElementById("btn-refresh-replies").addEventListener("click", refreshQuickReplies);

    initVoice();
    document.getElementById("btn-voice").addEventListener("click", toggleVoice);

    document.getElementById("btn-mute").addEventListener("click", () => {
        _audioMuted = !_audioMuted;
        document.getElementById("btn-mute").textContent = _audioMuted ? "🔇" : "🔊";
        saveAudioState();
    });
    const volSlider = document.getElementById("volume-slider");
    volSlider.addEventListener("input", () => {
        _audioVolume = parseInt(volSlider.value) / 100;
        saveAudioState();
    });
    volSlider.value = Math.round(_audioVolume * 100);
    document.getElementById("btn-mute").textContent = _audioMuted ? "🔇" : "🔊";

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
        currentModelIdx = 0;
        const m = _allModels[0];
        currentThreadId = m.name + "_" + Date.now();
        document.getElementById("btn-model-name").textContent = modelLabel(m);
        if (m) updateIdleConfig(m.interactions);
    }

    const p = await getProviders();
    if (p.providers) providerData = p.providers;

    const result = await loadSettingsWithRetry();
    if (result.ok && result.settings && result.settings.api_key) {
        savedSettings = result.settings;
        applyTheme(savedSettings.theme || "dark");
        if (result.ready) await doAutoInit(savedSettings);
        else {
            document.body.classList.remove("pet-mode");
            addMessage("system", "⚡ 自动连接失败：" + (result.error || "未知错误"));
        }
    } else {
        document.body.classList.remove("pet-mode");
        applyTheme("dark");
        let hint = "⚡ 欢迎！点击 ⚙ 设置 配置 API Key 后开始聊天";
        if (result.settings === null) hint += " (未找到已保存的配置)";
        addMessage("system", hint);
    }

    bindEvents();
    startIdleWatcher();
});

async function refreshQuickReplies() {
    const result = await generateQuickReplies();
    renderQuickReplies(result.replies || []);
}

function renderQuickReplies(replies) {
    const container = document.getElementById("quick-replies");
    const refreshBtn = document.getElementById("btn-refresh-replies");
    container.innerHTML = "";
    if (refreshBtn) container.appendChild(refreshBtn);
    if (!replies.length) {
        replies = ["在干嘛？", "摸摸头", "饿了吗", "讲个笑话", "不理你了", "晚安"];
    }
    replies.forEach(text => {
        const btn = document.createElement("button");
        btn.dataset.text = text;
        btn.textContent = text;
        btn.addEventListener("click", () => sendQuickReply(text));
        container.appendChild(btn);
    });
}

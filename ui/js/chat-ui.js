/**
 * 聊天窗口控制器
 * ============================================================
 * 职责：设置面板、消息收发、工具栏、事件绑定、模型切换
 *
 * 公共逻辑在 shared.js 中（空闲检测、消息渲染、语音输入、记忆面板等）
 * emotion 映射在 emotions.js 中
 *
 * 脚本加载顺序：bridge.js → emotions.js → shared.js → chat-ui.js
 */

// ==================== 模型按钮 ====================

function updateModelBtn(direction) {
    currentModelIdx = (currentModelIdx + direction + MODEL_NAMES.length) % MODEL_NAMES.length;
    document.getElementById("btn-model-name").textContent = MODEL_NAMES[currentModelIdx];
}

// ==================== 设置面板 ====================

function showSetup(isEdit) {
    const ov = document.getElementById("setup-overlay"); ov.style.display = "flex";
    document.getElementById("setup-subtitle").textContent = isEdit ? "修改设置" : "首次使用，请配置 LLM 连接";
    document.getElementById("setup-test-result").innerHTML = "";
    document.getElementById("setup-error").textContent = "";
    document.getElementById("setup-btn-save").disabled = true;
    connectionTested = false;
    if (isEdit && savedSettings) {
        document.getElementById("setup-provider").value = savedSettings.provider || "deepseek";
        document.getElementById("setup-apikey").value = savedSettings.api_key || "";
        document.getElementById("setup-baseurl").value = savedSettings.base_url || "";
        document.getElementById("setup-ontop").checked = savedSettings.on_top || false;
        document.getElementById("setup-autostart").checked = savedSettings.autostart || false;
    } else {
        document.getElementById("setup-apikey").value = "";
        document.getElementById("setup-ontop").checked = false;
        document.getElementById("setup-autostart").checked = false;
    }
    onProviderChange();
    if (isEdit && savedSettings && savedSettings.model_name) {
        const sel = document.getElementById("setup-model");
        let found = false;
        for (let i = 0; i < sel.options.length; i++) {
            if (sel.options[i].value === savedSettings.model_name) {
                sel.value = savedSettings.model_name;
                found = true;
                break;
            }
        }
        if (!found) {
            const o = document.createElement("option");
            o.value = savedSettings.model_name;
            o.textContent = savedSettings.model_name;
            o.selected = true;
            sel.appendChild(o);
        }
    }
}

function hideSetup() { document.getElementById("setup-overlay").style.display = "none"; }

function onProviderChange() {
    const s = document.getElementById("setup-provider");
    currentProvider = s.value;
    const info = providerData[currentProvider];
    const ug = document.getElementById("setup-url-group");
    if (currentProvider === "custom") ug.classList.remove("hidden");
    else { ug.classList.add("hidden"); const fb = FALLBACK_DEFAULTS[currentProvider]; document.getElementById("setup-baseurl").value = info ? info.base_url : (fb ? fb.base_url : ""); }
    const ms = document.getElementById("setup-model"); ms.innerHTML = "";
    const models = (info && info.models && info.models.length > 0) ? info.models : (FALLBACK_MODELS[currentProvider] || []);
    models.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m; ms.appendChild(o); });
    const dm = (info && info.default_model) ? info.default_model : (FALLBACK_DEFAULTS[currentProvider] ? FALLBACK_DEFAULTS[currentProvider].model : "");
    for (let i = 0; i < ms.options.length; i++) if (ms.options[i].value === dm) ms.value = dm;
    connectionTested = false; document.getElementById("setup-btn-save").disabled = true; document.getElementById("setup-test-result").innerHTML = "";
}

function getCurrentSettings() {
    const info = providerData[currentProvider];
    const fb = FALLBACK_DEFAULTS[currentProvider];
    return {
        provider: currentProvider,
        api_key: document.getElementById("setup-apikey").value.trim(),
        base_url: document.getElementById("setup-baseurl").value.trim() || (info ? info.base_url : (fb ? fb.base_url : "")),
        model_name: document.getElementById("setup-model").value || (info ? info.default_model : (fb ? fb.model : "")),
        on_top: document.getElementById("setup-ontop").checked,
        autostart: document.getElementById("setup-autostart").checked,
    };
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

async function doCheckUpdate() {
    const btn = document.getElementById("setup-btn-update");
    const result = document.getElementById("setup-update-result");
    btn.disabled = true; btn.textContent = "检查中..."; result.innerHTML = "";
    const res = await checkUpdate();
    btn.disabled = false; btn.textContent = "🔍 检查更新";
    if (!res.ok) {
        result.innerHTML = `<span class="test-result error">检查失败: ${res.error}</span>`;
        return;
    }
    if (res.has_update) {
        result.innerHTML = `<span class="test-result success">🎉 发现新版本 <b>${res.latest}</b>！（当前 ${res.current}）</span>
        <a href="${res.url}" target="_blank">👉 前往下载</a>`;
    } else {
        result.innerHTML = `<span class="test-result success">✓ 已是最新版本 (${res.current})</span>`;
    }
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

// ==================== 事件绑定 ====================

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

// ==================== 初始化 ====================

window.addEventListener("load", async () => {
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

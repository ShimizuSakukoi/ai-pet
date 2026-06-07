/**
 * 聊天主控 —— 适配新UI结构
 */
function modelLabel(m) {
    if (!m) return "";
    if (m.variant_label) return m.display + " \u00B7 " + m.variant_label;
    return m.display || m.name;
}

function getBaseModels() {
    var map = new Map();
    for (var i = 0; i < _allModels.length; i++) {
        var m = _allModels[i];
        var bn = m.base_name || m.name;
        if (!map.has(bn)) map.set(bn, []);
        map.get(bn).push(m);
    }
    return map;
}

async function selectModel(m) {
    currentModelIdx = _allModels.indexOf(m);
    var res = await switchToModel(m.name);
    if (res && res.ok === false) { currentModelIdx = 0; return; }
    document.getElementById("btn-model-name").textContent = modelLabel(m);
    var ct = document.getElementById("char-type");
    if (ct) ct.textContent = m.display || "";
    var ci = document.getElementById("char-icon");
    if (ci) ci.textContent = getModelEmoji(m.name);
    if (m.interactions) updateIdleConfig(m.interactions);
    currentThreadId = m.name + "_" + Date.now();
    document.getElementById("chat-area").innerHTML = "";
    addMessage("system", modelLabel(m) + " \u6765\u5566~ \u5F00\u59CB\u65B0\u5BF9\u8BDD\u5427\uFF01");
    idleChatSent = false;
    wasAway = false;
}

function getModelEmoji(name) {
    if (!name) return "\u{1F380}";
    if (name.indexOf("taihou") >= 0) return "\u{1F380}";
    if (name.indexOf("shimakaze") >= 0) return "\u{1F430}";
    return "\u{1F497}";
}

function showModelMenu() {
    var baseMap = getBaseModels();
    var curModel = getCurrentModel();
    var curBase = curModel ? (curModel.base_name || curModel.name) : "";
    var menu = document.getElementById("model-menu");

    function renderList() {
        menu.innerHTML = "";
        var title = document.createElement("div");
        title.textContent = "\u5207\u6362\u89D2\u8272";
        title.style.cssText = "color:var(--text-muted);font-size:11px;padding:4px 12px;border-bottom:1px solid var(--border);";
        menu.appendChild(title);

        baseMap.forEach(function (models, baseName) {
            var item = document.createElement("div");
            item.className = "mc-item";
            var hasVariants = models.length > 1;
            item.textContent = baseName + (hasVariants ? " \u25B6" : "");
            if (baseName === curBase) item.classList.add("active");
            item.addEventListener("click", async function (e) {
                e.stopPropagation();
                if (hasVariants) {
                    renderVariantList(baseName, models);
                } else {
                    await selectModel(models[0]);
                    menu.classList.add("hidden");
                }
            });
            menu.appendChild(item);
        });
    }

    function renderVariantList(baseName, variants) {
        menu.innerHTML = "";
        var back = document.createElement("div");
        back.className = "mc-item";
        back.textContent = "\u2190 \u8FD4\u56DE";
        back.style.cssText = "color:var(--text-muted);border-bottom:1px solid var(--border);";
        back.addEventListener("click", function (e) { e.stopPropagation(); renderList(); });
        menu.appendChild(back);
        for (var j = 0; j < variants.length; j++) {
            var v = variants[j];
            var item = document.createElement("div");
            item.className = "mc-item";
            item.textContent = v.variant_label || v.display || v.name;
            if (v.name === (curModel || {}).name) item.classList.add("active");
            item.addEventListener("click", async function (e) {
                e.stopPropagation();
                await selectModel(v);
                menu.classList.add("hidden");
            });
            menu.appendChild(item);
        }
    }

    renderList();

    var btn = document.getElementById("btn-model-name");
    var rect = btn.getBoundingClientRect();
    menu.style.left = (rect.left - 8) + "px";
    menu.style.top = (rect.bottom + 4) + "px";
    menu.classList.remove("hidden");

    setTimeout(function () {
        document.addEventListener("click", function closeMenu() {
            menu.classList.add("hidden");
            document.removeEventListener("click", closeMenu);
        }, { once: true });
    }, 10);
}

async function sendMessage() {
    if (isWaiting) return;
    var input = document.getElementById("chat-input"), text = input.value.trim();
    if (!text) return;
    recordActivity();
    addMessage("user", text); input.value = ""; idleChatSent = false;
    isWaiting = true; var btn = document.getElementById("send-btn");
    btn.disabled = true; btn.textContent = "\u22EF";
    showTyping();
    var result = await sendChat(text, currentThreadId);
    hideTyping();
    addMessage("pet", result.text, true); notifyPet(result.text);
    isWaiting = false; btn.disabled = false; btn.textContent = "\u25B6"; input.focus();
}

function showTyping() {
    var area = document.getElementById("chat-area");
    var dots = document.createElement("div");
    dots.className = "typing-dots";
    dots.id = "typing-indicator";
    for (var i = 0; i < 3; i++) { var s = document.createElement("span"); dots.appendChild(s); }
    area.appendChild(dots);
    area.scrollTop = area.scrollHeight;
}

function hideTyping() {
    var el = document.getElementById("typing-indicator");
    if (el) el.remove();
}

async function doReset() {
    if (!confirm("\u786E\u5B9A\u8981\u6E05\u9664\u6240\u6709\u8BB0\u5FC6\u5417\uFF1F")) return;
    var result = await resetMemory();
    addMessage("system", result.text); updateMemoryCount(0);
}

function loadSettingsWithRetry(n) {
    n = n || 20;
    return new Promise(async function (resolve) {
        for (var i = 0; i < n; i++) {
            if (typeof pywebview === "undefined" || !pywebview.api) {
                await new Promise(function (x) { setTimeout(x, 500); });
                continue;
            }
            var r = await loadSettings();
            if (r.ready) return resolve(r);
            if (r.settings !== null) return resolve(r);
            await new Promise(function (x) { setTimeout(x, 500); });
        }
        resolve({ ok: false, settings: null, ready: true });
    });
}

async function doAutoInit(s) {
    var st = await getStatus();
    if (st.ready) {
        updateMemoryCount(st.memories_count || 0);
        checkDailyReview();
    }
}

async function checkDailyReview() {
    var r = await dailyReview();
    if (r.ok && r.text) addMessage("system", "\u65E5\u5386: " + r.text);
}

function renderQuickReplies(replies) {
    var container = document.getElementById("quick-replies");
    var refreshBtn = document.getElementById("btn-refresh-replies");
    container.innerHTML = "";
    if (refreshBtn) container.appendChild(refreshBtn);
    if (!replies.length) {
        replies = ["\u5728\u5E72\u561B\uFF1F", "\u6478\u6478\u5934", "\u8BB2\u4E2A\u7B11\u8BDD", "\u665A\u5B89"];
    }
    replies.forEach(function (text) {
        var btn = document.createElement("div");
        btn.className = "qr-card";
        btn.textContent = text;
        btn.addEventListener("click", function () { sendQuickReply(text); });
        container.appendChild(btn);
    });
}

async function refreshQuickReplies() {
    var result = await generateQuickReplies();
    renderQuickReplies(result.replies || []);
}

function bindEvents() {
    document.getElementById("send-btn").addEventListener("click", sendMessage);
    document.getElementById("chat-input").addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
    document.getElementById("btn-settings").addEventListener("click", function () { showSetup(true); });
    document.getElementById("btn-model-name").addEventListener("click", function (e) { e.stopPropagation(); showModelMenu(); });
    document.getElementById("btn-chat-close").addEventListener("click", function () { try { pywebview.api.window_minimize().catch(function () {}); } catch (_) {} });
    document.getElementById("setup-provider").addEventListener("change", onProviderChange);
    document.getElementById("btn-toggle-key").addEventListener("click", function () { var i = document.getElementById("setup-apikey"); var p = i.type === "password"; i.type = p ? "text" : "password"; document.getElementById("btn-toggle-key").textContent = p ? "\uD83D\uDE48" : "\uD83D\uDC41"; });
    document.getElementById("setup-btn-test").addEventListener("click", doTestConnection);
    document.getElementById("setup-btn-save").addEventListener("click", doSaveSettings);
    document.getElementById("setup-btn-close").addEventListener("click", hideSetup);
    document.getElementById("setup-btn-update").addEventListener("click", doCheckUpdate);
    document.getElementById("setup-apikey").addEventListener("keydown", function (e) { if (e.key === "Enter") doTestConnection(); });
    document.getElementById("setup-volume").addEventListener("input", function () { _audioVolume = parseInt(document.getElementById("setup-volume").value) / 100; document.getElementById("setup-vol-val").textContent = document.getElementById("setup-volume").value; saveAudioState(); });
    document.getElementById("btn-refresh-replies").addEventListener("click", refreshQuickReplies);
    document.getElementById("btn-mute").addEventListener("click", function () { _audioMuted = !_audioMuted; document.getElementById("btn-mute").textContent = _audioMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A"; saveAudioState(); });
    document.getElementById("btn-mute").textContent = _audioMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
    document.addEventListener("click", function () { recordActivity(); });
    document.addEventListener("keydown", function () { recordActivity(); });
    requestNotifyPermission();
    bindMemoryPanel();
    bindOverlayClose("setup-overlay", hideSetup);
    bindOverlayClose("mem-overlay", hideMemories);
    bindDiaryPanel();
    setInterval(async function () { var st = await getStatus(); if (st.ready) updateMemoryCount(st.memories_count || 0); }, 30000);
}

function bindOverlayClose(overlayId, closeFn) {
    var overlay = document.getElementById(overlayId);
    if (overlay) {
        overlay.addEventListener("click", function (e) { if (e.target === e.currentTarget) closeFn(); });
    }
}

function bindDiaryPanel() {
    var btn = document.createElement("button");
    btn.textContent = "\uD83D\uDCD6";
    btn.title = "\u65E5\u8BB0\u672C";
    btn.style.cssText = "background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;transition:var(--transition);-webkit-app-region:no-drag;";
    btn.addEventListener("click", showDiaryPanel);
    var btns = document.querySelector(".chat-header-btns");
    if (btns) { btns.insertBefore(btn, btns.firstChild); }

    document.getElementById("diary-btn-close").addEventListener("click", function () { document.getElementById("diary-overlay").classList.add("hidden"); });
    bindOverlayClose("diary-overlay", function () { document.getElementById("diary-overlay").classList.add("hidden"); });
    document.getElementById("diary-btn-generate").addEventListener("click", async function () {
        var genBtn = document.getElementById("diary-btn-generate");
        genBtn.disabled = true; genBtn.textContent = "\u751F\u6210\u4E2D...";
        var res = await generateDiary();
        genBtn.disabled = false; genBtn.textContent = "\u270D \u5199\u65E5\u8BB0";
        if (res.ok) { showToast(res.already ? "\u4ECA\u5929\u5DF2\u6709\u65E5\u8BB0" : "\u65E5\u8BB0\u5DF2\u751F\u6210"); await refreshDiaryList(); }
        else { showToast("\u751F\u6210\u5931\u8D25: " + (res.error || "")); }
    });
}

async function showDiaryPanel() {
    document.getElementById("diary-overlay").classList.remove("hidden");
    await refreshDiaryList();
}

async function refreshDiaryList() {
    var list = document.getElementById("diary-list");
    var data = await getDiaryEntries();
    var entries = data.entries || [];
    list.innerHTML = "";
    if (!entries.length) {
        list.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">\u6682\u65E0\u65E5\u8BB0</div>';
        return;
    }
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var div = document.createElement("div");
        div.className = "diary-entry";
        div.innerHTML = '<div class="diary-date">' + e.date + '</div>' + e.content.replace(/\n/g, "<br>");
        list.appendChild(div);
    }
}

function showToast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
}

window.addEventListener("load", async function () {
    var modelsResult = await getModels();
    if (modelsResult.models && modelsResult.models.length) {
        _allModels = modelsResult.models;
        currentModelIdx = 0;
        var m = _allModels[0];
        currentThreadId = m.name + "_" + Date.now();
        document.getElementById("btn-model-name").textContent = modelLabel(m);
        var ct = document.getElementById("char-type");
        if (ct) ct.textContent = m.display || m.name;
        var ci = document.getElementById("char-icon");
        if (ci) ci.textContent = getModelEmoji(m.name);
        if (m) updateIdleConfig(m.interactions);
    }

    var p = await getProviders();
    if (p.providers) providerData = p.providers;

    var result = await loadSettingsWithRetry();
    if (result.ok && result.settings && result.settings.api_key) {
        savedSettings = result.settings;
        applyTheme(savedSettings.theme || "dark");
        if (result.ready) await doAutoInit(savedSettings);
        else { addMessage("system", "\u81EA\u52A8\u8FDE\u63A5\u5931\u8D25\uFF1A" + (result.error || "\u672A\u77E5\u9519\u8BEF")); }
    } else {
        applyTheme("dark");
        var hint = "\u6B22\u8FCE\uFF01\u70B9\u51FB \u2699 \u914D\u7F6E API Key \u540E\u5F00\u59CB\u804A\u5929";
        if (result.settings === null) hint += " (\u672A\u627E\u5230\u5DF2\u4FDD\u5B58\u7684\u914D\u7F6E)";
        addMessage("system", hint);
    }

    bindEvents();
    startIdleWatcher();
    refreshQuickReplies();
});

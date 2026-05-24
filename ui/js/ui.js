/**
 * UI 交互控制器 — 所有前端逻辑的集中管理
 * ============================================================
 * 负责：设置面板流程、聊天开关、消息收发、空闲检测、
 *       浮动面板拖拽/缩放、语音输入、记忆管理面板。
 *
 * 浮动图层架构：
 *   - 模型面板（#model-area）：Live2D 角色，点击全身可拖拽
 *   - 聊天面板（#chat-section）：对话窗口，标题栏拖拽，右下角缩放
 *   - 两个面板 z-index 竞争，点击自动提至最前
 *   - body.pet-mode 控制聊天面板显隐
 *
 * 通信方式：所有后端调用通过 bridge.js 封装的 pywebview.api.xxx()
 */

// ==================== 全局状态变量 ====================

// --- 请求锁 ---
let isWaiting = false;        // 等待 LLM 回复时为 true，阻止重复发送

// --- 设置流程 ---
let connectionTested = false;  // API 连接测试是否通过
let currentProvider = "deepseek"; // 当前选中的 API 提供商
let savedSettings = null;      // 已保存的设置对象（含 api_key/base_url/model 等）
let providerData = {};         // 后端返回的提供商列表（含可用模型）

// --- 对话线程 ---
let currentThreadId = genId(); // 当前对话线程 ID（切换新对话时更新）

// ==================== 空闲计时变量 ====================
// 目的：检测主人离开/回来，触发 welcome 和 idle 互动

let lastInteraction = Date.now(); // 最后一次交互时间戳
let idleChatSent = false;         // 本轮空闲是否已触发搭话
let wasAway = false;              // 是否处于"离开"状态
let awayStart = 0;                // 离开开始时间戳
const IDLE_CHAT_MS = 600000;     // 10 分钟无操作 → 主动搭话
const IDLE_WELCOME_MS = 300000;  // 5 分钟无操作 → 标记离开

// ==================== TTS 语音合成 ====================
let ttsEnabled = false; // 当前未接入训练模型，占位

// ==================== 聊天开关状态 ====================
let chatOpen = false;   // 聊天面板是否打开（与 body.pet-mode 联动）

// ==================== 浮动面板拖拽 & 缩放状态 ====================
// 设计：两个面板各自独立拖拽，全局只有一个 dragState / resizeState
//       防止同时拖拽两个面板的冲突

let zIndexCounter = 100;   // 全局 z-index 计数器（单调递增）
let dragState = null;      // 当前拖拽状态 { panel, startX, startY, panelLeft, panelTop, moved }
let resizeState = null;    // 当前缩放状态 { panel, startX, startY, startW, startH, minW, minH }
const DRAG_THRESHOLD = 3;  // 鼠标移动超过 3px 才算拖拽（区分点击和拖拽）

// ==================== 模型 & API 兜底数据 ====================
// 当 Bridge 未就绪或后端返回空时，用这些本地数据填充下拉框

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

// ========================================================================
//                           初 始 化 流 程
// ========================================================================

/**
 * 页面加载完成后执行的主初始化流程：
 *   1. 加载 Live2D 模型
 *   2. 初始化浮动面板拖拽系统
 *   3. 从后端获取 LLM 提供商列表
 *   4. 尝试加载已保存的设置 → 自动连接或显示设置面板
 *   5. 绑定所有 UI 事件
 *   6. 启动空闲检测定时器
 */
window.addEventListener("load", async () => {
    initLive2D();
    initFloatingPanels();
    const p = await getProviders();
    if (p.providers) providerData = p.providers;
    const result = await loadSettingsWithRetry();
    if (result.ok && result.settings && result.settings.api_key) {
        savedSettings = result.settings;
        if (result.ready) await doAutoInit(savedSettings);
        else {
            showSetup(true);
            document.getElementById("setup-test-result").innerHTML =
                result.error ? `<span class="test-result error">${result.error}</span>` : "";
        }
    } else {
        showSetup(false);
    }
    bindEvents();
    startIdleWatcher();
});

/**
 * 带重试的加载设置
 * pywebview 的 Bridge API 可能在页面加载早期还未就绪，
 * 所以加 5 次 400ms 间隔的重试。
 * @param {number} n - 最大重试次数，默认 5
 */
function loadSettingsWithRetry(n = 5) {
    return new Promise(async resolve => {
        for (let i = 0; i < n; i++) {
            const r = await loadSettings();
            if (r.settings !== null) return resolve(r);
            await new Promise(x => setTimeout(x, 400));
        }
        resolve({ ok: false, settings: null });
    });
}

/**
 * 自动初始化（设置已保存 → 直接进聊天）
 * 首次启动时先跳设置面板，保存一次后下次自动跳过。
 * @param {object} s - 已保存的设置对象
 */
async function doAutoInit(s) {
    const st = await getStatus();
    if (st.ready) {
        hideSetup();
        document.getElementById("btn-model-name").textContent = s.live2d_model || "haru";
        updateMemoryCount(st.memories_count || 0);
        checkDailyReview();
    } else {
        showSetup(false);
        document.getElementById("setup-error").textContent = "自动连接失败：请检查 API Key";
    }
}

/** 每日回顾：获取 LLM 生成的昨日对话总结 */
async function checkDailyReview() {
    const r = await dailyReview();
    if (r.ok && r.text) addMessage("system", "📝 昨日回顾：" + r.text);
}

// ========================================================================
//                   浮 动 面 板 系 统
// ========================================================================

/**
 * 初始化浮动面板的拖拽、缩放、层级管理
 *   - 模型面板：整个面板区域为拖拽把手
 *   - 聊天面板：标题栏（.chat-header）为拖拽把手
 *   - 聊天面板右下角：缩放把手
 *   - 点击面板 → 提升 z-index 至最前
 *   - 注册全局 mousemove / mouseup 监听器（共享，避免重复绑定）
 */
function initFloatingPanels() {
    const modelPanel = document.getElementById("model-area");
    const chatPanel = document.getElementById("chat-section");
    const chatHeader = document.getElementById("chat-header");
    const resizeHandle = document.getElementById("resize-handle");
    const chatToggle = document.getElementById("chat-toggle-btn");

    // 注册拖拽（handle = 触发拖拽的元素，panel = 被移动的元素）
    makeDraggable(modelPanel, modelPanel);   // 模型面板：点任意位置即可拖
    makeDraggable(chatPanel, chatHeader);    // 聊天面板：只有标题栏可拖
    makeResizable(chatPanel, resizeHandle);   // 聊天面板右下角缩放

    // 任一面板被点击时提至最前
    [modelPanel, chatPanel].forEach(p => {
        p.addEventListener("mousedown", () => bringToFront(p));
    });

    // 聊天切换按钮（pet-mode 时可见）
    chatToggle.addEventListener("click", () => openChat(true));

    // 全局移动/释放监听（共享，所有面板的拖拽路由到这里）
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
}

/**
 * 将面板提至所有浮动元素的最上层
 * 每次调用增加全局计数器，确保最后点击的面板一定在最前面。
 * @param {HTMLElement} el - 面板 DOM 元素
 */
function bringToFront(el) {
    zIndexCounter += 1;
    el.style.zIndex = zIndexCounter;
}

/**
 * 注册面板的拖拽能力
 * mousedown 时记录起始位置，实际移动在全局 onMouseMove 中处理。
 * 设计要点：
 *   - 点击按钮/输入框时不触发拖拽（避免干扰交互元素）
 *   - 移动超过 DRAG_THRESHOLD 像素后才算"拖拽"，否则是普通点击
 *   - 不调用 e.preventDefault()，保留 Live2D 的交互事件（拖拽旋转等）
 * @param {HTMLElement} panel - 被移动的面板
 * @param {HTMLElement} handle - 拖拽把手（点击此元素才能拖拽面板）
 */
function makeDraggable(panel, handle) {
    handle.addEventListener("mousedown", (e) => {
        // 已有拖拽/缩放在进行中，忽略
        if (dragState || resizeState) return;
        // 点击在按钮/输入框上 → 不启动拖拽，让元素处理自己的事件
        if (e.target.closest("button, input, textarea, select")) return;

        const rect = panel.getBoundingClientRect();
        dragState = {
            panel,                         // 被拖拽的面板
            startX: e.clientX,             // 鼠标起始 X
            startY: e.clientY,             // 鼠标起始 Y
            panelLeft: rect.left,          // 面板起始 left
            panelTop: rect.top,            // 面板起始 top
            moved: false,                  // 是否已超过拖拽阈值
        };
    });
}

/**
 * 注册聊天面板的右下角缩放能力
 * @param {HTMLElement} panel - 聊天面板
 * @param {HTMLElement} handle - 缩放把手（右下角小三角）
 */
function makeResizable(panel, handle) {
    handle.addEventListener("mousedown", (e) => {
        if (dragState || resizeState) return;
        const rect = panel.getBoundingClientRect();
        resizeState = {
            panel,
            startX: e.clientX,
            startY: e.clientY,
            startW: rect.width,            // 缩放前宽度
            startH: rect.height,           // 缩放前高度
            panelLeft: rect.left,
            panelTop: rect.top,
            minW: 280,                     // 最小宽度
            minH: 180,                     // 最小高度（标题栏 + 工具栏 + 输入行）
        };
        e.preventDefault();     // 防止触发文本选中
        e.stopPropagation();    // 防止冒泡到拖拽逻辑
    });
}

/**
 * 全局鼠标移动处理器
 * 根据 dragState / resizeState 的类型决定是拖拽还是缩放。
 * 拖拽时允许面板部分移出屏幕（只保留 40px 边距），
 * 让用户可以"藏"面板到屏幕边缘。
 */
function onMouseMove(e) {
    // --- 面板拖拽 ---
    if (dragState) {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;

        // 首次超过阈值 → 标记为"正在拖拽"
        if (!dragState.moved && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            dragState.moved = true;
            dragState.panel.classList.add("dragging");
        }

        if (dragState.moved) {
            // 计算新位置
            let nx = dragState.panelLeft + dx;
            let ny = dragState.panelTop + dy;

            // 边界限制：允许面板露出 40px，其余可移出屏幕
            const maxOffX = dragState.panel.offsetWidth - 40;
            const maxOffY = dragState.panel.offsetHeight - 40;
            nx = Math.max(-maxOffX, Math.min(window.innerWidth - 40, nx));
            ny = Math.max(-maxOffY, Math.min(window.innerHeight - 40, ny));

            dragState.panel.style.left = nx + "px";
            dragState.panel.style.top = ny + "px";
        }
    }

    // --- 聊天面板缩放 ---
    if (resizeState) {
        const dx = e.clientX - resizeState.startX;
        const dy = e.clientY - resizeState.startY;
        const nw = Math.max(resizeState.minW, resizeState.startW + dx);
        const nh = Math.max(resizeState.minH, resizeState.startH + dy);
        resizeState.panel.style.width = nw + "px";
        resizeState.panel.style.height = nh + "px";
    }
}

/**
 * 全局鼠标释放处理器
 * 清理拖拽/缩放状态，移除视觉拖拽样式
 */
function onMouseUp() {
    if (dragState) {
        dragState.panel.classList.remove("dragging");
        dragState = null;
    }
    if (resizeState) {
        resizeState = null;
    }
}

// ========================================================================
//                       设 置 面 板
// ========================================================================

/**
 * 显示设置面板
 * @param {boolean} isEdit - true=修改已有设置，false=首次配置
 */
function showSetup(isEdit) {
    const ov = document.getElementById("setup-overlay");
    ov.style.display = "flex";
    document.getElementById("setup-subtitle").textContent =
        isEdit ? "修改设置" : "首次使用，请配置 LLM 连接";
    document.getElementById("setup-test-result").innerHTML = "";
    document.getElementById("setup-error").textContent = "";
    document.getElementById("setup-btn-save").disabled = true;
    connectionTested = false;

    if (isEdit && savedSettings) {
        // 回填已保存的值
        document.getElementById("setup-provider").value = savedSettings.provider || "deepseek";
        document.getElementById("setup-apikey").value = savedSettings.api_key || "";
        document.getElementById("setup-baseurl").value = savedSettings.base_url || "";
        document.getElementById("setup-name").value = savedSettings.pet_name || "小橘";
        document.getElementById("setup-type").value = savedSettings.pet_type || "cat";
        document.getElementById("setup-ontop").checked = savedSettings.on_top || false;
    } else {
        // 首次配置：默认值
        document.getElementById("setup-apikey").value = "";
        document.getElementById("setup-name").value = "小橘";
        document.getElementById("setup-ontop").checked = false;
    }

    onProviderChange(); // 刷新模型列表

    // 回填已保存的模型名（如果不在下拉列表中，追加一个临时选项）
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

/** 隐藏设置面板 */
function hideSetup() {
    document.getElementById("setup-overlay").style.display = "none";
}

/**
 * API 提供商下拉框变化时：
 *   1. 自定义提供商 → 显示 Base URL 输入框
 *   2. 更新模型下拉列表
 *   3. 重置测试状态
 */
function onProviderChange() {
    const s = document.getElementById("setup-provider");
    currentProvider = s.value;
    const info = providerData[currentProvider];

    // Base URL 显隐
    const ug = document.getElementById("setup-url-group");
    if (currentProvider === "custom") {
        ug.classList.remove("hidden");
    } else {
        ug.classList.add("hidden");
        const fb = FALLBACK_DEFAULTS[currentProvider];
        document.getElementById("setup-baseurl").value =
            info ? info.base_url : (fb ? fb.base_url : "");
    }

    // 刷新模型下拉列表
    const ms = document.getElementById("setup-model");
    ms.innerHTML = "";
    const models = (info && info.models && info.models.length > 0)
        ? info.models
        : (FALLBACK_MODELS[currentProvider] || []);
    models.forEach(m => {
        const o = document.createElement("option");
        o.value = m;
        o.textContent = m;
        ms.appendChild(o);
    });

    // 选中默认模型
    const dm = (info && info.default_model)
        ? info.default_model
        : (FALLBACK_DEFAULTS[currentProvider] ? FALLBACK_DEFAULTS[currentProvider].model : "");
    for (let i = 0; i < ms.options.length; i++) {
        if (ms.options[i].value === dm) ms.value = dm;
    }

    // 换提供商 → 必须重新测试连接
    connectionTested = false;
    document.getElementById("setup-btn-save").disabled = true;
    document.getElementById("setup-test-result").innerHTML = "";
}

/**
 * 从表单收集当前设置
 * @returns {object} 设置对象 { provider, api_key, base_url, model_name, pet_name, pet_type, on_top }
 */
function getCurrentSettings() {
    const info = providerData[currentProvider];
    const fb = FALLBACK_DEFAULTS[currentProvider];
    return {
        provider: currentProvider,
        api_key: document.getElementById("setup-apikey").value.trim(),
        base_url: document.getElementById("setup-baseurl").value.trim() ||
            (info ? info.base_url : (fb ? fb.base_url : "")),
        model_name: document.getElementById("setup-model").value ||
            (info ? info.default_model : (fb ? fb.model : "")),
        pet_name: document.getElementById("setup-name").value.trim() || "小橘",
        pet_type: document.getElementById("setup-type").value || "cat",
        on_top: document.getElementById("setup-ontop").checked,
    };
}

/** 测试 LLM 连接（发一条简单消息验证 API Key 有效） */
async function doTestConnection() {
    const b = document.getElementById("setup-btn-test");
    const r = document.getElementById("setup-test-result");
    const k = document.getElementById("setup-apikey").value.trim();

    if (!k) {
        r.innerHTML = '<span class="test-result error">请先填写 API Key</span>';
        return;
    }

    b.disabled = true;
    b.textContent = "测试中...";
    r.innerHTML = "";

    const s = getCurrentSettings();
    const res = await testConnection(s);

    b.disabled = false;
    b.textContent = "🔌 测试连接";

    if (res.ok) {
        r.innerHTML = `<span class="test-result success">✓ 连接成功！回复: "${res.test_reply}"</span>`;
        connectionTested = true;
        document.getElementById("setup-btn-save").disabled = false;
    } else {
        r.innerHTML = `<span class="test-result error">✗ 连接失败: ${res.error}</span>`;
        connectionTested = false;
        document.getElementById("setup-btn-save").disabled = true;
    }
}

/** 保存设置到后端 → 初始化 Agent → 打开聊天 */
async function doSaveSettings() {
    if (!connectionTested) {
        document.getElementById("setup-error").textContent = "请先测试连接";
        return;
    }

    const b = document.getElementById("setup-btn-save");
    b.disabled = true;
    b.textContent = "保存中...";
    document.getElementById("setup-error").textContent = "";

    const s = getCurrentSettings();
    savedSettings = s;
    const res = await saveSettings(s);

    if (res.ok) {
        hideSetup();
        openChat(true);
        const nm = s.pet_name || "小橘";
        addMessage("system", `${nm} 来了！`);
        updateMemoryCount(0);
    } else {
        document.getElementById("setup-error").textContent =
            "保存失败：" + (res.error || "未知错误");
        b.disabled = false;
        b.textContent = "💾 保存并开始";
    }
}

// ========================================================================
//                        聊 天 开 关
// ========================================================================

/**
 * 切换聊天面板显隐
 * 通过 body.pet-mode CSS class 控制：
 *   - pet-mode → 聊天面板隐藏，右下角 💬 按钮显示
 *   - 非 pet-mode → 聊天面板可见
 * @param {boolean} [open] - true=打开, false=关闭, undefined=切换
 */
function openChat(open) {
    if (open === undefined) open = !chatOpen;
    chatOpen = open;
    if (open) {
        document.body.classList.remove("pet-mode");
        const cs = document.getElementById("chat-section");
        bringToFront(cs);
        // 延迟聚焦输入框（等待 CSS transition 完成）
        setTimeout(() => document.getElementById("chat-input").focus(), 400);
    } else {
        document.body.classList.add("pet-mode");
    }
}

// ========================================================================
//                        消 息 收 发
// ========================================================================

/**
 * 发送消息的主流程：
 *   1. 防重复发送检查（isWaiting）
 *   2. 空消息过滤
 *   3. 聊天未打开 → 自动打开
 *   4. 前端即时显示用户消息
 *   5. 调用后端 sendChat → 显示 AI 回复
 *   6. 更新情绪、好感度
 *   7. 系统通知（如已授权）
 */
async function sendMessage() {
    if (isWaiting) return;

    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    // 聊天未打开 → 自动打开
    if (!chatOpen) openChat(true);

    recordActivity();
    addMessage("user", text);
    input.value = "";
    idleChatSent = false;

    // 请求锁 + 按钮禁用
    isWaiting = true;
    const btn = document.getElementById("send-btn");
    btn.disabled = true;
    btn.textContent = "…";

    const result = await sendChat(text, currentThreadId);

    // 显示 AI 回复 + 附带 TTS 播放按钮
    addMessage("pet", result.text, true);
    setPetMood(result.mood);
    updateFriendship(result.friendship);
    notifyPet(result.text);

    // 解锁
    isWaiting = false;
    btn.disabled = false;
    btn.textContent = "发送";
    input.focus();
}

/**
 * 重置所有记忆（需用户确认）
 * 调用后端 reset → 清空长期记忆 + SQLite 对话历史
 */
async function doReset() {
    if (!confirm("确定要清除所有记忆吗？")) return;
    const result = await resetMemory();
    addMessage("system", result.text);
    setPetMood(result.mood);
    updateFriendship(result.friendship);
    updateMemoryCount(0);
}

// ========================================================================
//                       互 动 动 作
// ========================================================================

/**
 * 双击宠物模型 → 抚摸互动
 * 触发 petAction("pet") + 模型面板闪烁动画
 */
async function onPetDblClick() {
    recordActivity();
    const result = await petAction("pet");
    if (result.text) {
        addMessage("pet", result.text, true);
        setPetMood(result.mood);
        updateFriendship(result.friendship);
        notifyPet(result.text);
    }
    // 模型面板闪烁反馈
    const ma = document.getElementById("model-area");
    ma.classList.add("pet-flash");
    setTimeout(() => ma.classList.remove("pet-flash"), 400);
}

/** 主人回来后触发欢迎互动 */
async function onWelcomeBack() {
    wasAway = false;
    if (!chatOpen) openChat(true);
    const result = await petAction("welcome");
    if (result.text) {
        addMessage("pet", result.text, true);
        setPetMood(result.mood);
        updateFriendship(result.friendship);
        notifyPet(result.text);
    }
}

/** 主人长时间无操作 → 宠物主动搭话 */
async function onIdleChat() {
    if (idleChatSent) return;
    idleChatSent = true;
    if (!chatOpen) openChat(true);
    const result = await petAction("idle");
    if (result.text) {
        addMessage("pet", result.text, true);
        setPetMood(result.mood);
        updateFriendship(result.friendship);
        notifyPet(result.text);
    }
}

// ========================================================================
//                       空 闲 检 测
// ========================================================================

/** 记录用户活动时间，检测离开→回来状态转换 */
function recordActivity() {
    lastInteraction = Date.now();

    // 如果之前标记为离开，且离开超过 WELCOME 阈值 → 触发欢迎
    if (wasAway && (Date.now() - awayStart > IDLE_WELCOME_MS)) {
        onWelcomeBack();
    }

    wasAway = false;
    idleChatSent = false;
}

/** 启动空闲检测定时器（每 5 秒检查一次） */
function startIdleWatcher() {
    setInterval(() => {
        const idle = Date.now() - lastInteraction;
        if (idle > IDLE_WELCOME_MS && !wasAway) {
            wasAway = true;
            awayStart = Date.now() - idle;
        }
        if (idle > IDLE_CHAT_MS && !idleChatSent) {
            onIdleChat();
        }
    }, 5000);
}

// ========================================================================
//                       系 统 通 知
// ========================================================================

/** 发送桌面通知（不响铃） */
function notifyPet(text) {
    if (!text || text.length < 2) return;
    try {
        if (Notification.permission === "granted") {
            new Notification("Pet 说：", {
                body: text.substring(0, 100),
                silent: true,
            });
        }
    } catch (_) { /* 通知不可用时静默忽略 */ }
}

/** 请求桌面通知权限（首次加载时调用一次） */
function requestNotifyPermission() {
    try {
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
    } catch (_) { /* 不支持则静默忽略 */ }
}

// ========================================================================
//                    TTS 语 音 合 成
// ========================================================================

/** 朗读指定文本（需先开启 TTS） */
async function doSpeak(text) {
    if (!ttsEnabled) return;
    await speak(text);
}

/** 切换 TTS 开关状态 */
function toggleTTS() {
    ttsEnabled = !ttsEnabled;
    const b = document.getElementById("btn-speak-toggle");
    if (ttsEnabled) {
        b.textContent = "🔊";
        b.classList.add("speak-on");
        document.getElementById("tts-status").textContent = "TTS:就绪";
    } else {
        b.textContent = "🔇";
        b.classList.remove("speak-on");
        document.getElementById("tts-status").textContent = "TTS:待接入";
    }
}

// ========================================================================
//                       辅 助 方 法
// ========================================================================

/**
 * 在聊天区添加一条消息
 * @param {string} role - "user" | "pet" | "system"
 * @param {string} content - 消息文本
 * @param {boolean} [withSpeak] - 是否为 pet 消息附加 TTS 播放按钮
 */
function addMessage(role, content, withSpeak) {
    const chatArea = document.getElementById("chat-area");
    const prefix =
        role === "user" ? "你: " :
        role === "pet" ? "Pet: " :
        role === "system" ? "⚡ " : "";

    if (role === "pet" && withSpeak) {
        // Pet 消息附带朗读按钮
        const row = document.createElement("div");
        row.className = "message-row";
        const spk = document.createElement("button");
        spk.className = "speak-btn";
        spk.textContent = "🔊";
        spk.title = "播放";
        spk.addEventListener("click", () => doSpeak(content));
        const msg = document.createElement("div");
        msg.className = "message pet msg-content";
        msg.textContent = prefix + content;
        row.appendChild(spk);
        row.appendChild(msg);
        chatArea.appendChild(row);
    } else {
        // 普通消息
        const d = document.createElement("div");
        d.className = `message ${role}`;
        d.textContent = prefix + content;
        chatArea.appendChild(d);
    }

    // 自动滚到底部
    chatArea.scrollTop = chatArea.scrollHeight;
}

/** 更新好感度进度条 */
function updateFriendship(v) {
    const el = document.getElementById("friendship-bar");
    if (el) {
        el.style.width = v + "%";
        el.title = "好感度: " + v + "/100";
    }
}

/** 更新记忆条数显示 */
function updateMemoryCount(c) {
    const el = document.getElementById("mem-count");
    if (el) el.textContent = c;
}

// ========================================================================
//                       新 对 话
// ========================================================================

/** 开始新对话：生成新 threadId，清空聊天区，重置空闲状态 */
function newConversation() {
    if (isWaiting) return;
    currentThreadId = genId();
    document.getElementById("chat-area").innerHTML = "";
    addMessage("system", "新对话开始~");
    idleChatSent = false;
    wasAway = false;
    document.getElementById("chat-input").focus();
}

/**
 * 生成唯一 ID
 * 用时间戳 + 随机数，足够满足桌宠场景
 * @returns {string} 唯一标识符
 */
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ========================================================================
//                       快 捷 回 复
// ========================================================================

/** 点击快捷回复按钮 → 填入输入框并自动发送 */
function sendQuickReply(text) {
    document.getElementById("chat-input").value = text;
    sendMessage();
}

// ========================================================================
//                       语 音 输 入
// ========================================================================

let recognition = null;   // SpeechRecognition 实例
let isRecording = false;  // 是否正在录音

/**
 * 初始化语音识别
 * 使用 Web Speech API（Chrome/Edge 支持）
 * 不支持时隐藏麦克风按钮
 */
function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        document.getElementById("btn-voice").style.display = "none";
        return;
    }
    recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = e => {
        const t = e.results[0][0].transcript.trim();
        if (t) {
            document.getElementById("chat-input").value = t;
            document.getElementById("chat-input").focus();
        }
        stopVoiceUI();
    };
    recognition.onerror = recognition.onend = () => stopVoiceUI();
}

/** 切换语音输入状态 */
function toggleVoice() {
    if (!recognition) return;
    if (isRecording) {
        recognition.stop();
    } else {
        try {
            recognition.start();
            isRecording = true;
            const b = document.getElementById("btn-voice");
            b.classList.add("recording");
            b.textContent = "🔴";
        } catch (_) {
            stopVoiceUI();
        }
    }
}

/** 停止录音，恢复按钮样式 */
function stopVoiceUI() {
    isRecording = false;
    const b = document.getElementById("btn-voice");
    b.classList.remove("recording");
    b.textContent = "🎤";
}

// ========================================================================
//                    记 忆 管 理 面 板
// ========================================================================

let editingMemId = null; // 当前正在编辑的记忆 ID

/** 绑定记忆管理面板的事件 */
function bindMemoryPanel() {
    document.getElementById("btn-memories").addEventListener("click", () => showMemories());
    document.getElementById("mem-btn-close").addEventListener("click", hideMemories);
    // 点击遮罩层关闭
    document.getElementById("mem-overlay").addEventListener("click", e => {
        if (e.target === e.currentTarget) hideMemories();
    });
    document.getElementById("mem-btn-cancel").addEventListener("click", cancelEdit);
    document.getElementById("mem-btn-save").addEventListener("click", saveEdit);
}

/** 显示记忆管理面板 */
async function showMemories() {
    document.getElementById("mem-overlay").style.display = "flex";
    cancelEdit();
    await refreshMemList();
}

/** 隐藏记忆管理面板 */
function hideMemories() {
    document.getElementById("mem-overlay").style.display = "none";
    cancelEdit();
}

/** 刷新记忆列表 */
async function refreshMemList() {
    const l = document.getElementById("mem-list");
    const { memories } = await getMemories();
    if (!memories || !memories.length) {
        l.innerHTML = '<div style="color:#555;text-align:center;padding:20px;">暂无记忆</div>';
        return;
    }
    l.innerHTML = memories.map(m =>
        `<div class="mem-item">
            <div class="mem-content">
                <div>${esc(m.content)}</div>
                <div class="mem-meta">${m.timestamp ? m.timestamp.slice(0, 16).replace('T', ' ') : ''} · ${m.category || ''}</div>
            </div>
            <div class="mem-actions">
                <button onclick="startEdit('${m.id}','${esc(m.content)}')">✎</button>
                <button class="del-btn" onclick="doDeleteMemory('${m.id}')">✕</button>
            </div>
        </div>`
    ).join("");
}

/** 进入编辑模式 */
function startEdit(mid, content) {
    editingMemId = mid;
    document.getElementById("mem-edit-area").classList.remove("hidden");
    document.getElementById("mem-edit-input").value = content;
    document.getElementById("mem-edit-input").focus();
}

/** 取消编辑 */
function cancelEdit() {
    editingMemId = null;
    document.getElementById("mem-edit-area").classList.add("hidden");
    document.getElementById("mem-edit-input").value = "";
}

/** 保存编辑后的记忆 */
async function saveEdit() {
    const i = document.getElementById("mem-edit-input");
    const c = i.value.trim();
    if (!c || !editingMemId) return;
    await updateMemory(editingMemId, c);
    cancelEdit();
    await refreshMemList();
}

/** 删除单条记忆 */
async function doDeleteMemory(mid) {
    await deleteMemory(mid);
    await refreshMemList();
    updateMemoryCount(await getMemCount());
}

/** 获取当前记忆条数 */
async function getMemCount() {
    const st = await getStatus();
    return st.memories_count || 0;
}

/**
 * HTML 转义 — 防止 XSS
 * @param {string} s - 待转义字符串
 * @returns {string} HTML 安全的字符串
 */
function esc(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ========================================================================
//                      事 件 绑 定
// ========================================================================

/**
 * 集中绑定所有 UI 事件处理器
 * 在页面初始化完成后调用一次
 */
function bindEvents() {
    // --- 聊天输入 ---
    document.getElementById("send-btn").addEventListener("click", sendMessage);
    document.getElementById("chat-input").addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- 工具栏按钮 ---
    document.getElementById("btn-reset").addEventListener("click", doReset);
    document.getElementById("btn-settings").addEventListener("click", () => showSetup(true));
    document.getElementById("btn-new-chat").addEventListener("click", newConversation);
    document.getElementById("btn-chat-close").addEventListener("click", () => openChat(false));
    document.getElementById("btn-speak-toggle").addEventListener("click", toggleTTS);
    document.getElementById("btn-model-prev").addEventListener("click", () => switchModel(-1));
    document.getElementById("btn-model-next").addEventListener("click", () => switchModel(1));

    // --- 窗口控制 ---
    document.getElementById("btn-minimize").addEventListener("click", () => {
        try { pywebview.api.window_minimize().catch(() => {}); } catch (_) {}
    });
    document.getElementById("btn-quit").addEventListener("click", () => quitApp());

    // --- 设置面板 ---
    document.getElementById("setup-provider").addEventListener("change", onProviderChange);
    document.getElementById("btn-toggle-key").addEventListener("click", () => {
        const i = document.getElementById("setup-apikey");
        const p = i.type === "password";
        i.type = p ? "text" : "password";
        document.getElementById("btn-toggle-key").textContent = p ? "🙈" : "👁";
    });
    document.getElementById("setup-btn-test").addEventListener("click", doTestConnection);
    document.getElementById("setup-btn-save").addEventListener("click", doSaveSettings);
    document.getElementById("setup-btn-close").addEventListener("click", hideSetup);
    document.getElementById("setup-apikey").addEventListener("keydown", e => {
        if (e.key === "Enter") doTestConnection();
    });

    // --- 快捷回复 ---
    document.querySelectorAll(".quick-replies button").forEach(b =>
        b.addEventListener("click", () => sendQuickReply(b.dataset.text))
    );

    // --- 语音输入 ---
    initVoice();
    document.getElementById("btn-voice").addEventListener("click", toggleVoice);

    // --- 模型面板交互 ---
    // 双击 → 抚摸
    document.getElementById("model-area").addEventListener("dblclick", e => {
        e.preventDefault();
        if (!chatOpen) openChat(true);
        onPetDblClick();
    });
    // 单击 → 打开聊天（如果关了的话）
    document.getElementById("model-area").addEventListener("click", () => {
        if (!chatOpen) openChat(true);
    });

    // --- 全局活动检测 ---
    document.addEventListener("click", () => recordActivity());
    document.addEventListener("keydown", () => recordActivity());

    // --- 通知权限 ---
    requestNotifyPermission();

    // --- 记忆面板 ---
    bindMemoryPanel();

    // --- 定时刷新记忆计数 ---
    setInterval(async () => {
        const st = await getStatus();
        if (st.ready) updateMemoryCount(st.memories_count || 0);
    }, 30000);
}

/**
 * JS-to-Python 桥接封装（Bridge）
 * ============================================================
 * pywebview 框架自动将 Python handler.py 中不带下划线前缀的方法
 * 暴露为 pywebview.api.xxx() 供前端调用。
 *
 * 本文件对每个 API 做参数适配 + 错误兜底，确保 UI 不会因 Python 异常而崩溃。
 *
 * 调用链：
 *   ui.js → bridge.js (本文件) → pywebview.api.xxx() → handler.py → agent/*
 *
 * 每个函数返回 { ok, ...其他字段 } 或带默认值的兜底对象
 */

/**
 * 加载已保存的设置（settings.json）
 * @returns {{ ok: boolean, settings: object|null, ready: boolean }}
 */
async function loadSettings() {
    try { return await pywebview.api.load_settings(); }
    catch (_) { return { ok: false, settings: null, ready: false }; }
}

/**
 * 保存设置到磁盘 + 初始化 Agent
 * @param {object} settings - { provider, api_key, base_url, model_name, pet_name, pet_type, on_top }
 * @returns {{ ok: boolean, error?: string }}
 */
async function saveSettings(settings) {
    try { return await pywebview.api.save_settings(settings); }
    catch (_) { return { ok: false, error: "保存失败" }; }
}

/**
 * 测试 LLM 连接（发一条简单消息验证 API Key）
 * @param {object} settings - 同 saveSettings
 * @returns {{ ok: boolean, test_reply?: string, error?: string }}
 */
async function testConnection(settings) {
    try { return await pywebview.api.test_connection(settings); }
    catch (_) { return { ok: false, error: "连接超时" }; }
}

/**
 * 获取 LLM 提供商列表 & 模型选项（给前端下拉框用）
 * @returns {{ providers: object }}
 */
async function getProviders() {
    try { return await pywebview.api.get_providers(); }
    catch (_) { return { providers: {} }; }
}

/**
 * 发送聊天消息 → 获取 AI 回复
 * @param {string} text - 用户输入
 * @param {string} threadId - 对话线程 ID
 * @returns {{ text: string }}
 */
async function sendChat(text, threadId) {
    try { return await pywebview.api.chat(text, threadId || null); }
    catch (_) { return { text: "（连接断开）" }; }
}

/**
 * 重置所有记忆（清除长期记忆 + SQLite 对话历史）
 * @returns {{ text: string }}
 */
async function resetMemory() {
    try { return await pywebview.api.reset(); }
    catch (_) { return { text: "重置失败" }; }
}

/**
 * 获取当前宠物状态
 * @returns {{ ready: boolean, memories_count: number }}
 */
async function getStatus() {
    try { return await pywebview.api.get_status(); }
    catch (_) { return { ready: false, memories_count: 0 }; }
}

// ====== 窗口控制 ======

/** 切换窗口置顶 */
async function toggleOnTop() {
    try { return await pywebview.api.toggle_on_top(); }
    catch (_) { return { on_top: false }; }
}

/** 显示窗口 */
async function windowShow() {
    try { return await pywebview.api.window_show(); }
    catch (_) { return { ok: false }; }
}

/** 最小化窗口 */
async function windowHide() {
    try { return await pywebview.api.window_minimize(); }
    catch (_) { return { ok: false }; }
}

/** 退出程序 */
async function quitApp() {
    try { return await pywebview.api.quit_app(); }
    catch (_) {}
}

// ====== 互动动作 ======

/**
 * 发送特殊互动动作
 * @param {string} actionType - "pet"|"drag"|"welcome"|"idle"
 * @returns {{ text: string, action: string }}
 */
async function petAction(actionType, threadId) {
    try { return await pywebview.api.pet_action(actionType, threadId || null); }
    catch (_) { return { text: "", action: actionType }; }
}

/**
 * 每日回顾：获取 LLM 生成的昨日对话总结
 * @returns {{ text: string, ok: boolean }}
 */
async function dailyReview() {
    try { return await pywebview.api.daily_review(); }
    catch (_) { return { text: "", ok: false }; }
}

// ====== 模型 ======

async function getModels() {
    for (let i = 0; i < 20; i++) {
        if (typeof pywebview !== "undefined" && pywebview.api) {
            try { return await pywebview.api.get_models(); }
            catch (_) { /* retry */ }
        }
        await new Promise(x => setTimeout(x, 300));
    }
    return { models: [] };
}

/**
 * 切换宠物窗口的 Live2D 模型
 * @param {number} direction - -1=上一个, 1=下一个
 */
async function switchPetModel(direction) {
    try { return await pywebview.api.switch_model(direction); }
    catch (_) { return { ok: false }; }
}

// ====== 开机自启 ======

async function getAutoStart() {
    try { return await pywebview.api.get_autostart(); }
    catch (_) { return { enabled: false }; }
}

async function setAutoStart(enable) {
    try { return await pywebview.api.set_autostart(enable); }
    catch (_) { return { ok: false }; }
}

// ====== 版本检测 ======

async function checkUpdate() {
    try { return await pywebview.api.check_update(); }
    catch (_) { return { ok: false, error: "调用失败" }; }
}

async function generateQuickReplies() {
    try { return await pywebview.api.generate_quick_replies(); }
    catch (_) { return { replies: [] }; }
}

async function getAudio(modelName, audioPath) {
    try { return await pywebview.api.get_audio(modelName, audioPath); }
    catch (_) { return null; }
}

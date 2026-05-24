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
 * @returns {{ text: string, mood: string, friendship: number }}
 */
async function sendChat(text, threadId) {
    try { return await pywebview.api.chat(text, threadId || "default"); }
    catch (_) { return { text: "（连接断开）", mood: "neutral", friendship: 0 }; }
}

/**
 * 重置所有记忆（清除长期记忆 + SQLite 对话历史）
 * @returns {{ text: string, mood: string, friendship: number }}
 */
async function resetMemory() {
    try { return await pywebview.api.reset(); }
    catch (_) { return { text: "重置失败", mood: "neutral", friendship: 0 }; }
}

/**
 * 获取当前宠物状态
 * @returns {{ ready: boolean, mood: string, friendship: number, memories_count: number }}
 */
async function getStatus() {
    try { return await pywebview.api.get_status(); }
    catch (_) { return { ready: false, mood: "neutral", friendship: 0, memories_count: 0 }; }
}

// ====== 窗口控制 ======

/** 切换窗口置顶 */
async function toggleOnTop() {
    try { return await pywebview.api.toggle_on_top(); }
    catch (_) { return { on_top: false }; }
}

// ====== 互动动作 ======

/**
 * 发送特殊互动动作
 * @param {string} actionType - "pet"|"drag"|"welcome"|"idle"
 * @returns {{ text: string, mood: string, friendship: number, action: string }}
 */
async function petAction(actionType) {
    try { return await pywebview.api.pet_action(actionType); }
    catch (_) { return { text: "", mood: "neutral", friendship: 0, action: actionType }; }
}

/**
 * 每日回顾：获取 LLM 生成的昨日对话总结
 * @returns {{ text: string, ok: boolean }}
 */
async function dailyReview() {
    try { return await pywebview.api.daily_review(); }
    catch (_) { return { text: "", ok: false }; }
}

// ====== TTS 语音合成（当前占位） ======

/**
 * TTS 语音合成接口
 * 当前返回空数据，后续接入训练好的本地 TTS 模型
 * @param {string} text - 待朗读文本
 * @returns {{ audio: any|null, format: string }}
 */
async function speak(text) {
    try { return await pywebview.api.speak(text); }
    catch (_) { return { audio: null, format: "" }; }
}

// ====== 记忆管理 ======

/**
 * 获取所有长期记忆
 * @returns {{ memories: Array<{id, content, timestamp, category}> }}
 */
async function getMemories() {
    try { return await pywebview.api.get_memories(); }
    catch (_) { return { memories: [] }; }
}

/**
 * 删除单条记忆
 * @param {string} mid - 记忆 ID
 * @returns {{ ok: boolean }}
 */
async function deleteMemory(mid) {
    try { return await pywebview.api.delete_memory(mid); }
    catch (_) { return { ok: false }; }
}

/**
 * 修改单条记忆内容
 * @param {string} mid - 记忆 ID
 * @param {string} content - 新内容
 * @returns {{ ok: boolean }}
 */
async function updateMemory(mid, content) {
    try { return await pywebview.api.update_memory(mid, content); }
    catch (_) { return { ok: false }; }
}

// ====== 应用控制 ======

/** 退出应用（关闭所有窗口） */
async function quitApp() {
    try { await pywebview.api.quit_app(); }
    catch (_) {}
}

// ====== 跨窗口通信 ======

/**
 * 获取自动发现的模型列表
 * @returns {{ models: Array<{name: string, model_file: string}> }}
 */
async function getModels() {
    try { return await pywebview.api.get_models(); }
    catch (_) { return { models: [{name: "haru", model_file: "haru01.model.json"}, {name: "tororo", model_file: "tororo.model.json"}] }; }
}

/**
 * 显示聊天窗口（从宠物窗口右键触发）
 */
async function windowShow() {
    try { return await pywebview.api.window_show(); }
    catch (_) { return { ok: false }; }
}

/**
 * 移动聊天窗口（JS 拖拽标题栏用）
 * @param {number} x - 新 X 坐标
 * @param {number} y - 新 Y 坐标
 */
async function windowMove(x, y) {
    try { return await pywebview.api.window_move(x, y); }
    catch (_) { return { ok: false }; }
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

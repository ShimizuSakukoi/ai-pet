/**
 * 宠物窗口控制器
 * ============================================================
 * 职责：
 *   - 初始化 Live2D 模型
 *   - 双击抚摸互动
 *   - 右键打开聊天窗口
 *   - 定期轮询情绪/好感度状态
 *   - 闪烁反馈动画
 */

// ==================== 全局状态 ====================
let lastFlash = null;

// ==================== 初始化 ====================

window.addEventListener("load", async () => {
    const result = await getModels();
    if (result.models && result.models.length) {
        setModels(result.models);
    }
    initLive2D();
    bindPetEvents();
    startMoodPoller();
});

// ==================== 事件绑定 ====================

function bindPetEvents() {
    const container = document.querySelector(".pet-container");

    // 双击 → 抚摸互动
    container.addEventListener("dblclick", async (e) => {
        e.preventDefault();
        container.classList.add("pet-flash");
        setTimeout(() => container.classList.remove("pet-flash"), 400);

        const result = await petAction("pet");
        if (result.text) {
            updateMoodTag(result.mood);
        }
    });

    // 右键 → 打开聊天窗口
    container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        windowShow();
    });
}

// ==================== 状态轮询 ====================

function startMoodPoller() {
    setInterval(async () => {
        const st = await getStatus();
        if (st.ready && st.mood) {
            updateMoodTag(st.mood);
        }
    }, 5000);
}

function updateMoodTag(mood) {
    const tag = document.querySelector(".mood-tag");
    if (!tag || !mood) return;

    const emoji = {
        happy: "😊 开心",
        sad: "😢 难过",
        angry: "😠 生气",
        sleepy: "😴 困了",
        excited: "🎉 兴奋",
        neutral: "😐 普通",
    };
    tag.textContent = emoji[mood] || mood;
}

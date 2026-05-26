/**
 * 桌面通知
 * ============================================================
 * 依赖：无（自包含）
 */
function notifyPet(text) {
    if (!text || text.length < 2) return;
    try { if (Notification.permission === "granted") new Notification("Pet 说：", { body: text.substring(0, 100), silent: true }); } catch (_) {}
}

function requestNotifyPermission() {
    try { if ("Notification" in window && Notification.permission === "default") Notification.requestPermission(); } catch (_) {}
}

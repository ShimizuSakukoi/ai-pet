/**
 * 空闲检测
 * ============================================================
 * 依赖：bridge.js, common.js, message.js
 */
let IDLE_CHAT_MS = 600000;
let IDLE_WELCOME_MS = 300000;

function updateIdleConfig(interactions) {
    if (interactions) {
        IDLE_CHAT_MS = (interactions.idle_timeout || 600) * 1000;
        IDLE_WELCOME_MS = (interactions.welcome_timeout || 300) * 1000;
    }
}
function recordActivity() {
    lastInteraction = Date.now();
    if (wasAway && (Date.now() - awayStart > IDLE_WELCOME_MS)) onWelcomeBack();
    wasAway = false;
    idleChatSent = false;
}

function startIdleWatcher() {
    setInterval(() => {
        const idle = Date.now() - lastInteraction;
        if (idle > IDLE_WELCOME_MS && !wasAway) { wasAway = true; awayStart = Date.now() - idle; }
        if (idle > IDLE_CHAT_MS && !idleChatSent) onIdleChat();
    }, 5000);
}

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

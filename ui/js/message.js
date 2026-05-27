/**
 * 消息渲染
 * ============================================================
 * 依赖：common.js
 */
function addMessage(role, content, withSpeak) {
    const chatArea = document.getElementById("chat-area");
    const modelName = MODEL_NAMES[currentModelIdx] || "Pet";
    const prefix = role === "user" ? "你: " : role === "pet" ? modelName + ": " : role === "system" ? "⚡ " : "";
    const d = document.createElement("div");
    d.className = `message ${role}`;
    d.textContent = prefix + content;
    chatArea.appendChild(d);
    chatArea.scrollTop = chatArea.scrollHeight;
}


function updateMemoryCount(c) {
    const el = document.getElementById("mem-count");
    if (el) el.textContent = c;
}

function newConversation() {
    if (isWaiting) return;
    document.getElementById("chat-area").innerHTML = "";
    currentThreadId = (MODEL_NAMES[currentModelIdx] || "pet") + "_" + Date.now();
    addMessage("system", "新对话开始~");
    idleChatSent = false;
    wasAway = false;
    document.getElementById("chat-input").focus();
}

function sendQuickReply(text) {
    document.getElementById("chat-input").value = text;
    sendMessage();
}

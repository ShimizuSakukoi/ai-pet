/**
 * 消息渲染 —— 气泡格式
 */
function addMessage(role, content, withSpeak) {
    var area = document.getElementById("chat-area");
    var m = getCurrentModel();
    var modelName = m ? (m.display || m.name) : "角色";

    var row = document.createElement("div");
    row.className = "msg-row " + (role === "system" ? "system" : role);

    if (role === "pet") {
        var avatar = document.createElement("div");
        avatar.className = "msg-avatar pet";
        avatar.textContent = modelName.charAt(0);
        row.appendChild(avatar);
    }

    if (role === "user") {
        var ua = document.createElement("div");
        ua.className = "msg-avatar user";
        ua.textContent = "你";
        row.appendChild(ua);
    }

    var body = document.createElement("div");
    body.className = "msg-body";
    body.textContent = (role === "system" ? "" : (role === "user" ? "" : "")) + content;
    row.appendChild(body);

    area.appendChild(row);
    area.scrollTop = area.scrollHeight;

    if (window.haptics && window.haptics.animateMessage) {
        window.haptics.animateMessage(row);
    }
}

function updateMemoryCount(c) {
    var el = document.getElementById("mem-count");
    if (el) el.textContent = c;
}

function newConversation() {
    if (isWaiting) return;
    document.getElementById("chat-area").innerHTML = "";
    var m = getCurrentModel();
    currentThreadId = (m ? m.name : "pet") + "_" + Date.now();
    addMessage("system", "新对话开始~");
    idleChatSent = false;
    wasAway = false;
    document.getElementById("chat-input").focus();
}

function sendQuickReply(text) {
    document.getElementById("chat-input").value = text;
    sendMessage();
}

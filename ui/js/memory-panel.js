/**
 * 记忆面板 UI — 三层架构支持
 * ============================================================
 * 依赖：bridge.js, common.js, message.js
 */
let editingMemId = null;

const LAYER_LABELS = { core: "核心", preference: "偏好", episodic: "情境" };
const LAYER_COLORS = { core: "#f0a500", preference: "#4fc3f7", episodic: "#888" };

function bindMemoryPanel() {
    document.getElementById("btn-memories").addEventListener("click", () => showMemories());
    document.getElementById("mem-btn-close").addEventListener("click", hideMemories);
    document.getElementById("mem-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) hideMemories(); });
    document.getElementById("mem-btn-cancel").addEventListener("click", cancelEdit);
    document.getElementById("mem-btn-save").addEventListener("click", saveEdit);
    document.getElementById("mem-btn-add").addEventListener("click", addMemoryFromInput);
    document.getElementById("mem-add-input").addEventListener("keydown", e => { if (e.key === "Enter") addMemoryFromInput(); });
    document.getElementById("mem-btn-clear").addEventListener("click", clearAllMemories);
}

async function showMemories() {
    document.getElementById("mem-overlay").classList.remove("hidden");
    cancelEdit();
    await refreshMemList();
}

function hideMemories() {
    document.getElementById("mem-overlay").classList.add("hidden");
    cancelEdit();
}

function _scoreBar(score) {
    var pct = Math.round(Math.max(0, Math.min(1, score || 0)) * 100);
    var color = pct > 70 ? "#4caf50" : pct > 30 ? "#f0a500" : "#e94560";
    return '<span class="mem-score-bar" style="display:inline-block;width:40px;height:4px;border-radius:2px;background:var(--bg-tertiary);margin-right:4px;vertical-align:middle;">'
        + '<span style="display:block;height:100%;border-radius:2px;background:' + color + ';width:' + pct + '%;"></span></span>';
}

async function refreshMemList() {
    var list = document.getElementById("mem-list");
    var data = await getMemories();
    var memories = data.memories || [];
    var clearBtn = document.getElementById("mem-btn-clear");
    list.innerHTML = "";

    if (!memories.length) {
        var empty = document.createElement("div");
        empty.style.cssText = "color:var(--text-system);text-align:center;padding:20px;";
        empty.textContent = "暂无记忆";
        list.appendChild(empty);
        clearBtn.style.display = "none";
        return;
    }
    clearBtn.style.display = "";

    memories.forEach(function (m) {
        var item = document.createElement("div");
        item.className = "mem-item";

        var contentDiv = document.createElement("div");
        contentDiv.className = "mem-content";

        var topRow = document.createElement("div");
        topRow.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:2px;";

        var layerTag = document.createElement("span");
        var layer = m.layer || "episodic";
        layerTag.style.cssText = "font-size:10px;padding:1px 6px;border-radius:8px;color:#fff;background:" + LAYER_COLORS[layer] + ";flex-shrink:0;";
        layerTag.textContent = LAYER_LABELS[layer] || layer;
        topRow.appendChild(layerTag);

        var scoreHtml = _scoreBar(m.score);
        var scoreSpan = document.createElement("span");
        scoreSpan.innerHTML = scoreHtml;
        topRow.appendChild(scoreSpan);

        contentDiv.appendChild(topRow);

        var textDiv = document.createElement("div");
        textDiv.textContent = m.content;
        textDiv.style.cssText = "margin-top:3px;";
        contentDiv.appendChild(textDiv);

        var meta = document.createElement("div");
        meta.className = "mem-meta";
        var ts = m.timestamp ? m.timestamp.slice(0, 16).replace("T", " ") : "";
        meta.textContent = ts + (m.reference_count ? " · 引用" + m.reference_count + "次" : "");
        contentDiv.appendChild(meta);

        var actions = document.createElement("div");
        actions.className = "mem-actions";

        if (layer !== "core") {
            var pinBtn = document.createElement("button");
            pinBtn.textContent = "📌";
            pinBtn.title = "置顶为核心";
            pinBtn.addEventListener("click", function () { doPromoteMemory(m.id); });
            actions.appendChild(pinBtn);
        }

        var editBtn = document.createElement("button");
        editBtn.textContent = "✎";
        editBtn.addEventListener("click", function () { startEdit(m.id, m.content); });
        actions.appendChild(editBtn);

        var delBtn = document.createElement("button");
        delBtn.className = "del-btn";
        delBtn.textContent = "✕";
        delBtn.addEventListener("click", function () { doDeleteMemory(m.id); });
        actions.appendChild(delBtn);

        item.appendChild(contentDiv);
        item.appendChild(actions);
        list.appendChild(item);
    });
}

async function doPromoteMemory(mid) {
    await promoteMemory(mid);
    await refreshMemList();
}

function startEdit(mid, content) {
    editingMemId = mid;
    document.getElementById("mem-edit-area").classList.remove("hidden");
    document.getElementById("mem-edit-input").value = content;
    document.getElementById("mem-edit-input").focus();
}

function cancelEdit() {
    editingMemId = null;
    document.getElementById("mem-edit-area").classList.add("hidden");
    document.getElementById("mem-edit-input").value = "";
}

async function saveEdit() {
    var i = document.getElementById("mem-edit-input"), c = i.value.trim();
    if (!c || !editingMemId) return;
    await updateMemory(editingMemId, c);
    cancelEdit();
    await refreshMemList();
}

async function doDeleteMemory(mid) {
    await deleteMemory(mid);
    await refreshMemList();
    updateMemoryCount(await getMemCount());
}

async function addMemoryFromInput() {
    var input = document.getElementById("mem-add-input");
    var sel = document.getElementById("mem-add-category");
    var content = input.value.trim();
    if (!content) return;
    await addMemory(content, sel.value);
    input.value = "";
    await refreshMemList();
    updateMemoryCount(await getMemCount());
}

async function clearAllMemories() {
    if (!confirm("确定要清除全部记忆吗？此操作不可撤销。")) return;
    await deleteAllMemories();
    await refreshMemList();
    updateMemoryCount(0);
}

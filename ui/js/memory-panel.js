/**
 * 记忆面板 UI
 * ============================================================
 * 依赖：bridge.js, common.js, message.js
 */
let editingMemId = null;

function bindMemoryPanel() {
    document.getElementById("btn-memories").addEventListener("click", () => showMemories());
    document.getElementById("mem-btn-close").addEventListener("click", hideMemories);
    document.getElementById("mem-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) hideMemories(); });
    document.getElementById("mem-btn-cancel").addEventListener("click", cancelEdit);
    document.getElementById("mem-btn-save").addEventListener("click", saveEdit);
}

async function showMemories() {
    document.getElementById("mem-overlay").style.display = "flex";
    cancelEdit();
    await refreshMemList();
}

function hideMemories() {
    document.getElementById("mem-overlay").style.display = "none";
    cancelEdit();
}

async function refreshMemList() {
    const l = document.getElementById("mem-list");
    const { memories } = await getMemories();
    if (!memories || !memories.length) {
        l.innerHTML = '<div style="color:#555;text-align:center;padding:20px;">暂无记忆</div>';
        return;
    }
    l.innerHTML = memories.map(m =>
        `<div class="mem-item"><div class="mem-content"><div>${esc(m.content)}</div><div class="mem-meta">${m.timestamp ? m.timestamp.slice(0, 16).replace('T', ' ') : ''} · ${m.category || ''}</div></div><div class="mem-actions"><button onclick="startEdit('${m.id}','${esc(m.content)}')">✎</button><button class="del-btn" onclick="doDeleteMemory('${m.id}')">✕</button></div></div>`
    ).join("");
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
    const i = document.getElementById("mem-edit-input"), c = i.value.trim();
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

/**
 * 宠物窗口控制器 —— 基于 interactions.json 的触摸命中检测
 * ============================================================
 * 职责：
 *   - 初始化 Live2D 模型
 *   - 根据当前模型的 interactions.zones 动态绑定触摸事件
 *   - 命中检测（相对坐标 vs hit 区域）
 *   - 右键打开聊天窗口
 *   - 拖拽检测（mousedown/move/up）
 *   - 触摸音频播放（zone.audio 随机选取）
 *
 * 模型切换时重新加载 zones
 */
let _interactions = null;
let _currentZones = [];

let _modelLoaded = false;
let _dragState = null;

window.addEventListener("load", async () => {
    await tryLoadModel();
    bindPetEvents();
    if (!_modelLoaded) {
        setTimeout(async () => { await tryLoadModel(); }, 2000);
    }
});

async function tryLoadModel() {
    if (_modelLoaded) return;
    const result = await getModels();
    if (result.models && result.models.length) {
        _allModels = result.models;
        const m = result.models[0];
        _interactions = m.interactions || {};
        _currentZones = _interactions.zones || [];
        _modelLoaded = true;
    }
    initLive2D();
}

function onModelChange(modelIndex) {
    if (_allModels && _allModels[modelIndex]) {
        _interactions = _allModels[modelIndex].interactions || {};
        _currentZones = _interactions.zones || [];
    }
}

function bindPetEvents() {
    const container = document.querySelector(".pet-container");

    container.addEventListener("dblclick", (e) => {
        const zone = hitTest(e);
        if (zone && zone.trigger === "dblclick") {
            e.preventDefault();

            if (zone.motion && typeof playMotion === "function") {
                playMotion(zone.motion);
            }
            if (_touchAudioEnabled && zone.audio) playZoneAudio(zone.audio);
            if (_touchReplyEnabled) petAction(zone.action, currentThreadId);
        }
    });

    container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        windowShow();
    });

    container.addEventListener("mousedown", (e) => {
        const zone = hitTest(e);
        if (zone && zone.trigger === "drag") {
            _dragState = { startX: e.clientX, startY: e.clientY, triggered: false, zone: zone };
        }
    });

    document.addEventListener("mousemove", (e) => {
        if (!_dragState) return;
        const dx = Math.abs(e.clientX - _dragState.startX);
        const dy = Math.abs(e.clientY - _dragState.startY);
        if ((dx > 5 || dy > 5) && !_dragState.triggered) {
            _dragState.triggered = true;
            if (_dragState.zone.motion && typeof playMotion === "function") {
                playMotion(_dragState.zone.motion);
            }
            if (_touchAudioEnabled && _dragState.zone.audio) playZoneAudio(_dragState.zone.audio);
            if (_touchReplyEnabled) petAction("drag", currentThreadId);
        }
    });

    document.addEventListener("mouseup", () => {
        _dragState = null;
    });
}

function hitTest(e) {
    const container = document.querySelector(".pet-container");
    const rect = container.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top) / rect.height;

    for (const zone of _currentZones) {
        const [zx, zy, zw, zh] = zone.hit;
        if (rx >= zx && rx <= zx + zw && ry >= zy && ry <= zy + zh) {
            return zone;
        }
    }
    return null;
}

function playZoneAudio(audioList) {
    if (!audioList || !audioList.length) return;
    if (typeof audioList === "string") audioList = [audioList];

    _audioVolume = parseFloat(localStorage.getItem("pet_audio_volume") || "1.0");
    _audioMuted = localStorage.getItem("pet_audio_muted") === "true";
    if (_audioMuted || _audioVolume <= 0) return;

    const pick = audioList[Math.floor(Math.random() * audioList.length)];
    const m = _allModels[currentModelIdx];
    const audioDir = m ? m.name : "taihou";
    getAudio(audioDir, pick).then(res => {
        if (res && res.audio) {
            const audio = new Audio("data:" + res.mime + ";base64," + res.audio);
            audio.volume = _audioVolume;
            audio.play().catch(() => {});
        }
    });
}

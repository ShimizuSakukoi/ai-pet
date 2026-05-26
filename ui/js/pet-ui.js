/**
 * 宠物窗口控制器 —— 基于 interactions.json 的触摸命中检测
 * ============================================================
 * 职责：
 *   - 初始化 Live2D 模型
 *   - 根据当前模型的 interactions.zones 动态绑定触摸事件
 *   - 命中检测（相对坐标 vs hit 区域）
 *   - 右键打开聊天窗口
 *
 * 模型切换时重新加载 zones
 */
let _interactions = null;
let _currentZones = [];

let _modelLoaded = false;

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
        setModels(result.models);
        const m = result.models[0];
        _interactions = m.interactions || {};
        _currentZones = _interactions.zones || [];
        _modelLoaded = true;
    }
    initLive2D();
}

function onModelChange(modelIndex) {
    if (MODEL_LIST && MODEL_LIST[modelIndex]) {
        _interactions = MODEL_LIST[modelIndex].interactions || {};
        _currentZones = _interactions.zones || [];
    }
}

function bindPetEvents() {
    const container = document.querySelector(".pet-container");

    container.addEventListener("dblclick", (e) => {
        const zone = hitTest(e);
        if (zone) {
            e.preventDefault();
            container.classList.add("pet-flash");
            setTimeout(() => container.classList.remove("pet-flash"), 400);

            if (zone.motion && typeof playMotion === "function") {
                playMotion(zone.motion);
            }
            petAction(zone.action);
        }
    });

    container.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        windowShow();
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

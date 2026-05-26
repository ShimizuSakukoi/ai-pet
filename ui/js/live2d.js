/**
 * Live2D 模型加载 / 切换
 * ============================================================
 * 模型列表由 handler.py 自动扫描 ui/model/ 目录生成，
 * 通过 setModels() 注入，不再硬编码。
 *
 * .model.json   -> L2Dwidget (Cubism 2.x)
 * .model3.json  -> PIXI.live2d.Live2DModel (Cubism 4.x)
 */

/** 动态模型列表，由 pet-ui.js 调用 setModels() 填充 */
let MODEL_LIST = [];
currentModelIdx = 0;
let _pixiApp = null;

function setModels(models) {
    if (!models || !models.length) return;
    MODEL_LIST = models;
    currentModelIdx = 0;
}

/** 根据模型名和文件名构建完整路径 */
function _modelPath(m) {
    return "model/" + m.name + "/" + m.model_file;
}

function _isModel3(path) {
    return path && path.indexOf(".model3.json") !== -1;
}

// ========================================================================
//                           初 始 化 & 切 换
// ========================================================================

function initLive2D() {
    if (!MODEL_LIST.length) return;
    const m = MODEL_LIST[currentModelIdx];
    const btn = document.getElementById("btn-model-name");
    if (btn) btn.textContent = m.name;
    _doLoadModel(_modelPath(m));
}

function switchModel(direction) {
    if (!MODEL_LIST.length) return;
    currentModelIdx = (currentModelIdx + direction + MODEL_LIST.length) % MODEL_LIST.length;
    const m = MODEL_LIST[currentModelIdx];
    const btn = document.getElementById("btn-model-name");
    if (btn) btn.textContent = m.name;
    reloadModel(_modelPath(m));
}

// ========================================================================
//                        模 型 重 载
// ========================================================================

function _teardownPixi() {
    if (_pixiApp) {
        try { _pixiApp.destroy(true, { children: true, texture: true }); } catch (e) {}
        _pixiApp = null;
    }
}

function reloadModel(path) {
    _teardownPixi();

    const modelArea = document.querySelector(".model-area") || document.querySelector(".pet-container");
    if (!modelArea) { _doLoadModel(path + "?" + Date.now()); return; }

    const oldCanvas = document.getElementById("live2d-canvas");
    if (oldCanvas) oldCanvas.remove();
    const oldWidget = document.getElementById("live2d-widget");
    if (oldWidget) oldWidget.remove();

    const newCanvas = document.createElement("canvas");
    newCanvas.id = "live2d-canvas";

    modelArea.innerHTML = "";
    modelArea.appendChild(newCanvas);

    _doLoadModel(path + "?" + Date.now());
}

// ========================================================================
//                Cubism 4.x 模型加载 (pixi-live2d-display)
// ========================================================================

async function _loadModel3(fullPath) {
    if (typeof PIXI === "undefined" || !PIXI.live2d) {
        console.warn("[Live2D-Model3] PIXI.live2d 未就绪");
        showFallbackPet();
        return;
    }
    const canvas = document.getElementById("live2d-canvas");
    if (!canvas) return;
    const container = document.querySelector(".model-area") || document.querySelector(".pet-container");
    if (!container) return;

    const W = container.clientWidth || 380;
    const H = container.clientHeight || 500;

    const app = new PIXI.Application({
        view: canvas,
        width: W,
        height: H,
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
    });
    _pixiApp = app;

    try {
        const model = await PIXI.live2d.Live2DModel.from(fullPath);
        model.anchor.set(0.5, 0.5);
        model.x = W / 2;
        model.y = H / 2;
        const fitScale = Math.min(W / model.width, H / model.height);
        model.scale.set(fitScale);
        app.stage.addChild(model);

        console.log("[Live2D-Model3] OK:", fullPath);
    } catch (e) {
        console.warn("[Live2D-Model3] 失败:", e);
        showFallbackPet();
    }
}

// ========================================================================
//                   Cubism 2.x 模型加载 (L2Dwidget)
// ========================================================================

function _loadModel2(fullPath) {
    try {
        if (typeof L2Dwidget === "undefined") {
            console.warn("[Live2D] L2Dwidget 未定义");
            showFallbackPet();
            return;
        }
        if (typeof L2Dwidget.init !== "function") {
            console.warn("[Live2D] L2Dwidget.init 不是函数");
            showFallbackPet();
            return;
        }
        L2Dwidget.init({
            model: { jsonPath: fullPath, scale: 1 },
            display: { position: "center", width: 380, height: 500, hOffset: 0, vOffset: 20 },
            mobile: { show: true, scale: 0.5 },
            react: { opacityDefault: 0.8, opacityOnHover: 1 },
        });
        console.log("[Live2D] OK:", fullPath);
    } catch (e) {
        console.warn("[Live2D] 失败:", e);
        showFallbackPet();
    }
}

function _doLoadModel(fullPath) {
    if (_isModel3(fullPath)) {
        _loadModel3(fullPath);
    } else {
        _loadModel2(fullPath);
    }
}

// ========================================================================
//                      Fallback 回退
// ========================================================================

function showFallbackPet() {
    const modelArea = document.querySelector(".model-area") || document.querySelector(".pet-container");
    if (modelArea) {
        if (!modelArea.querySelector(".fallback-pet")) {
            const div = document.createElement("div");
            div.className = "fallback-pet";
            div.textContent = "🐱";
            modelArea.appendChild(div);
        }
    }
}

// ========================================================================
//                     Motion 播放
// ========================================================================

function playMotion(name) {
    if (typeof L2Dwidget !== "undefined") {
        try { L2Dwidget.motion(name, 0); } catch (_) {}
    }
    if (_pixiApp && _pixiApp.stage) {
        const model = _pixiApp.stage.children[0];
        if (model && model.internalModel) {
            try {
                const motionManager = model.internalModel.motionManager;
                if (motionManager) {
                    motionManager.startMotion(name, 0);
                }
            } catch (_) {}
        }
    }
}

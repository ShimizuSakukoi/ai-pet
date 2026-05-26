/**
 * Live2D 模型加载 / 切换 / 情绪映射
 * ============================================================
 * 模型列表由 handler.py 自动扫描 ui/model/ 目录生成，
 * 通过 setModels() 注入，不再硬编码。
 *
 * 依赖：L2Dwidget 全局对象（由 L2Dwidget.min.js 提供）
 */

/** 动态模型列表，由 pet-ui.js 调用 setModels() 填充 */
let MODEL_LIST = [];
let currentModelIdx = 0;

function setModels(models) {
    if (!models || !models.length) return;
    MODEL_LIST = models;
    currentModelIdx = 0;
}

/** 根据模型名和文件名构建完整路径 */
function _modelPath(m) {
    return "model/" + m.name + "/" + m.model_file;
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

function reloadModel(path) {
    const modelArea = document.querySelector(".model-area") || document.querySelector(".pet-container");
    if (!modelArea) { _doLoadModel(path + "?" + Date.now()); return; }

    const oldCanvas = document.getElementById("live2d-canvas");
    if (oldCanvas) oldCanvas.remove();
    const oldWidget = document.getElementById("live2d-widget");
    if (oldWidget) oldWidget.remove();

    const newCanvas = document.createElement("canvas");
    newCanvas.id = "live2d-canvas";

    const moodTag = modelArea.querySelector(".mood-tag");
    modelArea.innerHTML = "";
    modelArea.appendChild(newCanvas);
    if (moodTag) modelArea.appendChild(moodTag);

    _doLoadModel(path + "?" + Date.now());
}

function _doLoadModel(fullPath) {
    try {
        if (typeof L2Dwidget === "undefined") {
            console.warn("[Live2D] L2Dwidget 未定义");
            showFallbackPet();
            return;
        }
        if (typeof L2Dwidget.init !== "function") {
            console.warn("[Live2D] L2Dwidget.init 不是函数，chunk 可能未加载");
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
        console.warn("[Live2D] 失败，回退表情:", e);
        showFallbackPet();
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
//                        情 绪 映 射
// ========================================================================

function setPetMood(mood) {
    if (!mood) return;
    const moodTag = document.querySelector(".mood-tag");
    if (moodTag) {
        moodTag.textContent = MOOD_EMOJI[mood] || mood;
    }
    const fallback = document.querySelector(".fallback-pet");
    if (fallback) {
        fallback.textContent = FALLBACK_EMOJI[mood] || "🐱";
    }
}

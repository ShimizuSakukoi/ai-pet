/**
 * 手感系统 —— 弹性反馈 + 磁吸光晕 + 音频触感
 * =============================================
 * 用途: 让每个按钮/卡片/开关的交互都有"物理感"
 */
(function () {
    "use strict";

    var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- 音频触感 ---- */
    var clickCtx = null;

    function initAudio() {
        try {
            clickCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {}
    }

    function playClick() {
        if (!clickCtx) return;
        try {
            var osc = clickCtx.createOscillator();
            var gain = clickCtx.createGain();
            osc.connect(gain);
            gain.connect(clickCtx.destination);
            osc.frequency.value = 600;
            gain.gain.setValueAtTime(0.15, clickCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, clickCtx.currentTime + 0.03);
            osc.start();
            osc.stop(clickCtx.currentTime + 0.03);
        } catch (e) {}
    }

    document.addEventListener("click", function () {
        initAudio();
    }, { once: true });

    /* ---- 弹簧按钮 ---- */
    function bindSpring(el) {
        if (prefersReduced) return;
        el.addEventListener("mousedown", function () {
            el.style.transform = "scale(0.95)";
            el.style.transition = "transform 0.1s ease";
            playClick();
        });
        el.addEventListener("mouseup", function () {
            el.style.transform = "scale(1.03)";
            el.style.transition = "transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)";
            setTimeout(function () { el.style.transform = ""; el.style.transition = ""; }, 150);
        });
        el.addEventListener("mouseleave", function () {
            el.style.transform = "";
            el.style.transition = "";
        });
    }

    /* ---- 磁吸光晕 (卡片/快捷回复) ---- */
    function bindMagnetic(el, glowColor) {
        if (prefersReduced) return;
        glowColor = glowColor || "rgba(255,133,162,";
        el.addEventListener("mousemove", function (e) {
            var rect = el.getBoundingClientRect();
            var cx = rect.left + rect.width / 2;
            var cy = rect.top + rect.height / 2;
            var dx = e.clientX - cx;
            var dy = e.clientY - cy;
            var maxDist = Math.max(rect.width, rect.height);
            var dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
            var glow = Math.max(0, 1 - dist);
            el.style.boxShadow = "0 0 " + (20 * glow) + "px " + glowColor + (0.5 * glow) + ")";
            el.style.transform = "scale(" + (1 + 0.02 * glow) + ")";
        });
        el.addEventListener("mouseleave", function () {
            el.style.boxShadow = "";
            el.style.transform = "";
        });
    }

    /* ---- 弹簧弹出面板 ---- */
    function bindSpringPanel(overlay, panel) {
        if (prefersReduced) return;
        overlay.style.transition = "opacity 0.15s ease";
        panel.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
        panel.style.transform = "scale(1)";
        var obs = new MutationObserver(function (muts) {
            muts.forEach(function (m) {
                if (m.attributeName === "style") {
                    var hidden = overlay.style.display === "none";
                    panel.style.transform = hidden ? "scale(0.9)" : "scale(1)";
                }
            });
        });
        obs.observe(overlay, { attributes: true, attributeFilter: ["style"] });
    }

    /* ---- 聊天滚动阻尼 ---- */
    function bindScrollDamping(area) {
        area.addEventListener("wheel", function (e) {
            e.preventDefault();
            area.scrollBy({ top: e.deltaY * 0.5, behavior: "smooth" });
        }, { passive: false });
    }

    /* ---- 消息入口动画 ---- */
    function animateMessage(el) {
        if (prefersReduced) return;
        el.style.transform = "scale(0.85) translateY(6px)";
        el.style.opacity = "0";
        el.style.transition = "transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.2s ease";
        requestAnimationFrame(function () {
            el.style.transform = "";
            el.style.opacity = "";
        });
    }

    /* ---- 导出 ---- */
    window.haptics = {
        bindSpring: bindSpring,
        bindMagnetic: bindMagnetic,
        bindSpringPanel: bindSpringPanel,
        bindScrollDamping: bindScrollDamping,
        animateMessage: animateMessage,
        prefersReduced: prefersReduced,
    };

    /* ---- 自动绑定所有按钮 ---- */
    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("button").forEach(bindSpring);
        var chatArea = document.getElementById("chat-area");
        if (chatArea) bindScrollDamping(chatArea);
    });
})();

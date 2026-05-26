/**
 * 语音输入
 * ============================================================
 * 依赖：无（自包含）
 */
let recognition = null, isRecording = false;

function initVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { const b = document.getElementById("btn-voice"); if (b) b.style.display = "none"; return; }
    recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = e => { const t = e.results[0][0].transcript.trim(); if (t) { document.getElementById("chat-input").value = t; document.getElementById("chat-input").focus(); } stopVoiceUI(); };
    recognition.onerror = recognition.onend = () => stopVoiceUI();
}

function toggleVoice() {
    if (!recognition) return;
    if (isRecording) { recognition.stop(); } else {
        try { recognition.start(); isRecording = true; const b = document.getElementById("btn-voice"); b.classList.add("recording"); b.textContent = "🔴"; } catch (_) { stopVoiceUI(); }
    }
}

function stopVoiceUI() {
    isRecording = false;
    const b = document.getElementById("btn-voice");
    b.classList.remove("recording");
    b.textContent = "🎤";
}

import { ref } from "vue";

export function useRecorder() {
  const isRecording = ref(false);
  const isReady = ref(false);
  const transcript = ref("");
  const audioBlob = ref(null);
  const error = ref(null);
  const isSupported = ref(true);

  let recognition = null;
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let stopRequested = false;
  let restartCount = 0;
  let waitReadyResolver = null;

  const MAX_RESTARTS = 3;
  const MIC_WARMUP_MS = 500;
  const READY_TIMEOUT_MS = 2000;

  function resolveReadyWait() {
    if (waitReadyResolver) {
      waitReadyResolver();
      waitReadyResolver = null;
    }
  }

  function cleanupMediaStream() {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  function restartRecognitionWithDelay(delay = 120) {
    if (!recognition || stopRequested || !isRecording.value || restartCount >= MAX_RESTARTS) return;
    restartCount += 1;

    try {
      recognition.stop();
    } catch {
      // Ignore stop failures and try to restart anyway.
    }

    setTimeout(() => {
      if (!recognition || stopRequested || !isRecording.value) return;
      try {
        recognition.start();
      } catch {
        // Duplicate start or transient browser state; ignore.
      }
    }, delay);
  }

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      isSupported.value = false;
      error.value = "当前浏览器不支持语音识别，建议使用最新版 Chrome。";
      return false;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      error.value = null;
      isReady.value = true;
      isRecording.value = true;
      restartCount = 0;
      resolveReadyWait();
    };

    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          finalText += `${event.results[i][0].transcript} `;
        }
      }
      if (finalText) {
        transcript.value = `${transcript.value}${finalText}`.trim();
        restartCount = 0;
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") {
        return;
      }

      if (event.error === "no-speech") {
        if (!stopRequested) {
          restartRecognitionWithDelay(120);
        }
        return;
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        error.value = "语音识别权限被拒绝，请在浏览器中允许麦克风权限。";
        isRecording.value = false;
        isReady.value = false;
        return;
      }

      if (event.error === "audio-capture") {
        error.value = "未检测到可用麦克风，请检查设备连接。";
        return;
      }

      if (event.error === "network") {
        error.value = "语音识别网络不稳定，请稍后重试。";
        return;
      }

      error.value = `语音识别出现问题（${event.error}），请重试。`;
    };

    recognition.onend = () => {
      // Keep recognition alive while recording, unless it was stopped intentionally.
      if (!stopRequested && isRecording.value) {
        restartRecognitionWithDelay(200);
      }
    };

    return true;
  }

  async function initMediaRecorder() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      error.value = "当前浏览器不支持麦克风录音。";
      return false;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(mediaStream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        audioBlob.value = new Blob(audioChunks, { type: "audio/webm" });
        cleanupMediaStream();
      };

      return true;
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        error.value = "无法访问麦克风，请先允许麦克风权限。";
        return false;
      }

      if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        error.value = "未检测到麦克风设备，请检查后重试。";
        return false;
      }

      error.value = "麦克风初始化失败，请检查设备和浏览器设置。";
      return false;
    }
  }

  async function startRecording() {
    transcript.value = "";
    audioBlob.value = null;
    error.value = null;
    isReady.value = false;
    isRecording.value = false;
    stopRequested = false;
    restartCount = 0;
    waitReadyResolver = null;

    const speechReady = initSpeechRecognition();
    const mediaReady = await initMediaRecorder();
    if (!speechReady || !mediaReady) {
      recognition = null;
      cleanupMediaStream();
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, MIC_WARMUP_MS));

    const readyPromise = new Promise((resolve) => {
      waitReadyResolver = resolve;
      setTimeout(() => {
        resolveReadyWait();
      }, READY_TIMEOUT_MS);
    });

    try {
      isRecording.value = true;
      recognition.start();
    } catch (err) {
      isRecording.value = false;
      error.value = err?.message || "语音识别启动失败，请重试。";
      recognition = null;
      cleanupMediaStream();
      return false;
    }

    try {
      mediaRecorder.start(100);
    } catch (err) {
      error.value = err?.message || "录音启动失败，请重试。";
      isRecording.value = false;
      isReady.value = false;
      stopRequested = true;
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      recognition = null;
      cleanupMediaStream();
      return false;
    }

    await readyPromise;

    return true;
  }

  function stopRecording() {
    stopRequested = true;
    resolveReadyWait();
    isReady.value = false;
    restartCount = 0;

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        // no-op
      }
      recognition = null;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else if (mediaStream) {
      cleanupMediaStream();
    }
    mediaRecorder = null;

    isRecording.value = false;
  }

  return {
    isRecording,
    isReady,
    transcript,
    audioBlob,
    error,
    isSupported,
    startRecording,
    stopRecording
  };
}

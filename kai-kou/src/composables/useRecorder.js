import { ref } from "vue";

export function useRecorder() {
  const isRecording = ref(false);
  const isReady = ref(false);
  const transcript = ref("");
  const audioBlob = ref(null);
  const error = ref(null);
  const isSupported = ref(true);
  const isStopping = ref(false);
  const lastStopMeta = ref(null);

  let recognition = null;
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let stopRequested = false;
  let restartCount = 0;
  let waitReadyResolver = null;
  let interimTranscript = "";
  let activeStopPromise = null;
  let stopCallCount = 0;

  let mediaStopResolver = null;
  let mediaStopTimer = null;
  let recognitionStopResolver = null;
  let recognitionStopTimer = null;

  const MAX_RESTARTS = 5;
  const MIC_WARMUP_MS = 300;
  const READY_TIMEOUT_MS = 2000;
  const RECOGNITION_STOP_TIMEOUT_MS = 2500;
  const MEDIA_STOP_TIMEOUT_MS = 6000;
  const MAX_AUDIO_BLOB_BYTES = 8 * 1024 * 1024;

  function devLog(event, payload = {}) {
    if (!import.meta.env.DEV) return;
    console.info(`[recorder] ${event}`, payload);
  }

  function resolveReadyWait() {
    if (!waitReadyResolver) return;
    waitReadyResolver();
    waitReadyResolver = null;
  }

  function resolveRecognitionStopWait(payload = {}) {
    if (!recognitionStopResolver) return;
    const resolve = recognitionStopResolver;
    recognitionStopResolver = null;
    clearTimeout(recognitionStopTimer);
    recognitionStopTimer = null;
    resolve(payload);
  }

  function resolveMediaStopWait(payload = {}) {
    if (!mediaStopResolver) return;
    const resolve = mediaStopResolver;
    mediaStopResolver = null;
    clearTimeout(mediaStopTimer);
    mediaStopTimer = null;
    resolve(payload);
  }

  function cleanupMediaStream() {
    if (!mediaStream) return;
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }

  function waitForAudioSignal(stream, timeoutMs = 2000) {
    return new Promise((resolve) => {
      let ctx;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        resolve();
        return;
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const deadline = Date.now() + timeoutMs;

      function cleanup() {
        try {
          source.disconnect();
          ctx.close();
        } catch {
          // no-op
        }
      }

      function check() {
        if (Date.now() >= deadline) {
          cleanup();
          resolve();
          return;
        }

        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) {
          const normalized = (buf[i] - 128) / 128;
          sum += normalized * normalized;
        }

        if (Math.sqrt(sum / buf.length) > 0.01) {
          cleanup();
          resolve();
          return;
        }

        setTimeout(check, 80);
      }

      check();
    });
  }

  function restartRecognitionWithDelay(delay = 120) {
    if (!recognition || stopRequested || !isRecording.value || restartCount >= MAX_RESTARTS) return;
    restartCount += 1;

    try {
      recognition.stop();
    } catch {
      // no-op
    }

    setTimeout(() => {
      if (!recognition || stopRequested || !isRecording.value) return;
      try {
        recognition.start();
      } catch {
        // no-op
      }
    }, delay);
  }

  function buildFinalTranscript() {
    return `${transcript.value || ""} ${interimTranscript || ""}`.trim().replace(/\s+/g, " ");
  }

  function waitForRecognitionStop() {
    if (!recognition) {
      return Promise.resolve({ timedOut: false, skipped: true });
    }

    return new Promise((resolve) => {
      recognitionStopResolver = resolve;
      recognitionStopTimer = setTimeout(() => {
        resolveRecognitionStopWait({ timedOut: true });
      }, RECOGNITION_STOP_TIMEOUT_MS);
    });
  }

  function waitForMediaStop() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      return Promise.resolve({
        timedOut: false,
        skipped: true,
        chunkCount: audioChunks.length,
        blobSize: audioBlob.value?.size || 0,
        mimeType: audioBlob.value?.type || "audio/webm"
      });
    }

    return new Promise((resolve) => {
      mediaStopResolver = resolve;
      mediaStopTimer = setTimeout(() => {
        resolveMediaStopWait({
          timedOut: true,
          chunkCount: audioChunks.length,
          blobSize: audioBlob.value?.size || 0,
          mimeType: audioBlob.value?.type || mediaRecorder?.mimeType || "audio/webm"
        });
      }, MEDIA_STOP_TIMEOUT_MS);
    });
  }

  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      isSupported.value = false;
      error.value = "Speech recognition is not supported in this browser.";
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
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const current = `${event.results[i][0]?.transcript || ""}`.trim();
        if (!current) continue;
        if (event.results[i].isFinal) {
          finalText += `${current} `;
        } else {
          interimText += `${current} `;
        }
      }

      if (finalText) {
        transcript.value = `${transcript.value} ${finalText}`.trim().replace(/\s+/g, " ");
        restartCount = 0;
      }
      interimTranscript = interimText.trim();
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") {
        return;
      }

      if (event.error === "no-speech") {
        if (!stopRequested) restartRecognitionWithDelay(120);
        return;
      }

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        error.value = "Speech recognition permission was denied.";
        isRecording.value = false;
        isReady.value = false;
        return;
      }

      if (event.error === "audio-capture") {
        error.value = "No usable microphone was detected.";
        return;
      }

      if (event.error === "network") {
        error.value = "Speech recognition network is unstable. Please try again.";
        return;
      }

      error.value = `Speech recognition error: ${event.error}`;
    };

    recognition.onend = () => {
      if (stopRequested) {
        transcript.value = buildFinalTranscript();
        interimTranscript = "";
        resolveRecognitionStopWait({ timedOut: false });
        return;
      }

      if (isRecording.value) {
        restartRecognitionWithDelay(200);
      }
    };

    return true;
  }

  async function initMediaRecorder() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === "undefined") {
      error.value = "MediaRecorder is not supported in this browser.";
      return false;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4"
      ];
      const supportedMime = preferredMimeTypes.find((type) => (MediaRecorder.isTypeSupported ? MediaRecorder.isTypeSupported(type) : false));
      mediaRecorder = supportedMime ? new MediaRecorder(mediaStream, { mimeType: supportedMime }) : new MediaRecorder(mediaStream);
      audioChunks = [];
      audioBlob.value = null;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      mediaRecorder.onerror = (event) => {
        devLog("media:error", { error: event?.error?.name || event?.error || "unknown" });
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder?.mimeType || "audio/webm";
        audioBlob.value = new Blob(audioChunks, { type: mimeType });
        const meta = {
          chunkCount: audioChunks.length,
          blobSize: audioBlob.value.size,
          mimeType: audioBlob.value.type || mimeType
        };
        devLog("media:stopped", meta);
        cleanupMediaStream();
        resolveMediaStopWait({ timedOut: false, ...meta });
      };

      return true;
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
        error.value = "Microphone permission was denied.";
        return false;
      }

      if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
        error.value = "No microphone device was found.";
        return false;
      }

      error.value = "Failed to initialize microphone recording.";
      return false;
    }
  }

  async function startRecording() {
    if (activeStopPromise) {
      try {
        await activeStopPromise;
      } catch {
        // no-op
      }
    }

    transcript.value = "";
    interimTranscript = "";
    audioBlob.value = null;
    error.value = null;
    isReady.value = false;
    isRecording.value = false;
    isStopping.value = false;
    stopRequested = false;
    restartCount = 0;
    waitReadyResolver = null;
    lastStopMeta.value = null;

    const mediaReady = await initMediaRecorder();
    if (!mediaReady) {
      cleanupMediaStream();
      return false;
    }

    await Promise.race([
      waitForAudioSignal(mediaStream),
      new Promise((resolve) => setTimeout(resolve, MIC_WARMUP_MS))
    ]);

    const speechReady = initSpeechRecognition();
    if (!speechReady) {
      recognition = null;
      cleanupMediaStream();
      return false;
    }

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
      error.value = err?.message || "Failed to start speech recognition.";
      recognition = null;
      cleanupMediaStream();
      return false;
    }

    try {
      mediaRecorder.start(250);
    } catch (err) {
      error.value = err?.message || "Failed to start recording.";
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

  async function stopRecorderAndGetBlob(options = {}) {
    if (activeStopPromise) {
      return activeStopPromise;
    }

    stopCallCount += 1;
    const stopReason = options.reason || "manual";

    activeStopPromise = (async () => {
      stopRequested = true;
      resolveReadyWait();
      isReady.value = false;
      restartCount = 0;
      isStopping.value = true;

      devLog("stop:start", {
        stopCallCount,
        stopReason,
        recorderState: mediaRecorder?.state || "inactive",
        chunkCountBeforeStop: audioChunks.length
      });

      const recognitionStopPromise = waitForRecognitionStop();
      const mediaStopPromise = waitForMediaStop();

      if (recognition) {
        try {
          recognition.stop();
        } catch {
          resolveRecognitionStopWait({ timedOut: false, skipped: true });
        }
      } else {
        resolveRecognitionStopWait({ timedOut: false, skipped: true });
      }

      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        try {
          mediaRecorder.stop();
        } catch {
          cleanupMediaStream();
          resolveMediaStopWait({
            timedOut: false,
            skipped: true,
            recorderStopError: true,
            chunkCount: audioChunks.length,
            blobSize: audioBlob.value?.size || 0,
            mimeType: audioBlob.value?.type || "audio/webm"
          });
        }
      } else {
        if (!audioBlob.value && audioChunks.length > 0) {
          audioBlob.value = new Blob(audioChunks, { type: "audio/webm" });
        }
        cleanupMediaStream();
        resolveMediaStopWait({
          timedOut: false,
          skipped: true,
          chunkCount: audioChunks.length,
          blobSize: audioBlob.value?.size || 0,
          mimeType: audioBlob.value?.type || "audio/webm"
        });
      }

      const [recognitionStopResult, mediaStopResult] = await Promise.all([recognitionStopPromise, mediaStopPromise]);
      transcript.value = buildFinalTranscript();
      interimTranscript = "";

      const blob = audioBlob.value;
      const blobSize = blob?.size || 0;
      const blobTooLarge = blobSize > MAX_AUDIO_BLOB_BYTES;
      const hasAudio = blobSize > 0;

      const result = {
        stopReason,
        stopCallCount,
        transcript: transcript.value,
        blob,
        blobSize,
        hasAudio,
        blobTooLarge,
        recorderStopTimedOut: Boolean(mediaStopResult?.timedOut),
        recognitionStopTimedOut: Boolean(recognitionStopResult?.timedOut),
        chunkCount: Number(mediaStopResult?.chunkCount ?? audioChunks.length),
        mimeType: mediaStopResult?.mimeType || blob?.type || "audio/webm"
      };

      lastStopMeta.value = result;
      devLog("stop:finalized", result);

      if (blobTooLarge) {
        error.value = "Recording is too long. Please try a shorter response.";
      } else if (result.recorderStopTimedOut) {
        error.value = "Recording failed to finalize. Please try again.";
      }

      return result;
    })()
      .catch((err) => {
        const failedResult = {
          stopReason,
          stopCallCount,
          transcript: buildFinalTranscript(),
          blob: audioBlob.value,
          blobSize: audioBlob.value?.size || 0,
          hasAudio: (audioBlob.value?.size || 0) > 0,
          blobTooLarge: false,
          recorderStopTimedOut: false,
          recognitionStopTimedOut: false,
          chunkCount: audioChunks.length,
          mimeType: audioBlob.value?.type || mediaRecorder?.mimeType || "audio/webm",
          stopError: err?.message || "stop_failed"
        };
        lastStopMeta.value = failedResult;
        error.value = "Recording failed. Please try again.";
        devLog("stop:error", failedResult);
        return failedResult;
      })
      .finally(() => {
        resolveRecognitionStopWait({ timedOut: false, cleanup: true });
        resolveMediaStopWait({ timedOut: false, cleanup: true });
        recognition = null;
        mediaRecorder = null;
        isRecording.value = false;
        isStopping.value = false;
        activeStopPromise = null;
      });

    return activeStopPromise;
  }

  function stopRecording() {
    void stopRecorderAndGetBlob({ reason: "manual" });
  }

  return {
    isRecording,
    isReady,
    transcript,
    audioBlob,
    error,
    isSupported,
    isStopping,
    lastStopMeta,
    startRecording,
    stopRecording,
    stopRecorderAndGetBlob
  };
}

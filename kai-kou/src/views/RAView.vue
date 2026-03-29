<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import TimerBar from "@/components/TimerBar.vue";
import { getRandomQuestion } from "@/lib/questions";
import { useRecorder } from "@/composables/useRecorder";
import { useTimer } from "@/composables/useTimer";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";

const defaultQuestion = {
  id: "RA_FALLBACK",
  content: "Please read the passage aloud.",
  difficulty: 2
};

const router = useRouter();
const practiceStore = usePracticeStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const recorder = useRecorder();
const timer = useTimer();

const questionIndex = ref(1);
const phase = computed(() => practiceStore.phase);
const questionLoading = ref(true);
const question = ref({ ...defaultQuestion });

const wordCount = computed(() => (question.value?.content || "").split(/\s+/).filter(Boolean).length);
const difficultyLabel = computed(() => {
  const difficulty = Number(question.value?.difficulty || 2);
  if (difficulty <= 1) return "简单";
  if (difficulty >= 3) return "困难";
  return "中等";
});

const recordingSeconds = ref(0);
const hasFinalizedRecording = ref(false);
const finalizedStopResult = ref(null);
const finalizedTranscript = ref("");
const previewAudioUrl = ref("");
const previewAudioRef = ref(null);
const canFinishRecording = computed(() => (
  phase.value === "recording"
  && !hasFinalizedRecording.value
  && recordingSeconds.value >= 3
  && !recorder.isStopping.value
));
const startMeta = computed(() => getStartMeta());
const stopMeta = computed(() => recorder.lastStopMeta.value || null);
const currentRecorderAttemptId = computed(() => getCurrentRecorderAttemptId());
const currentStopMeta = computed(() => {
  const attemptId = currentRecorderAttemptId.value;
  if (isStopResultForAttempt(finalizedStopResult.value, attemptId)) return finalizedStopResult.value;
  if (isStopResultForAttempt(stopMeta.value, attemptId)) return stopMeta.value;
  return null;
});
const hasUsableStoppedAudio = computed(() => hasUsableAudioBlob(currentStopMeta.value));
const showAudioPreview = computed(() => (
  hasFinalizedRecording.value
  && hasUsableStoppedAudio.value
  && Boolean(previewAudioUrl.value)
));
const showTranscriptWeakHint = computed(() => (
  hasFinalizedRecording.value
  && hasUsableStoppedAudio.value
  && !canScoreWithTranscript(finalizedTranscript.value)
));
const speechOptionalNotice = computed(() => getSpeechOptionalNotice(startMeta.value));
const idleFallbackText = computed(() => startFailureMessage.value || "录音启动失败，请重试；如仍失败，请更换浏览器或设备。");
const showFatalRecorderError = computed(() => {
  if (!recorder.error.value) return false;
  if (phase.value === "processing" || phase.value === "done") return false;
  if (speechOptionalNotice.value && shouldTreatSpeechAsOptional(startMeta.value)) return false;
  return true;
});
const showStartMetaDebug = computed(() => {
  if (!import.meta.env.DEV) return false;
  return Boolean(
    startMeta.value?.startErrorCode ||
    startMeta.value?.speechReason ||
    startMeta.value?.recorderEngine ||
    startMeta.value?.webAudioFallbackTried
  );
});

const tips = [
  "句子较长时在逗号处自然停顿。",
  "专有名词建议适当放慢，确保清晰。",
  "保持稳定语速，不要因为紧张突然加快。"
];

const historicalStats = {
  bestScore: 79,
  totalAttempts: 12
};

let unmounted = false;
const isSubmitting = ref(false);
const isStartingRecording = ref(false);
let recordingTicker = null;
let submitCallCount = 0;
let lastSpeechNoticeCode = "";
let lastEngineNoticeCode = "";
const MIN_TRANSCRIPT_WORDS_FOR_SCORE = 5;
const MIN_TRANSCRIPT_CHARS_FOR_SCORE = 15;
const canSubmitEvaluation = computed(() => (
  phase.value === "recording"
  && hasFinalizedRecording.value
  && hasUsableStoppedAudio.value
  && !isSubmitting.value
));
const startFailureMessage = ref("");
const ERROR_TEXT = {
  SPEECH_RECOGNITION_DISABLED_HUAWEI: "检测到华为设备，已自动切换到兼容录音模式；实时字幕可能不可用，但可正常录音和提交评测。",
  MIC_PERMISSION_DENIED: "麦克风权限未开启，请允许浏览器使用麦克风后重试。",
  MEDIA_UNSUPPORTED: "当前浏览器不支持录音功能，请改用 Chrome、Edge 或 Safari。",
  MEDIARECORDER_START_FAILED: "录音启动失败，请重试；如仍失败，请改用 Chrome 浏览器。",
  MEDIARECORDER_START_TIMEOUT: "当前浏览器响应录音过慢，请改用 Chrome 浏览器再试。",
  SPEECH_RECOGNITION_UNSUPPORTED: "当前浏览器不支持实时语音识别，但仍可继续录音。",
  COMPAT_RECORDING_MODE_ENABLED: "当前浏览器已自动切换到兼容录音模式。",
  RECORDER_ALL_ENGINES_FAILED: "录音启动失败，请重试；如仍失败，请更换浏览器或设备。",
  PROCESS_TIMEOUT: "录音处理超时，请重试一次。",
  INSECURE_CONTEXT: "当前页面未处于安全环境，无法使用录音功能，请使用 HTTPS 链接访问。",
  GENERIC_START_FAILED: "录音启动失败，请重试；如仍失败，请更换浏览器或设备。"
};

const SPEECH_OPTIONAL_CODES = new Set([
  "SPEECH_RECOGNITION_DISABLED_HUAWEI",
  "SPEECH_RECOGNITION_UNSUPPORTED",
  "SPEECH_RECOGNITION_INIT_FAILED",
  "SPEECH_RECOGNITION_START_FAILED",
  "SPEECH_RECOGNITION_PERMISSION_DENIED",
  "SPEECH_RECOGNITION_AUDIO_CAPTURE_FAILED",
  "SPEECH_RECOGNITION_NETWORK_ERROR",
  "SPEECH_RECOGNITION_RUNTIME_ERROR"
]);

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getElapsedMs(startAt) {
  return Math.max(0, Math.round(getNowMs() - startAt));
}

function getTranscriptWordCount(text) {
  return `${text || ""}`.trim().split(/\s+/).filter(Boolean).length;
}

function canScoreWithTranscript(text) {
  const normalized = `${text || ""}`.trim();
  return getTranscriptWordCount(normalized) >= MIN_TRANSCRIPT_WORDS_FOR_SCORE && normalized.length >= MIN_TRANSCRIPT_CHARS_FOR_SCORE;
}

function normalizeAttemptId(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function getCurrentRecorderAttemptId() {
  return normalizeAttemptId(startMeta.value?.attemptId || recorder.currentAttemptId?.value || 0);
}

function getStopResultAttemptId(stopResult) {
  return normalizeAttemptId(stopResult?.attemptId || 0);
}

function isStopResultForAttempt(stopResult, attemptId = getCurrentRecorderAttemptId()) {
  if (!stopResult || stopResult?.staleAttempt) return false;
  const targetAttemptId = normalizeAttemptId(attemptId);
  const resultAttemptId = getStopResultAttemptId(stopResult);
  if (!targetAttemptId || !resultAttemptId) return false;
  return targetAttemptId === resultAttemptId;
}

const INVALID_AUDIO_BLOB_ISSUES = new Set([
  "AUDIO_BLOB_EMPTY",
  "AUDIO_BLOB_TOO_SMALL",
  "AUDIO_MIME_UNSUPPORTED",
  "AUDIO_BLOB_NOT_PLAYABLE"
]);
const PLAYABLE_AUDIO_MIME_PREFIXES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg"
];

function normalizeMimeType(mimeType) {
  return `${mimeType || ""}`.trim().toLowerCase();
}

function normalizeMimeTypeBase(mimeType) {
  return normalizeMimeType(mimeType).split(";")[0].trim();
}

function isKnownPlayableMimeType(mimeType) {
  const normalizedBase = normalizeMimeTypeBase(mimeType);
  if (!normalizedBase) return false;
  return PLAYABLE_AUDIO_MIME_PREFIXES.some((prefix) => normalizedBase.startsWith(prefix));
}

function isMimeTypePlayable(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  if (!normalized) return false;

  if (typeof document !== "undefined") {
    try {
      const probe = document.createElement("audio");
      const direct = `${probe.canPlayType(normalized) || ""}`.toLowerCase();
      if (direct === "probably" || direct === "maybe") return true;

      const base = normalizeMimeTypeBase(normalized);
      const fallback = `${probe.canPlayType(base) || ""}`.toLowerCase();
      if (fallback === "probably" || fallback === "maybe") return true;
    } catch {
      // no-op
    }
  }

  return isKnownPlayableMimeType(normalized);
}

function hasUsableAudioBlob(stopResult) {
  if (!stopResult) return false;
  if (stopResult?.staleAttempt) return false;

  const blob = stopResult.blob || recorder.audioBlob.value;
  const blobSize = Number(stopResult.blobSize ?? blob?.size ?? 0);
  const hasAudio = typeof stopResult.hasAudio === "boolean" ? stopResult.hasAudio : blobSize > 0;
  const blobIssueCode = `${stopResult.blobIssueCode || ""}`;
  const mimeType = `${stopResult.mimeType || blob?.type || ""}`;
  const mimeTypePlayable = typeof stopResult.mimeTypePlayable === "boolean"
    ? stopResult.mimeTypePlayable
    : isMimeTypePlayable(mimeType);
  const previewPlayable = typeof stopResult.previewPlayable === "boolean"
    ? stopResult.previewPlayable
    : null;
  const explicitUsable = typeof stopResult.hasUsableAudio === "boolean" ? stopResult.hasUsableAudio : null;

  if (explicitUsable !== null) {
    return Boolean(explicitUsable && blob && blobSize > 0);
  }

  return Boolean(
    blob
    && hasAudio
    && blobSize > 0
    && !INVALID_AUDIO_BLOB_ISSUES.has(blobIssueCode)
    && mimeTypePlayable
    && (previewPlayable === null || previewPlayable)
  );
}

function isNotPlayableAudioBlob(stopResult) {
  if (!stopResult) return false;
  const blob = stopResult.blob || recorder.audioBlob.value;
  const blobSize = Number(stopResult.blobSize ?? blob?.size ?? 0);
  if (blobSize <= 0) return false;
  if (`${stopResult.blobIssueCode || ""}` === "AUDIO_BLOB_NOT_PLAYABLE") return true;
  if (typeof stopResult.previewPlayable === "boolean") return !stopResult.previewPlayable;
  return false;
}

function getInvalidAudioMessage(stopResult) {
  if (isNotPlayableAudioBlob(stopResult)) {
    return "当前录音文件不可播放，请重试一次；如仍失败，请更换浏览器或设备。";
  }
  if (stopResult?.blobTooLarge || `${stopResult?.blobIssueCode || ""}` === "AUDIO_BLOB_TOO_LARGE") {
    return "录音时长过长，请缩短后重试。";
  }
  if (`${stopResult?.blobIssueCode || ""}` === "AUDIO_BLOB_EMPTY" || `${stopResult?.blobIssueCode || ""}` === "AUDIO_BLOB_TOO_SMALL") {
    return "未检测到有效录音，请重试一次。";
  }
  return "录音文件生成失败，请重试一次。";
}

function pausePreviewAudio() {
  if (!previewAudioRef.value) return;
  try {
    previewAudioRef.value.pause();
    previewAudioRef.value.currentTime = 0;
  } catch {
    // no-op
  }
}

function revokePreviewAudioUrl() {
  if (!previewAudioUrl.value) return;
  try {
    URL.revokeObjectURL(previewAudioUrl.value);
  } catch {
    // no-op
  }
  previewAudioUrl.value = "";
}

function clearFinalizedRecordingState() {
  hasFinalizedRecording.value = false;
  finalizedStopResult.value = null;
  finalizedTranscript.value = "";
  pausePreviewAudio();
  revokePreviewAudioUrl();
}

function clearAttemptScopedUIState() {
  clearFinalizedRecordingState();
  startFailureMessage.value = "";
  if (recorder?.error?.value) {
    recorder.error.value = null;
  }
  uiStore.clearToast();
}

watch(
  () => finalizedStopResult.value,
  async (nextStopResult) => {
    pausePreviewAudio();
    revokePreviewAudioUrl();

    const expectedAttemptId = currentRecorderAttemptId.value;
    if (!isStopResultForAttempt(nextStopResult, expectedAttemptId)) return;
    if (!hasUsableAudioBlob(nextStopResult)) return;
    const blob = nextStopResult?.blob || recorder.audioBlob.value;
    if (!blob || blob.size <= 0) return;

    const objectUrl = URL.createObjectURL(blob);
    previewAudioUrl.value = objectUrl;

    await nextTick();
    if (previewAudioUrl.value !== objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // no-op
      }
      return;
    }

    if (!isStopResultForAttempt(finalizedStopResult.value, expectedAttemptId)) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // no-op
      }
      previewAudioUrl.value = "";
      return;
    }

    const previewAudio = previewAudioRef.value;
    if (!previewAudio) return;

    try {
      previewAudio.src = objectUrl;
      previewAudio.load();
    } catch {
      // no-op
    }
  }
);

function getStartMeta() {
  return recorder.lastStartMeta.value || null;
}

function getStartFailureText(meta) {
  if (!meta) return recorder.error.value || ERROR_TEXT.GENERIC_START_FAILED;

  if (meta.startErrorCode === "INSECURE_CONTEXT") {
    return ERROR_TEXT.INSECURE_CONTEXT;
  }

  if (meta.startErrorCode === "MIC_PERMISSION_DENIED") {
    return ERROR_TEXT.MIC_PERMISSION_DENIED;
  }

  if (meta.startErrorCode === "MIC_NOT_FOUND") {
    return "未检测到可用麦克风，请连接麦克风后重试。";
  }

  if (meta.startErrorCode === "MEDIA_UNSUPPORTED") {
    return ERROR_TEXT.MEDIA_UNSUPPORTED;
  }

  if (meta.startErrorCode === "MEDIARECORDER_START_FAILED") {
    return ERROR_TEXT.MEDIARECORDER_START_FAILED;
  }

  if (meta.startErrorCode === "MEDIARECORDER_START_TIMEOUT") {
    return ERROR_TEXT.MEDIARECORDER_START_TIMEOUT;
  }

  if (meta.startErrorCode === "MEDIA_INIT_FAILED") {
    return ERROR_TEXT.MEDIARECORDER_START_FAILED;
  }

  if (meta.startErrorCode === "RECORDER_ALL_ENGINES_FAILED") {
    return ERROR_TEXT.RECORDER_ALL_ENGINES_FAILED;
  }

  if (meta.secureContext === false) {
    return ERROR_TEXT.INSECURE_CONTEXT;
  }

  return recorder.error.value || ERROR_TEXT.GENERIC_START_FAILED;
}

function getSpeechOptionalNotice(meta) {
  if (!meta) return "";
  const speechCode = `${meta.speechReason || ""}`;
  if (!SPEECH_OPTIONAL_CODES.has(speechCode)) return "";

  if (speechCode === "SPEECH_RECOGNITION_DISABLED_HUAWEI") {
    return ERROR_TEXT.SPEECH_RECOGNITION_DISABLED_HUAWEI;
  }

  if (speechCode === "SPEECH_RECOGNITION_UNSUPPORTED") {
    return ERROR_TEXT.SPEECH_RECOGNITION_UNSUPPORTED;
  }

  if (speechCode === "SPEECH_RECOGNITION_PERMISSION_DENIED") {
    return "实时语音识别权限未开启，但仍可继续录音。";
  }

  if (speechCode === "SPEECH_RECOGNITION_NETWORK_ERROR") {
    return "实时语音识别网络不稳定，但仍可继续录音。";
  }

  return "当前浏览器不支持实时语音识别，但仍可继续录音。";
}

function shouldTreatSpeechAsOptional(meta) {
  if (!meta) return false;
  const speechCode = `${meta.speechReason || ""}`;
  if (speechCode === "SPEECH_RECOGNITION_DISABLED_HUAWEI") return true;
  if (SPEECH_OPTIONAL_CODES.has(speechCode)) return true;
  return !meta.speechEnabled && !meta.startErrorCode;
}

function startRecordingTicker() {
  stopRecordingTicker();
  recordingSeconds.value = 0;
  recordingTicker = setInterval(() => {
    recordingSeconds.value += 1;
  }, 1000);
}

function stopRecordingTicker() {
  clearInterval(recordingTicker);
  recordingTicker = null;
  recordingSeconds.value = 0;
}

function resetToRetryableState(message) {
  timer.stop();
  stopRecordingTicker();
  lastSpeechNoticeCode = "";
  lastEngineNoticeCode = "";
  clearAttemptScopedUIState();
  startFailureMessage.value = message || ERROR_TEXT.GENERIC_START_FAILED;
  practiceStore.setPhase("idle");
}

function syncQuestionToStore() {
  practiceStore.setQuestion({
    ...(question.value || {}),
    id: question.value?.id || defaultQuestion.id,
    taskType: "RA",
    content: question.value?.content || defaultQuestion.content
  });
}

async function loadQuestion({ incrementIndex = false } = {}) {
  questionLoading.value = true;

  try {
    const picked = await getRandomQuestion("RA");
    question.value = picked || { ...defaultQuestion };
    syncQuestionToStore();

    if (incrementIndex) {
      questionIndex.value += 1;
    }
  } finally {
    questionLoading.value = false;
  }
}

function startPreparing() {
  isSubmitting.value = false;
  clearAttemptScopedUIState();
  practiceStore.setPhase("preparing");
  timer.start(30, startRecording);
}

async function startRecording() {
  if (isStartingRecording.value || phase.value === "recording" || phase.value === "processing") return;
  isStartingRecording.value = true;

  try {
    if (phase.value === "preparing") {
      timer.stop();
    }
    clearAttemptScopedUIState();
    practiceStore.setPhase("recording");
    const started = await recorder.startRecording({
      allowWithoutSpeechRecognition: true
    });
    const currentStartMeta = getStartMeta();

    if (!started) {
      const fatalMessage = getStartFailureText(currentStartMeta);
      resetToRetryableState(fatalMessage);
      logRAChain("start_failed", {
        startErrorCode: currentStartMeta?.startErrorCode || "",
        platformStrategy: currentStartMeta?.platformStrategy || "",
        isAndroidLike: Boolean(currentStartMeta?.isAndroidLike),
        isIOSSafari: Boolean(currentStartMeta?.isIOSSafari),
        recorderEngine: currentStartMeta?.recorderEngine || "",
        webAudioFallbackTried: Boolean(currentStartMeta?.webAudioFallbackTried),
        webAudioFallbackOk: Boolean(currentStartMeta?.webAudioFallbackOk),
        speechReason: currentStartMeta?.speechReason || "",
        hasMediaRecorder: Boolean(currentStartMeta?.hasMediaRecorder),
        hasGetUserMedia: Boolean(currentStartMeta?.hasGetUserMedia),
        secureContext: currentStartMeta?.secureContext !== false
      });
      uiStore.showToast(fatalMessage, "warning");
      return;
    }

    const speechNotice = getSpeechOptionalNotice(currentStartMeta);
    if (speechNotice) {
      const noticeCode = `${currentStartMeta?.speechReason || ""}`;
      if (noticeCode && noticeCode !== lastSpeechNoticeCode) {
        uiStore.showToast(speechNotice, "info", 3600);
        lastSpeechNoticeCode = noticeCode;
      }
      logRAChain("start_degraded", {
        speechReason: noticeCode,
        selectedMimeType: currentStartMeta?.selectedMimeType || ""
      });
    } else {
      lastSpeechNoticeCode = "";
      logRAChain("start_ok", {
        platformStrategy: currentStartMeta?.platformStrategy || "",
        selectedMimeType: currentStartMeta?.selectedMimeType || "",
        recorderEngine: currentStartMeta?.recorderEngine || ""
      });
    }

    const compatibilityNotice = Boolean(currentStartMeta?.isAndroidLike)
      && currentStartMeta?.recorderEngine === "web_audio_wav"
      && currentStartMeta?.webAudioFallbackOk
      ? ERROR_TEXT.COMPAT_RECORDING_MODE_ENABLED
      : "";
    if (compatibilityNotice) {
      const engineNoticeCode = `${currentStartMeta?.recorderEngine || ""}_${currentStartMeta?.webAudioFallbackOk ? "ok" : "no"}`;
      if (engineNoticeCode && engineNoticeCode !== lastEngineNoticeCode) {
        uiStore.showToast(compatibilityNotice, "info", 3600);
        lastEngineNoticeCode = engineNoticeCode;
      }
      logRAChain("start_engine_fallback_ok", {
        recorderEngine: currentStartMeta?.recorderEngine || "",
        webAudioFallbackTried: Boolean(currentStartMeta?.webAudioFallbackTried),
        webAudioFallbackOk: Boolean(currentStartMeta?.webAudioFallbackOk)
      });
    } else {
      lastEngineNoticeCode = "";
    }

    hasFinalizedRecording.value = false;
    finalizedStopResult.value = null;
    finalizedTranscript.value = "";
    submitCallCount = 0;
    startRecordingTicker();
    timer.start(40, handleSubmit);
  } catch (err) {
    const fallbackMessage = ERROR_TEXT.GENERIC_START_FAILED;
    resetToRetryableState(fallbackMessage);
    logRAChain("start_exception", {
      error: err?.message || "start_exception"
    });
    uiStore.showToast(fallbackMessage, "warning");
  } finally {
    isStartingRecording.value = false;
  }
}

async function finalizeRecordingForReview(options = {}) {
  if (questionLoading.value) return false;
  if (isSubmitting.value || hasFinalizedRecording.value || phase.value !== "recording") return false;
  isSubmitting.value = true;
  submitCallCount += 1;

  try {
    stopRecordingTicker();
    timer.stop();
    const stopStartedAt = getNowMs();
    const stopAttemptId = currentRecorderAttemptId.value;
    const stopResult = await recorder.stopRecorderAndGetBlob({
      reason: options.reason || "submit",
      attemptId: stopAttemptId
    });
    if (!isStopResultForAttempt(stopResult, stopAttemptId)) {
      logRAChain("stop_stale_ignored", {
        expectedAttemptId: stopAttemptId,
        resultAttemptId: getStopResultAttemptId(stopResult),
        stopErrorCode: `${stopResult?.stopErrorCode || ""}`
      });
      return false;
    }
    const stopRecorderMs = Number(stopResult?.stopRecorderMs ?? getElapsedMs(stopStartedAt));
    const recognitionStopMs = Number(stopResult?.recognitionStopMs || 0);
    const mediaStopMs = Number(stopResult?.mediaStopMs || 0);
    const blobSize = Number(stopResult?.blobSize || 0);
    const mimeType = `${stopResult?.mimeType || ""}`;
    const blobIssueCode = `${stopResult?.blobIssueCode || ""}`;
    debugSubmit("stop_result", stopResult);
    logRAChain("stop_done", {
      stopRecorderMs,
      recognitionStopMs,
      mediaStopMs,
      blobSize,
      mimeType,
      blobIssueCode
    });

    const transcript = `${stopResult?.transcript || recorder.transcript.value || ""}`.trim();
    const stopDecision = shouldRetryWithToast(stopResult, transcript, stopAttemptId);
    if (stopDecision.shouldRetry) {
      logRAChain("stop_retry", {
        stopErrorCode: stopDecision.errorCode || getStopErrorCode(stopResult)
      });
      clearAttemptScopedUIState();
      practiceStore.setPhase("idle");
      if (!unmounted) {
        await restartRecording();
      }
      return false;
    }

    if (stopDecision.warningCode) {
      logRAChain("stop_continue_with_warning", {
        warningCode: stopDecision.warningCode
      });
    }

    finalizedStopResult.value = stopResult;
    finalizedTranscript.value = transcript;
    hasFinalizedRecording.value = true;
    practiceStore.setTranscript(transcript);
    practiceStore.setAudioBlob(stopResult?.blob || recorder.audioBlob.value || null);
    return true;
  } finally {
    isSubmitting.value = false;
  }
}

async function submitEvaluation() {
  if (questionLoading.value) return;
  if (phase.value !== "recording" || !hasFinalizedRecording.value || isSubmitting.value) return;
  if (!hasUsableAudioBlob(finalizedStopResult.value)) {
    uiStore.showToast(getInvalidAudioMessage(finalizedStopResult.value), "warning");
    if (!unmounted) {
      await restartRecording();
    }
    return;
  }

  isSubmitting.value = true;
  const submitStartedAt = getNowMs();

  try {
    practiceStore.setPhase("processing");
    const transcript = `${finalizedTranscript.value || recorder.transcript.value || ""}`.trim();
    const finalBlob = finalizedStopResult.value?.blob || recorder.audioBlob.value || null;
    practiceStore.setTranscript(transcript);
    practiceStore.setAudioBlob(finalBlob);

    const scoreStartedAt = getNowMs();
    const scoreResult = await practiceStore.submitScore("RA", transcript, question.value?.content || "", question.value?.id || "unknown");
    const scoreApiMs = Number(scoreResult?.meta?.scoreApiMs ?? getElapsedMs(scoreStartedAt));
    const scoreErrorCode = `${scoreResult?.meta?.scoreErrorCode || ""}`;
    logRAChain("score_done", {
      scoreApiMs,
      scoreErrorCode,
      submitTotalMs: getElapsedMs(submitStartedAt)
    });

    if (scoreErrorCode === "SCORE_API_TIMEOUT") {
      uiStore.showToast("评分服务超时，已返回估算分数。", "warning");
    }

    if (!unmounted && practiceStore.phase === "done" && scoreResult && !scoreResult.error) {
      router.push("/ra/result");
    }
  } finally {
    isSubmitting.value = false;
  }
}

async function handleSubmit() {
  if (questionLoading.value || phase.value !== "recording") return;
  if (hasFinalizedRecording.value) {
    await submitEvaluation();
    return;
  }

  await finalizeRecordingForReview({ reason: "submit" });
}

async function skipQuestion() {
  if (questionLoading.value || phase.value === "processing") return;

  timer.stop();
  stopRecordingTicker();
  if (recorder.isRecording.value || recorder.isStopping.value || recorder.isReady.value) {
    const stopAttemptId = currentRecorderAttemptId.value;
    await recorder.stopRecorderAndGetBlob({
      reason: "skip",
      attemptId: stopAttemptId
    });
  }
  clearAttemptScopedUIState();

  await loadQuestion({ incrementIndex: true });
  startPreparing();
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }
  if (!authStore.canPractice) {
    router.replace("/limit");
    return;
  }

  if (practiceStore.selectedQuestion) {
    question.value = {
      ...defaultQuestion,
      ...(practiceStore.selectedQuestion || {})
    };
    syncQuestionToStore();
    practiceStore.clearSelectedQuestion();
    questionLoading.value = false;
  } else {
    await loadQuestion();
  }

  startPreparing();
});

onUnmounted(() => {
  unmounted = true;
  stopRecordingTicker();
  timer.stop();
  clearFinalizedRecordingState();
  recorder.stopRecording();
});

function debugSubmit(event, payload) {
  if (!import.meta.env.DEV) return;
  console.info(`[ra-submit:${submitCallCount}] ${event}`, payload);
}

function logRAChain(event, payload = {}) {
  console.info(`[ra-chain:${submitCallCount}] ${event}`, payload);
}

function getStopErrorCode(stopResult) {
  if (stopResult?.blobTooLarge) return "AUDIO_BLOB_TOO_LARGE";
  if (stopResult?.recorderStopTimedOut) return "RECORDER_STOP_TIMEOUT";
  if (stopResult?.recognitionStopTimedOut) return "RECOGNITION_STOP_TIMEOUT";
  if (stopResult?.blobIssueCode) return stopResult.blobIssueCode;
  if (!stopResult?.hasAudio) return "AUDIO_BLOB_EMPTY";
  return "";
}

function shouldRetryWithToast(stopResult, transcript, expectedAttemptId = getCurrentRecorderAttemptId()) {
  if (!isStopResultForAttempt(stopResult, expectedAttemptId)) {
    return { shouldRetry: false, errorCode: "ATTEMPT_STALE_IGNORED", warningCode: "" };
  }
  const hasUsableAudio = hasUsableAudioBlob(stopResult);

  if (stopResult?.blobTooLarge) {
    uiStore.showToast("录音时长过长，请缩短后重试。", "warning");
    return { shouldRetry: true, errorCode: "AUDIO_BLOB_TOO_LARGE", warningCode: "" };
  }

  if (stopResult?.recorderStopTimedOut) {
    if (hasUsableAudio) {
      return { shouldRetry: false, errorCode: "", warningCode: "RECORDER_STOP_TIMEOUT" };
    }
    uiStore.showToast(ERROR_TEXT.PROCESS_TIMEOUT, "warning");
    return { shouldRetry: true, errorCode: "RECORDER_STOP_TIMEOUT", warningCode: "" };
  }

  if (stopResult?.recognitionStopTimedOut) {
    if (hasUsableAudio) {
      return { shouldRetry: false, errorCode: "", warningCode: "RECOGNITION_STOP_TIMEOUT" };
    }
    uiStore.showToast(ERROR_TEXT.PROCESS_TIMEOUT, "warning");
    return { shouldRetry: true, errorCode: "RECOGNITION_STOP_TIMEOUT", warningCode: "" };
  }

  if (!hasUsableAudio) {
    uiStore.showToast(getInvalidAudioMessage(stopResult), "warning");
    return { shouldRetry: true, errorCode: "AUDIO_BLOB_INVALID", warningCode: "" };
  }

  if (!transcript || transcript.length < 3) {
    uiStore.showToast("已检测到有效录音，将继续提交评测。", "info", 2800);
    return { shouldRetry: false, errorCode: "", warningCode: "TRANSCRIPT_TOO_SHORT_WITH_AUDIO" };
  }

  if (stopResult?.blobIssueCode === "AUDIO_MIME_UNSUPPORTED") {
    return { shouldRetry: false, errorCode: "", warningCode: "AUDIO_MIME_UNSUPPORTED" };
  }

  return { shouldRetry: false, errorCode: "", warningCode: "" };
}

async function restartRecording() {
  if (questionLoading.value || isStartingRecording.value || phase.value === "processing") return;
  stopRecordingTicker();
  timer.stop();
  clearAttemptScopedUIState();
  if (recorder.isRecording.value || recorder.isStopping.value || recorder.isReady.value) {
    const stopAttemptId = currentRecorderAttemptId.value;
    await recorder.stopRecorderAndGetBlob({
      reason: "restart",
      attemptId: stopAttemptId
    });
  }
  clearAttemptScopedUIState();
  practiceStore.setPhase("idle");
  await startRecording();
}

function playPreviewAudio() {
  if (!showAudioPreview.value || !previewAudioRef.value) return;

  try {
    previewAudioRef.value.currentTime = 0;
    const playback = previewAudioRef.value.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        // no-op
      });
    }
  } catch {
    // no-op
  }
}

async function startRecordingNow() {
  if (questionLoading.value || phase.value !== "preparing") return;
  await startRecording();
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="朗读题" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <p class="mb-4 text-sm text-muted">第 {{ questionIndex }} 题</p>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">题目加载中...</p>
      </div>

      <template v-else>
        <div v-if="phase === 'preparing'" class="space-y-4">
          <section class="rounded-xl border bg-white p-6 shadow-card">
            <p class="mb-2 text-center text-lg font-bold text-navy">请先准备，倒计时结束后将自动开始录音。</p>
            <p class="text-center text-sm text-muted">请在准备时间内先完整阅读题目。</p>
          </section>

          <div class="flex items-start gap-3">
            <div class="flex-1">
              <TimerBar label="准备时间" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />
            </div>
            <button type="button" class="pt-1 text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">
              跳过这题 →
            </button>
          </div>

          <button
            type="button"
            class="w-full rounded-xl border-2 border-orange/40 bg-white py-3 text-sm font-semibold text-orange transition-all hover:border-orange hover:bg-orange/5"
            @click="startRecordingNow"
          >
            立即开始录音
          </button>

          <section class="rounded-xl border bg-white p-6 shadow-card">
            <p class="text-lg leading-relaxed text-text">{{ question.content }}</p>
          </section>
        </div>

        <div v-else-if="phase === 'recording'" class="space-y-4">
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <TimerBar label="录音时间" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />
            </div>
            <button type="button" class="pt-1 text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">
              跳过这题 →
            </button>
          </div>

          <section class="rounded-xl border bg-white p-4 text-center shadow-card">
            <div v-if="hasFinalizedRecording && hasUsableStoppedAudio" class="flex items-center justify-center gap-2">
              <div class="h-3 w-3 rounded-full bg-emerald-500" />
              <p class="font-bold text-navy">录音已完成，可先试听再提交评测</p>
            </div>
            <div v-else-if="hasFinalizedRecording" class="flex items-center justify-center gap-2">
              <div class="h-3 w-3 rounded-full bg-amber-500" />
              <p class="font-bold text-amber-700">录音文件不可播放，请重新录音后再提交。</p>
            </div>
            <div v-else-if="!recorder.isReady" class="flex items-center justify-center gap-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-orange border-t-transparent" />
              <p class="text-sm text-muted">麦克风准备中...</p>
            </div>
            <div v-else class="flex items-center justify-center gap-2">
              <div class="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <p class="font-bold text-navy">请开始朗读</p>
            </div>
          </section>

          <section class="rounded-xl border bg-white p-6 shadow-card">
            <p class="text-lg leading-relaxed text-text">{{ question.content }}</p>
          </section>

          <section class="rounded-xl border bg-white p-4 shadow-card">
            <RecordingWave v-if="!hasFinalizedRecording" :is-recording="recorder.isRecording" />

            <div v-if="showAudioPreview" class="mt-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-left">
              <p class="mb-2 text-sm font-semibold text-navy">试听录音</p>
              <audio ref="previewAudioRef" class="w-full" :src="previewAudioUrl" controls preload="metadata" />
            </div>

            <p v-if="showTranscriptWeakHint" class="mt-3 text-xs text-emerald-700">已检测到有效录音，将继续提交评测。</p>
            <p v-if="hasFinalizedRecording && !hasUsableStoppedAudio" class="mt-3 text-xs text-amber-700">当前录音文件不可播放，请重试一次；如仍失败，请更换浏览器或设备。</p>

            <div class="mt-4 flex flex-wrap gap-3">
              <button
                v-if="hasFinalizedRecording && showAudioPreview"
                type="button"
                class="rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-all hover:border-slate-300 hover:text-slate-800"
                @click="playPreviewAudio"
              >
                试听录音
              </button>

              <button
                type="button"
                class="flex-1 rounded-xl border-2 border-gray-200 py-4 text-sm font-semibold text-muted transition-all hover:border-orange hover:text-orange"
                @click="restartRecording"
              >
                重新录音
              </button>

              <button
                type="button"
                class="flex-1 rounded-xl py-4 text-lg font-bold transition-all"
                :class="hasFinalizedRecording ? (canSubmitEvaluation ? 'bg-orange text-white shadow-md hover:opacity-90 active:scale-95' : 'cursor-not-allowed bg-gray-200 text-gray-400') : (canFinishRecording ? 'bg-orange text-white shadow-md hover:opacity-90 active:scale-95' : 'cursor-not-allowed bg-gray-200 text-gray-400')"
                :disabled="hasFinalizedRecording ? !canSubmitEvaluation : !canFinishRecording"
                @click="handleSubmit"
              >
                {{ hasFinalizedRecording ? (isSubmitting ? "提交中..." : "提交评测") : (canFinishRecording ? "结束录音" : "录音中...") }}
              </button>
            </div>
          </section>
        </div>

        <section v-else-if="phase === 'processing' || phase === 'done'" class="py-10 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10">
            <div class="h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
          </div>
          <p class="text-xl font-bold text-navy">正在分析你的作答</p>
          <p class="mt-2 text-sm text-muted">AI 正在生成反馈...</p>
        </section>

        <section v-else class="rounded-xl border bg-white p-6 shadow-card">
          <p class="text-sm text-muted">{{ idleFallbackText }}</p>
          <div class="mt-4">
            <OrangeButton @click="startPreparing">重新开始</OrangeButton>
          </div>
        </section>

        <section
          v-if="(phase === 'preparing' || phase === 'recording') && speechOptionalNotice"
          class="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4"
        >
          <p class="text-sm text-amber-700">{{ speechOptionalNotice }}</p>
        </section>

        <section v-if="phase === 'preparing' || phase === 'recording'" class="mt-4 rounded-xl border-l-4 border-orange bg-white p-4 shadow-sm">
          <p class="mb-2 text-sm font-semibold text-navy">朗读提示</p>
          <ul class="space-y-1 text-sm text-muted">
            <li v-for="tip in tips" :key="tip">- {{ tip }}</li>
          </ul>
        </section>

        <section v-if="phase === 'preparing' || phase === 'recording'" class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article class="rounded-xl bg-white p-3 text-center shadow-sm">
            <p class="text-xs text-muted">难度</p>
            <p class="mt-1 font-bold text-navy">{{ difficultyLabel }}</p>
          </article>
          <article class="rounded-xl bg-white p-3 text-center shadow-sm">
            <p class="text-xs text-muted">预计用时</p>
            <p class="mt-1 font-bold text-navy">约 25 秒</p>
          </article>
          <article class="rounded-xl bg-white p-3 text-center shadow-sm">
            <p class="text-xs text-muted">词数</p>
            <p class="mt-1 font-bold text-navy">{{ wordCount }} 词</p>
          </article>
        </section>

        <section v-if="showFatalRecorderError" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p class="text-sm text-red-600">{{ recorder.error }}</p>
        </section>

        <section
          v-if="showStartMetaDebug && phase !== 'processing' && phase !== 'done'"
          class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600"
        >
          <p>DEV: platformStrategy={{ startMeta?.platformStrategy || "none" }}</p>
          <p>DEV: engine={{ startMeta?.recorderEngine || "none" }}, speechReason={{ startMeta?.speechReason || "none" }}</p>
          <p>DEV: isAndroidLike={{ Boolean(startMeta?.isAndroidLike) }}, isIOSSafari={{ Boolean(startMeta?.isIOSSafari) }}</p>
          <p>DEV: webAudioFallbackTried={{ Boolean(startMeta?.webAudioFallbackTried) }}, webAudioFallbackOk={{ Boolean(startMeta?.webAudioFallbackOk) }}</p>
          <p>DEV: startErrorCode={{ startMeta?.startErrorCode || "none" }}, stopErrorCode={{ currentStopMeta?.stopErrorCode || "none" }}</p>
          <p>DEV: stopBlobSize={{ Number(currentStopMeta?.blobSize || 0) }}, stopMimeType={{ currentStopMeta?.mimeType || "none" }}</p>
          <p>DEV: stopBlobIssue={{ currentStopMeta?.blobIssueCode || "none" }}, mimePlayable={{ Boolean(currentStopMeta?.mimeTypePlayable) }}</p>
          <p>DEV: hasAudio={{ Boolean(currentStopMeta?.hasAudio) }}, hasUsableAudio={{ Boolean(currentStopMeta?.hasUsableAudio) }}</p>
          <p>DEV: transcriptLength={{ Number((finalizedTranscript || recorder.transcript || "").length || 0) }}</p>
          <p>DEV: mediaAttempts={{ Array.isArray(startMeta?.mediaRecorderAttempts) ? startMeta.mediaRecorderAttempts.length : 0 }} / startAttempts={{ Array.isArray(startMeta?.startAttempts) ? startMeta.startAttempts.length : 0 }}</p>
        </section>

        <section v-if="phase !== 'processing' && phase !== 'done'" class="mb-8 mt-3 flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <p class="text-xs text-muted">最高分</p>
            <p class="mt-0.5 text-2xl font-bold text-navy">
              {{ historicalStats.bestScore }} <span class="text-sm font-normal text-muted">分</span>
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-muted">练习次数</p>
            <p class="mt-0.5 text-2xl font-bold text-navy">
              {{ historicalStats.totalAttempts }} <span class="text-sm font-normal text-muted">次</span>
            </p>
          </div>
          <div class="text-3xl text-orange">优秀</div>
        </section>
      </template>
    </main>
  </div>
</template>

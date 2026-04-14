<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import RecordingWave from "@/components/RecordingWave.vue";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";
import { supabase } from "@/lib/supabase";
import { useRecorder } from "@/composables/useRecorder";
import { RTS_TOPIC_META, useRTSData } from "@/composables/useRTSData";
import { useRTSTimer } from "@/composables/useRTSTimer";

const PHASE = {
  LISTENING: "listening",
  PREPARING: "preparing",
  RECORDING: "recording",
  PLAYBACK: "playback"
};

const RATING_LABELS = {
  1: "语气不对",
  2: "凑合",
  3: "还不错",
  4: "很自然",
  5: "完美！"
};

const PLACE_HINTS = ["office", "restaurant", "meeting", "sydney", "melbourne", "brisbane", "city", "station", "airport", "home"];
const ACTION_HINTS = ["help", "fix", "replace", "check", "suggest", "complain", "support", "advise", "request", "apologize"];
const RTS_AUTO_PLAY_COUNTDOWN_SECONDS = 3;
const SCENE_READY_EVENT_TIMEOUT_MS = 6000;

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const uiStore = useUIStore();
const recorder = useRecorder();
const timer = useRTSTimer();
const { loadQuestions, getQuestionById, getRandomQuestion, getUserRTSStats } = useRTSData();

const loading = ref(true);
const questionPool = ref([]);
const currentQuestion = ref(null);
const activeTab = ref("mind");
const showFullTemplate = ref(false);
const recordingStopResult = ref(null);
const playbackUrl = ref("");
const playbackDurationSec = ref(0);
const nextQuestionBusy = ref(false);
const recordingFinalizePending = ref(false);
const todayStats = ref({ practicedCount: 0, practiceMinutes: 0, averageRating: 0 });
const remoteRecentHistory = ref([]);
const isFavorite = ref(false);
const favoriteBusy = ref(false);
const favoriteSource = ref("remote");
const sceneAudioError = ref("");
const audioPreparing = ref(false);
const audioReady = ref(false);
const autoPlayCountdown = ref(false);
const autoPlayCountdownRemaining = ref(0);

let autoPlayTimer = null;
let autoPlayTickTimer = null;
let autoPlayCountdownCancel = null;
let sceneAudioPlayer = null;
let scenePlaybackToken = 0;
let sceneAudioFetchController = null;
let sceneAudioObjectUrl = "";
let recordingFinalizeToken = 0;

const currentPhase = computed(() => `${practiceStore.rtsSession?.phase || PHASE.LISTENING}`.trim() || PHASE.LISTENING);
const questionIndex = computed(() => Math.max(1, Number(practiceStore.rtsSession?.questionIndex || 1)));
const totalQuestions = computed(() => Math.max(0, Number(practiceStore.rtsSession?.totalQuestions || questionPool.value.length || 0)));
const prepareRemaining = computed(() => Math.max(0, Number(practiceStore.rtsSession?.prepareRemaining || 0)));
const prepareTotal = computed(() => Math.max(1, Number(practiceStore.rtsSession?.prepareTotal || 15)));
const recordRemaining = computed(() => Math.max(0, Number(practiceStore.rtsSession?.recordRemaining || 0)));
const recordTotal = computed(() => Math.max(1, Number(practiceStore.rtsSession?.recordTotal || 40)));
const listeningProgress = computed(() => Math.max(0, Number(practiceStore.rtsSession?.listeningProgress || 0)));
const listeningRemaining = computed(() => Math.max(0, Number(practiceStore.rtsSession?.listeningRemaining || 0)));
const listeningTotal = computed(() => Math.max(0, Number(practiceStore.rtsSession?.listeningTotal || 0)));
const listeningStatus = computed(() => `${practiceStore.rtsSession?.listeningStatus || "idle"}`.trim() || "idle");
const listeningLabel = computed(() => `${practiceStore.rtsSession?.listeningLabel || "点击播放场景"}`.trim() || "点击播放场景");
const listeningActionLabel = computed(() => {
  if (listeningStatus.value === "playing") return "正在播放场景...";
  if (audioPreparing.value || autoPlayCountdown.value || listeningStatus.value.startsWith("autoplay_") || listeningStatus.value === "loading") {
    return "正在准备播放...";
  }
  if (listeningStatus.value === "error") return "播放失败，点击重试";
  return "点击播放场景";
});
const autoPlayHint = computed(() => {
  if (autoPlayCountdown.value) return `音频播放前（阅读与缓冲时间）${autoPlayCountdownRemaining.value}s`;
  if (listeningStatus.value === "autoplay_waiting_ready") return "阅读与缓冲结束，正在等待音频就绪...";
  return "";
});
const selfRating = computed(() => Math.max(0, Number(practiceStore.rtsSession?.selfRating || 0)));
const usedPhraseIds = computed(() => new Set(practiceStore.rtsSession?.usedPhraseIds || []));
const hasUsableAudio = computed(() => isUsableAudioRecord(recordingStopResult.value));
const canStopRecording = computed(() => currentPhase.value === PHASE.RECORDING && !recorder.isStopping.value);
const toneLabel = computed(() => `${currentQuestion.value?.key_points?.toneLabel || "半正式语气"}`);
const topicMeta = computed(() => RTS_TOPIC_META[currentQuestion.value?.topic] || RTS_TOPIC_META.daily);
const behaviorLabel = computed(() => `${currentQuestion.value?.key_points?.directions?.[0]?.head || "情境回应"}`.trim());
const directions = computed(() => currentQuestion.value?.key_points?.directions || []);
const tips = computed(() => currentQuestion.value?.key_points?.tips || []);
const templateOpenerSegments = computed(() => splitTemplateSegments(currentQuestion.value?.key_points?.templateOpener));
const phraseGroups = computed(() => {
  const source = currentQuestion.value?.key_points?.phrases || {};
  return [
    { key: "opening", label: "开场", items: source.opening || [] },
    { key: "request", label: "说明请求", items: source.request || [] },
    { key: "closing", label: "收尾", items: source.closing || [] }
  ];
});
const highlightedScenarioHtml = computed(() => highlightScenarioContent(currentQuestion.value?.content || ""));
const stageList = computed(() => {
  const order = [PHASE.LISTENING, PHASE.PREPARING, PHASE.RECORDING, PHASE.PLAYBACK];
  const currentOrder = order.indexOf(currentPhase.value);
  return [
    { key: PHASE.LISTENING, label: "听场景" },
    { key: PHASE.PREPARING, label: "准备" },
    { key: PHASE.RECORDING, label: "开口回应" },
    { key: PHASE.PLAYBACK, label: "听回放" }
  ].map((stage) => ({
    ...stage,
    isActive: currentPhase.value === stage.key,
    isDone: currentOrder > order.indexOf(stage.key)
  }));
});
const progressDots = computed(() => {
  const total = Math.max(1, Math.min(12, Number(totalQuestions.value || 1)));
  const active = Math.max(1, Math.min(total, Number(questionIndex.value || 1)));
  return Array.from({ length: total }, (_, index) => ({ index: index + 1, active: index + 1 === active }));
});
const timerInfo = computed(() => {
  if (currentPhase.value === PHASE.LISTENING) {
    const total = Math.max(1, listeningTotal.value || 1);
    return {
      label: "听场景倒计时",
      remaining: Math.max(0, listeningRemaining.value),
      progress: Math.max(0, Math.min(100, listeningProgress.value || (total ? ((total - listeningRemaining.value) / total) * 100 : 0)))
    };
  }
  if (currentPhase.value === PHASE.PREPARING) {
    const total = Math.max(1, prepareTotal.value);
    const remaining = Math.max(0, prepareRemaining.value);
    return {
      label: "准备倒计时",
      remaining,
      progress: Math.max(0, Math.min(100, ((total - remaining) / total) * 100))
    };
  }
  if (currentPhase.value === PHASE.RECORDING) {
    const total = Math.max(1, recordTotal.value);
    const remaining = Math.max(0, recordRemaining.value);
    return {
      label: "回应倒计时",
      remaining,
      progress: Math.max(0, Math.min(100, ((total - remaining) / total) * 100))
    };
  }
  return {
    label: "回放阶段",
    remaining: Math.max(0, Number(playbackDurationSec.value || 0)),
    progress: 100
  };
});
const historyItems = computed(() => {
  const locals = (practiceStore.rtsRecentRecordings || []).slice(0, 2).map((item) => ({
    id: item.id,
    questionId: item.questionId,
    durationSec: Number(item.durationSec || 0),
    rating: Number(item.rating || 0),
    createdAt: item.createdAt,
    blobUrl: item.blobUrl,
    summary: resolveQuestionSummaryById(item.questionId),
    source: "local",
    hasAudio: Boolean(item.blobUrl)
  }));

  if (locals.length >= 2) return locals;

  const seen = new Set(locals.map((item) => item.questionId));
  const append = remoteRecentHistory.value
    .filter((item) => !seen.has(item.questionId))
    .slice(0, 2 - locals.length)
    .map((item) => ({
      id: item.id,
      questionId: item.questionId,
      durationSec: Number(item.durationSec || 0),
      rating: Number(item.rating || 0),
      createdAt: item.createdAt,
      blobUrl: "",
      summary: item.summary,
      source: "remote",
      hasAudio: false
    }));

  return [...locals, ...append];
});
function goHome() {
  router.push("/rts");
}

function goList() {
  router.push("/rts/list");
}

function renderStars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return "★".repeat(rating).padEnd(5, "☆");
}

function formatDuration(seconds) {
  const normalized = Math.max(0, Math.round(Number(seconds || 0)));
  const m = Math.floor(normalized / 60);
  const s = `${normalized % 60}`.padStart(2, "0");
  return `${m}:${s}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return `${date.getMonth() + 1}/${date.getDate()} ${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`;
}

function phraseId(group, index, text) {
  return `${group}:${index}:${text}`.trim();
}

function isPhraseUsed(group, index, text) {
  return usedPhraseIds.value.has(phraseId(group, index, text));
}

function togglePhrase(group, index, text) {
  practiceStore.toggleRTSUsedPhrase(phraseId(group, index, text));
}

function setRating(value) {
  practiceStore.setRTSSelfRating(value);
}

function splitTemplateSegments(text) {
  const source = `${text || ""}`.trim();
  if (!source) return [];
  return source.split(/(\[[^\]]+\])/g).filter(Boolean).map((segment) => ({
    text: segment,
    isSlot: /^\[[^\]]+\]$/.test(segment)
  }));
}

function escapeHtml(value) {
  return `${value || ""}`
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegExp(value) {
  return `${value || ""}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectHighlightTerms(text) {
  const source = `${text || ""}`;
  const terms = new Set();
  const names = source.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  names.forEach((name) => {
    if (["You", "Your", "Call", "Speak", "Give"].includes(name)) return;
    terms.add(name);
  });

  const lower = source.toLowerCase();
  PLACE_HINTS.forEach((word) => {
    if (lower.includes(word)) terms.add(word);
  });
  ACTION_HINTS.forEach((word) => {
    if (lower.includes(word)) terms.add(word);
  });

  return [...terms]
    .map((item) => `${item}`.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .slice(0, 12);
}

function highlightScenarioContent(text) {
  const source = `${text || ""}`.trim();
  if (!source) return "";

  const terms = collectHighlightTerms(source);
  const escaped = escapeHtml(source);
  if (!terms.length) return escaped;

  let output = escaped;
  terms.forEach((term) => {
    const safe = escapeRegExp(escapeHtml(term));
    const regex = new RegExp(`\\b${safe}\\b`, "gi");
    output = output.replace(regex, (matched) => `<span class=\"rounded bg-[#FFF4CC] px-1\">${matched}</span>`);
  });
  return output;
}

function isUsableAudioRecord(stopResult) {
  if (!stopResult || stopResult?.staleAttempt) return false;
  if (typeof stopResult?.hasUsableAudio === "boolean") return Boolean(stopResult.hasUsableAudio);
  const blob = stopResult?.blob;
  const blobSize = Number(stopResult?.blobSize ?? blob?.size ?? 0);
  return Boolean(blob && blobSize > 0);
}

function resolveQuestionSummaryById(questionId) {
  const normalized = `${questionId || ""}`.trim();
  const found = questionPool.value.find((item) => item.id === normalized);
  if (!found) return normalized || "RTS Question";
  const content = `${found.content || ""}`.replace(/\s+/g, " ").trim();
  if (content.length <= 64) return content;
  return `${content.slice(0, 61)}...`;
}

function clearAutoPlayTimer({ resolvePending = true, reason = "cleared" } = {}) {
  if (resolvePending && typeof autoPlayCountdownCancel === "function") {
    const cancel = autoPlayCountdownCancel;
    autoPlayCountdownCancel = null;
    cancel(reason);
  }
  clearTimeout(autoPlayTimer);
  autoPlayTimer = null;
  clearInterval(autoPlayTickTimer);
  autoPlayTickTimer = null;
  autoPlayCountdown.value = false;
  autoPlayCountdownRemaining.value = 0;
}

function isSceneAudioDebugEnabled() {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem("RTS_AUDIO_DEBUG") === "1";
  } catch {
    return false;
  }
}

function logSceneAudio(event, payload = {}) {
  if (!isSceneAudioDebugEnabled()) return;
  console.info("[rts-audio]", event, { timestamp: Date.now(), ...payload });
}

function ensureSceneAudioPlayer() {
  if (sceneAudioPlayer) return sceneAudioPlayer;
  const player = new Audio();
  player.preload = "auto";
  player.crossOrigin = "anonymous";
  sceneAudioPlayer = player;
  return player;
}

function resetSceneAudioHandlers(audio) {
  if (!audio) return;
  audio.onloadedmetadata = null;
  audio.oncanplay = null;
  audio.onplay = null;
  audio.onplaying = null;
  audio.ontimeupdate = null;
  audio.onended = null;
  audio.onerror = null;
}

function resolveCurrentQuestionId() {
  return `${currentQuestion.value?.id || ""}`.trim();
}

function isPlaybackTokenActive(token, questionId = resolveCurrentQuestionId()) {
  const normalizedQuestionId = `${questionId || ""}`.trim();
  if (!normalizedQuestionId) return false;
  return token === scenePlaybackToken && normalizedQuestionId === resolveCurrentQuestionId();
}

function revokeSceneAudioObjectUrl() {
  if (!sceneAudioObjectUrl || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  const target = sceneAudioObjectUrl;
  sceneAudioObjectUrl = "";
  try {
    URL.revokeObjectURL(target);
  } catch {
    // no-op
  }
}

function stopSceneAudioPlayback({ resetStatus = false, invalidateToken = true } = {}) {
  if (invalidateToken) {
    scenePlaybackToken += 1;
  }
  clearAutoPlayTimer();

  if (sceneAudioFetchController) {
    sceneAudioFetchController.abort();
    sceneAudioFetchController = null;
  }

  if (sceneAudioPlayer) {
    resetSceneAudioHandlers(sceneAudioPlayer);
    sceneAudioPlayer.pause();
    try {
      sceneAudioPlayer.currentTime = 0;
    } catch {
      // ignore
    }
    try {
      sceneAudioPlayer.src = "";
      sceneAudioPlayer.load();
    } catch {
      // ignore
    }
  }
  revokeSceneAudioObjectUrl();

  audioPreparing.value = false;
  audioReady.value = false;

  if (resetStatus) {
    practiceStore.setRTSListeningStatus({
      progress: 0,
      status: "idle",
      label: "点击播放场景",
      remaining: 0,
      total: 0
    });
  }
}

function destroySceneAudioPlayer() {
  stopSceneAudioPlayback({ invalidateToken: true });
  if (!sceneAudioPlayer) return;
  sceneAudioPlayer = null;
}

function revokePlaybackUrl() {
  if (!playbackUrl.value || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try {
    URL.revokeObjectURL(playbackUrl.value);
  } catch {
    // no-op
  }
  playbackUrl.value = "";
}

function setPlaybackUrlFromBlob(blob) {
  revokePlaybackUrl();
  if (!blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
  try {
    playbackUrl.value = URL.createObjectURL(blob);
  } catch {
    playbackUrl.value = "";
  }
}

function resolveSceneAudioDurationSec(audio) {
  const raw = Number(audio?.duration || 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(1, Math.ceil(raw));
}

function updateSceneAudioProgressTick() {
  if (!sceneAudioPlayer) return;
  const total = resolveSceneAudioDurationSec(sceneAudioPlayer);
  if (!total) return;

  const elapsed = Math.max(0, Number(sceneAudioPlayer.currentTime || 0));
  const progress = Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  const remaining = Math.max(0, Math.ceil(total - elapsed));
  practiceStore.setRTSListeningStatus({
    progress,
    status: "playing",
    label: "播放中...",
    remaining,
    total
  });
}

function setSceneAudioError(message) {
  sceneAudioError.value = `${message || ""}`.trim();
}

function reportSceneAudioFailure(message) {
  const fallbackMessage = `${message || "场景音频播放失败，请重试。"}`
    .trim();
  logSceneAudio("playback_failed", { message: fallbackMessage });
  setSceneAudioError(fallbackMessage);
  practiceStore.setRTSListeningStatus({
    progress: 0,
    status: "error",
    label: "播放失败，请重试",
    remaining: 0,
    total: 0
  });
  uiStore.showToast(fallbackMessage, "warning");
}

function scheduleSceneAutoPlay() {
  const questionId = resolveCurrentQuestionId();
  if (!questionId) return;
  logSceneAudio("auto_play_scheduled", {
    questionId,
    countdownSec: RTS_AUTO_PLAY_COUNTDOWN_SECONDS
  });
  void playSceneAudio({ reason: "auto", requireCountdown: true });
}

function resolveSceneAudioUrl() {
  return `${currentQuestion.value?.audio_url || ""}`.trim();
}

function isAbortError(error) {
  return `${error?.name || ""}` === "AbortError";
}

function createPlaybackSessionToken({ mode, questionId }) {
  stopSceneAudioPlayback({ invalidateToken: true });
  const token = scenePlaybackToken;
  logSceneAudio("playback_token", { token, mode, questionId });
  return token;
}

function updateAutoPlayCountdownStatus(remaining) {
  const total = RTS_AUTO_PLAY_COUNTDOWN_SECONDS;
  const safeRemaining = Math.max(0, Math.round(Number(remaining || 0)));
  const progress = Math.max(0, Math.min(100, Math.round(((total - safeRemaining) / total) * 100)));
  practiceStore.setRTSListeningStatus({
    progress,
    status: "autoplay_countdown",
    label: `音频播放前（阅读与缓冲时间）${safeRemaining}s`,
    remaining: safeRemaining,
    total
  });
}

function runAutoPlayCountdown(token, questionId) {
  clearAutoPlayTimer();
  autoPlayCountdown.value = true;
  autoPlayCountdownRemaining.value = RTS_AUTO_PLAY_COUNTDOWN_SECONDS;
  updateAutoPlayCountdownStatus(autoPlayCountdownRemaining.value);
  logSceneAudio("auto_play_countdown_start", { token, questionId, remaining: autoPlayCountdownRemaining.value });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      autoPlayCountdownCancel = null;
      clearAutoPlayTimer({ resolvePending: false });
      if (ok) {
        logSceneAudio("auto_play_countdown_done", { token, questionId });
        if (isPlaybackTokenActive(token, questionId) && !audioReady.value) {
          practiceStore.setRTSListeningStatus({
            progress: 0,
            status: "autoplay_waiting_ready",
            label: "阅读与缓冲结束，正在等待音频就绪...",
            remaining: 0,
            total: 0
          });
        }
      } else if (reason) {
        logSceneAudio("auto_play_countdown_cancelled", { token, questionId, reason });
      }
      resolve(ok);
    };

    autoPlayCountdownCancel = (cancelReason) => {
      finish(false, cancelReason || "cancelled");
    };

    autoPlayTickTimer = setInterval(() => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      autoPlayCountdownRemaining.value = Math.max(0, autoPlayCountdownRemaining.value - 1);
      updateAutoPlayCountdownStatus(autoPlayCountdownRemaining.value);
    }, 1000);

    autoPlayTimer = setTimeout(() => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      finish(true, "done");
    }, RTS_AUTO_PLAY_COUNTDOWN_SECONDS * 1000);
  });
}

function waitForAudioEvent(audio, { token, questionId, eventName, readyStateMin }) {
  if (!isPlaybackTokenActive(token, questionId)) return Promise.resolve(false);

  if (Number(audio.readyState || 0) >= readyStateMin) {
    logSceneAudio(eventName, { token, questionId, readyState: Number(audio.readyState || 0) });
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = null;

    const finish = (ok, reason) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      audio.removeEventListener(eventName, onEvent);
      audio.removeEventListener("error", onError);
      if (!ok && reason) {
        logSceneAudio(`${eventName}_wait_failed`, { token, questionId, reason, readyState: Number(audio.readyState || 0) });
      }
      resolve(ok);
    };

    const onEvent = () => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      logSceneAudio(eventName, { token, questionId, readyState: Number(audio.readyState || 0) });
      finish(true);
    };

    const onError = () => {
      finish(false, "audio_error");
    };

    timeoutId = setTimeout(() => {
      if (!isPlaybackTokenActive(token, questionId)) {
        finish(false, "stale");
        return;
      }
      if (Number(audio.readyState || 0) >= readyStateMin) {
        onEvent();
        return;
      }
      finish(false, "timeout");
    }, SCENE_READY_EVENT_TIMEOUT_MS);

    audio.addEventListener(eventName, onEvent, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
}

function handleActiveSceneAudioFailure({ token, questionId, mode, message, error }) {
  if (!isPlaybackTokenActive(token, questionId)) return;
  stopSceneAudioPlayback({ invalidateToken: false });
  logSceneAudio("error", {
    token,
    questionId,
    mode,
    message,
    error: `${error?.message || error || ""}`.trim()
  });
  reportSceneAudioFailure(message);
}

async function prepareSceneAudio({ token, questionId, mode, sceneAudioUrl }) {
  if (!isPlaybackTokenActive(token, questionId)) return false;

  audioPreparing.value = true;
  audioReady.value = false;

  logSceneAudio("prepare_start", { token, questionId, mode });
  if (mode === "manual") {
    practiceStore.setRTSListeningStatus({
      progress: 0,
      status: "loading",
      label: "加载场景音频...",
      remaining: 0,
      total: 0
    });
  }

  const controller = new AbortController();
  sceneAudioFetchController = controller;
  logSceneAudio("fetch_start", { token, questionId, mode, url: sceneAudioUrl });

  let response = null;
  try {
    response = await fetch(sceneAudioUrl, { signal: controller.signal });
  } catch (error) {
    if (sceneAudioFetchController === controller) {
      sceneAudioFetchController = null;
    }
    if (!isPlaybackTokenActive(token, questionId)) return false;
    if (isAbortError(error)) {
      logSceneAudio("fetch_aborted", { token, questionId, mode });
      return false;
    }
    handleActiveSceneAudioFailure({ token, questionId, mode, message: "场景音频加载失败，请重试。", error });
    return false;
  }

  if (sceneAudioFetchController === controller) {
    sceneAudioFetchController = null;
  }

  if (!isPlaybackTokenActive(token, questionId)) return false;
  logSceneAudio("fetch_done", { token, questionId, mode, status: Number(response?.status || 0) });

  if (!response?.ok) {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频加载失败，请重试。",
      error: new Error(`http_${response?.status || "unknown"}`)
    });
    return false;
  }

  let blob = null;
  try {
    blob = await response.blob();
  } catch (error) {
    if (!isPlaybackTokenActive(token, questionId)) return false;
    handleActiveSceneAudioFailure({ token, questionId, mode, message: "场景音频解析失败，请重试。", error });
    return false;
  }

  if (!isPlaybackTokenActive(token, questionId)) return false;

  logSceneAudio("blob_ready", {
    token,
    questionId,
    mode,
    size: Number(blob?.size || 0),
    type: `${blob?.type || ""}`.trim()
  });

  if (!blob || Number(blob.size || 0) <= 0) {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频文件为空，请重试。",
      error: new Error("empty_audio_blob")
    });
    return false;
  }

  let objectUrl = "";
  try {
    objectUrl = URL.createObjectURL(blob);
  } catch (error) {
    if (!isPlaybackTokenActive(token, questionId)) return false;
    handleActiveSceneAudioFailure({ token, questionId, mode, message: "场景音频初始化失败，请重试。", error });
    return false;
  }

  if (!isPlaybackTokenActive(token, questionId)) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch {
      // no-op
    }
    return false;
  }

  revokeSceneAudioObjectUrl();
  sceneAudioObjectUrl = objectUrl;
  logSceneAudio("object_url_created", { token, questionId, mode });

  const audio = ensureSceneAudioPlayer();
  resetSceneAudioHandlers(audio);
  audio.preload = "auto";
  audio.src = objectUrl;
  logSceneAudio("audio_src_assigned", { token, questionId, mode });
  audio.load();

  const metadataReady = await waitForAudioEvent(audio, {
    token,
    questionId,
    eventName: "loadedmetadata",
    readyStateMin: 1
  });
  if (!metadataReady) {
    if (isPlaybackTokenActive(token, questionId)) {
      handleActiveSceneAudioFailure({
        token,
        questionId,
        mode,
        message: "场景音频元数据加载失败，请重试。",
        error: new Error("loadedmetadata_timeout")
      });
    }
    return false;
  }

  const canPlayReady = await waitForAudioEvent(audio, {
    token,
    questionId,
    eventName: "canplay",
    readyStateMin: 3
  });
  if (!canPlayReady) {
    if (isPlaybackTokenActive(token, questionId)) {
      handleActiveSceneAudioFailure({
        token,
        questionId,
        mode,
        message: "场景音频加载失败，请重试。",
        error: new Error("canplay_timeout")
      });
    }
    return false;
  }

  if (!isPlaybackTokenActive(token, questionId)) return false;

  try {
    audio.currentTime = 0;
  } catch {
    // ignore
  }

  audioPreparing.value = false;
  audioReady.value = true;
  logSceneAudio("audio_ready", {
    token,
    questionId,
    mode,
    duration: Number(audio.duration || 0),
    readyState: Number(audio.readyState || 0)
  });
  return true;
}

async function playSceneAudio({ reason = "manual", requireCountdown = false } = {}) {
  if (!currentQuestion.value) return;
  if (currentPhase.value === PHASE.RECORDING || currentPhase.value === PHASE.PLAYBACK) {
    uiStore.showToast("请在听场景或准备阶段播放场景音频。", "warning");
    return;
  }

  const sceneAudioUrl = resolveSceneAudioUrl();
  if (!sceneAudioUrl) {
    reportSceneAudioFailure("该题场景音频缺失，请重试。");
    return;
  }
  const questionId = resolveCurrentQuestionId();
  const mode = reason === "auto" ? "auto" : "manual";

  if (currentPhase.value === PHASE.PREPARING) {
    timer.stopPrepareCountdown();
  }

  if (currentPhase.value !== PHASE.LISTENING) {
    practiceStore.setRTSPhase(PHASE.LISTENING);
  }

  setSceneAudioError("");
  const token = createPlaybackSessionToken({ mode, questionId });
  const shouldRunCountdown = mode === "auto" && Boolean(requireCountdown);
  if (shouldRunCountdown) {
    logSceneAudio("auto_play_scheduled", {
      token,
      questionId,
      mode,
      countdownSec: RTS_AUTO_PLAY_COUNTDOWN_SECONDS
    });
  } else {
    practiceStore.setRTSListeningStatus({
      progress: 0,
      status: "loading",
      label: "加载场景音频...",
      remaining: 0,
      total: 0
    });
  }

  const toPrepareIfNeeded = () => {
    if (currentPhase.value === PHASE.LISTENING) {
      startPreparePhase();
    }
  };

  const [prepared, countdownDone] = await Promise.all([
    prepareSceneAudio({ token, questionId, mode, sceneAudioUrl }),
    shouldRunCountdown ? runAutoPlayCountdown(token, questionId) : Promise.resolve(true)
  ]);

  if (!prepared || !countdownDone || !isPlaybackTokenActive(token, questionId)) {
    return;
  }

  const audio = ensureSceneAudioPlayer();
  let firstTimeupdateFired = false;

  resetSceneAudioHandlers(audio);
  audio.onplay = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    logSceneAudio("play_event", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0),
      duration: Number(audio.duration || 0)
    });
  };
  audio.onplaying = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    const total = resolveSceneAudioDurationSec(audio);
    practiceStore.setRTSListeningStatus({
      progress: 0,
      status: "playing",
      label: "播放中...",
      remaining: total,
      total
    });
    logSceneAudio("playing_event", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0),
      duration: Number(audio.duration || 0)
    });
  };
  audio.ontimeupdate = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    updateSceneAudioProgressTick();
    if (firstTimeupdateFired) return;
    firstTimeupdateFired = true;
    logSceneAudio("first_timeupdate", {
      token,
      questionId,
      mode,
      currentTime: Number(audio.currentTime || 0)
    });
  };

  audio.onended = () => {
    if (!isPlaybackTokenActive(token, questionId)) return;
    const total = resolveSceneAudioDurationSec(audio);
    resetSceneAudioHandlers(audio);
    practiceStore.setRTSListeningStatus({
      progress: 100,
      status: "ended",
      label: "再次播放",
      remaining: 0,
      total
    });
    toPrepareIfNeeded();
    logSceneAudio("ended", {
      token,
      questionId,
      mode,
      duration: Number(audio.duration || 0)
    });
  };

  audio.onerror = () => {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频播放失败，请重试。",
      error: new Error("audio_onerror")
    });
  };

  try {
    audio.currentTime = 0;
    logSceneAudio("play_called", { token, questionId, mode, reason, url: sceneAudioUrl });
    await audio.play();
  } catch (error) {
    handleActiveSceneAudioFailure({
      token,
      questionId,
      mode,
      message: "场景音频播放失败，请重试。",
      error
    });
  }
}

function startPreparePhase() {
  practiceStore.setRTSPhase(PHASE.PREPARING);
  timer.startPrepareCountdown(15, () => {
    void startRecordingPhase();
  });
}

async function startRecordingPhase() {
  if (!currentQuestion.value || currentPhase.value === PHASE.RECORDING) return;
  timer.stopPrepareCountdown();
  stopSceneAudioPlayback();
  practiceStore.setRTSPhase(PHASE.RECORDING);

  const started = await recorder.startRecording({ allowWithoutSpeechRecognition: true });
  if (!started) {
    practiceStore.setRTSPhase(PHASE.PREPARING);
    timer.startPrepareCountdown(15, () => {
      void startRecordingPhase();
    });
    return;
  }

  timer.startRecordCountdown(40, () => {
    void stopRecordingPhase("timeout");
  });
}

function resolvePlaybackDuration(stopResult) {
  const direct = Number(stopResult?.playableDurationSec || 0);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const elapsed = Math.max(0, recordTotal.value - recordRemaining.value);
  return elapsed;
}

async function stopRecordingPhase(reason = "manual") {
  if (currentPhase.value !== PHASE.RECORDING) return;
  timer.stopRecordCountdown();
  timer.stopPrepareCountdown();
  const finalizeToken = recordingFinalizeToken + 1;
  recordingFinalizeToken = finalizeToken;
  const questionIdAtStop = `${currentQuestion.value?.id || ""}`.trim();
  recordingFinalizePending.value = true;
  practiceStore.setRTSPhase(PHASE.PLAYBACK);
  try {
    const attemptId = Number(recorder.currentAttemptId.value || 0);
    const stopResult = await recorder.stopRecorderAndGetBlob({
      reason: `rts_${reason}`,
      attemptId: attemptId || undefined,
      skipPlayableValidation: true
    });

    const stillCurrentQuestion = `${currentQuestion.value?.id || ""}`.trim() === questionIdAtStop;
    if (finalizeToken !== recordingFinalizeToken || !stillCurrentQuestion) {
      return;
    }

    recordingStopResult.value = stopResult;
    playbackDurationSec.value = resolvePlaybackDuration(stopResult);
    const blob = stopResult?.blob || recorder.audioBlob.value || null;
    practiceStore.setAudioBlob(blob);
    setPlaybackUrlFromBlob(blob);
  } finally {
    if (finalizeToken === recordingFinalizeToken) {
      recordingFinalizePending.value = false;
    }
  }
}

async function stopRecorderSafely() {
  const attemptId = Number(recorder.currentAttemptId.value || 0);
  const shouldStop = Boolean(recorder.isRecording.value || recorder.isStopping.value || recorder.isReady.value);
  if (!shouldStop || !attemptId) return;
  try {
    await recorder.stopRecorderAndGetBlob({ reason: "rts_switch", attemptId, skipPlayableValidation: true });
  } catch {
    // no-op
  }
}

function favoriteStorageKey(userId) {
  return `kai_kou_rts_favorites_${userId}`;
}

function readLocalFavorites(userId) {
  const key = favoriteStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((item) => `${item || ""}`.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalFavorites(userId, favoriteSet) {
  const key = favoriteStorageKey(userId);
  try {
    localStorage.setItem(key, JSON.stringify([...favoriteSet]));
  } catch {
    // no-op
  }
}

function isMissingFavoritesTableError(error) {
  const code = `${error?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (code === "42P01") return true;
  return message.includes("relation") && message.includes("favorites");
}

function isDuplicateInsertError(error) {
  return `${error?.code || ""}` === "23505";
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function loadFavoriteState() {
  const userId = await resolveCurrentUserId();
  const questionId = `${currentQuestion.value?.id || ""}`.trim();
  if (!userId || !questionId) {
    isFavorite.value = false;
    return;
  }

  const localFavorites = readLocalFavorites(userId);
  isFavorite.value = localFavorites.has(questionId);

  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("task_type", "RTS")
      .eq("question_id", questionId)
      .limit(1);

    if (error) {
      if (isMissingFavoritesTableError(error)) {
        favoriteSource.value = "local";
        return;
      }
      throw error;
    }

    favoriteSource.value = "remote";
    isFavorite.value = Array.isArray(data) && data.length > 0;
    if (isFavorite.value) localFavorites.add(questionId);
    else localFavorites.delete(questionId);
    writeLocalFavorites(userId, localFavorites);
  } catch (error) {
    console.warn("RTS favorite load fallback to local:", error);
    favoriteSource.value = "local";
  }
}

async function toggleFavorite() {
  if (favoriteBusy.value) return;
  const userId = await resolveCurrentUserId();
  const questionId = `${currentQuestion.value?.id || ""}`.trim();
  if (!userId || !questionId) return;

  favoriteBusy.value = true;
  try {
    const next = !isFavorite.value;
    const localFavorites = readLocalFavorites(userId);
    if (next) localFavorites.add(questionId);
    else localFavorites.delete(questionId);
    writeLocalFavorites(userId, localFavorites);
    isFavorite.value = next;

    if (favoriteSource.value !== "local") {
      if (next) {
        const { error } = await supabase.from("favorites").insert({ user_id: userId, task_type: "RTS", question_id: questionId });
        if (error && !isDuplicateInsertError(error)) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      } else {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("task_type", "RTS")
          .eq("question_id", questionId);
        if (error) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      }
    }
  } catch (error) {
    console.warn("RTS favorite toggle failed:", error);
  } finally {
    favoriteBusy.value = false;
  }
}

async function loadTodayStatsPanel() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    todayStats.value = { practicedCount: 0, practiceMinutes: 0, averageRating: 0 };
    remoteRecentHistory.value = [];
    return;
  }

  const stats = await getUserRTSStats(userId, { recentLimit: 2, logsLimit: 400 });
  todayStats.value = {
    practicedCount: Number(stats.todayPracticed || 0),
    practiceMinutes: Number(stats.todayMinutes || 0),
    averageRating: Number(stats.averageRating || 0)
  };
  remoteRecentHistory.value = stats.recentLogs || [];
}

async function persistCurrentPractice() {
  const userId = await resolveCurrentUserId();
  if (!userId || !currentQuestion.value) return;

  const payload = {
    user_id: userId,
    task_type: "RTS",
    question_id: currentQuestion.value.id,
    transcript: "",
    score_json: {
      self_rating: Number(selfRating.value || 0),
      duration_sec: Number(playbackDurationSec.value || 0),
      topic: currentQuestion.value.topic,
      tone: currentQuestion.value?.key_points?.tone || ""
    },
    feedback: "",
    created_at: new Date().toISOString()
  };

  const { error } = await supabase.from("practice_logs").insert(payload);
  if (error) {
    console.warn("RTS practice_logs insert failed:", error, { questionId: currentQuestion.value.id });
  }
}

async function applyQuestion(nextQuestion, { syncRoute = true, autoPlay = true } = {}) {
  if (!nextQuestion) return;

  recordingFinalizeToken += 1;
  recordingFinalizePending.value = false;
  timer.stopAllCountdowns();
  stopSceneAudioPlayback();
  await stopRecorderSafely();

  currentQuestion.value = nextQuestion;
  activeTab.value = "mind";
  showFullTemplate.value = false;
  setSceneAudioError("");
  recordingStopResult.value = null;
  playbackDurationSec.value = 0;
  revokePlaybackUrl();

  const index = Math.max(0, questionPool.value.findIndex((item) => item.id === nextQuestion.id));
  const initialListeningStatus = autoPlay ? "autoplay_countdown" : "idle";
  const initialListeningLabel = autoPlay
    ? `音频播放前（阅读与缓冲时间）${RTS_AUTO_PLAY_COUNTDOWN_SECONDS}s`
    : "点击播放场景";
  const initialListeningRemaining = autoPlay ? RTS_AUTO_PLAY_COUNTDOWN_SECONDS : 0;
  const initialListeningTotal = autoPlay ? RTS_AUTO_PLAY_COUNTDOWN_SECONDS : 0;
  practiceStore.initRTSSession({
    phase: PHASE.LISTENING,
    questionId: nextQuestion.id,
    questionIndex: index + 1,
    totalQuestions: questionPool.value.length,
    prepareRemaining: 15,
    prepareTotal: 15,
    recordRemaining: 40,
    recordTotal: 40,
    listeningProgress: 0,
    listeningStatus: initialListeningStatus,
    listeningLabel: initialListeningLabel,
    listeningRemaining: initialListeningRemaining,
    listeningTotal: initialListeningTotal,
    selfRating: 0,
    usedPhraseIds: []
  });

  if (syncRoute) {
    router.replace({ path: "/rts/practice", query: { id: nextQuestion.id } });
  }

  if (autoPlay) scheduleSceneAutoPlay();
  await loadFavoriteState();
}

async function resolveQuestionByRoute() {
  const routeQuestionId = `${route.query?.id || ""}`.trim();
  let targetQuestion = null;

  if (routeQuestionId) {
    targetQuestion = await getQuestionById(routeQuestionId);
  }
  if (!targetQuestion) {
    targetQuestion = await getRandomQuestion(currentQuestion.value?.id || "");
  }
  if (!targetQuestion) return null;

  if (`${currentQuestion.value?.id || ""}`.trim() === `${targetQuestion.id || ""}`.trim()) return targetQuestion;

  await applyQuestion(targetQuestion, { syncRoute: true, autoPlay: true });
  return targetQuestion;
}

async function handleNextQuestion() {
  if (nextQuestionBusy.value || !currentQuestion.value) return;
  nextQuestionBusy.value = true;
  try {
    const shouldPersist = currentPhase.value === PHASE.PLAYBACK;
    if (shouldPersist) {
      await persistCurrentPractice();

      if (hasUsableAudio.value && playbackUrl.value) {
        practiceStore.pushRTSRecentRecording({
          questionId: currentQuestion.value.id,
          blobUrl: playbackUrl.value,
          durationSec: Number(playbackDurationSec.value || 0),
          rating: Number(selfRating.value || 0),
          createdAt: new Date().toISOString()
        });
        playbackUrl.value = "";
      }

      await loadTodayStatsPanel();
    }

    const candidates = questionPool.value.filter((item) => item.id !== currentQuestion.value.id);
    const nextQuestion = (candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : currentQuestion.value) || null;
    if (!nextQuestion) return;

    if (nextQuestion.id === currentQuestion.value.id) {
      await applyQuestion(nextQuestion, { syncRoute: false, autoPlay: true });
      return;
    }

    router.replace({ path: "/rts/practice", query: { id: nextQuestion.id } });
  } finally {
    nextQuestionBusy.value = false;
  }
}

function replayHistory(item) {
  if (item?.source === "local" && item?.blobUrl) return;
  if (!item?.questionId) return;
  router.push({ path: "/rts/practice", query: { id: item.questionId } });
}

async function bootstrap() {
  loading.value = true;
  try {
    questionPool.value = await loadQuestions();
    if (!questionPool.value.length) return;
    await resolveQuestionByRoute();
    await loadTodayStatsPanel();
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.query.id,
  async (next, prev) => {
    if (loading.value) return;
    if (`${next || ""}`.trim() === `${prev || ""}`.trim()) return;
    await resolveQuestionByRoute();
  }
);

onMounted(() => {
  void bootstrap();
});

onUnmounted(() => {
  recordingFinalizeToken += 1;
  recordingFinalizePending.value = false;
  timer.stopAllCountdowns();
  destroySceneAudioPlayer();
  void stopRecorderSafely();
  revokePlaybackUrl();
});
</script>
<template>
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 transition-opacity hover:opacity-90" @click="goHome">← 首页</button>
        <p class="text-base font-semibold">RTS 情景回应</p>
        <p class="text-xs text-white/80">第{{ questionIndex }}题/共{{ totalQuestions }}</p>
      </div>
      <div class="mx-auto flex max-w-6xl items-center justify-between border-t border-white/15 px-4 py-2">
        <div class="flex items-center gap-1">
          <span
            v-for="dot in progressDots"
            :key="dot.index"
            class="h-1.5 w-4 rounded-full transition-colors"
            :class="dot.active ? 'bg-[#E8845A]' : 'bg-white/25'"
          />
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-full border px-2.5 py-1 text-xs transition-colors"
            :class="isFavorite ? 'border-[#E8845A] bg-[#E8845A] text-white' : 'border-white/25 text-white hover:bg-white/10'"
            :disabled="favoriteBusy"
            @click="toggleFavorite"
          >
            {{ isFavorite ? "★ 已收藏" : "☆ 收藏" }}
          </button>
          <button
            type="button"
            class="rounded-full border border-white/25 px-2.5 py-1 text-xs text-white transition-colors hover:bg-white/10"
            @click="goList"
          >
            选题
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-5">
      <section v-if="loading" class="rounded-[14px] border border-[#E8EDF5] bg-white p-5 text-sm text-[#8CA0C0]">
        练习页加载中...
      </section>

      <template v-else-if="currentQuestion">
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section class="space-y-4 rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-[#EDF2FB] px-2.5 py-1 text-xs font-semibold text-[#1B3A6B]">{{ currentQuestion.id }}</span>
              <span class="rounded-full px-2.5 py-1 text-xs" :class="topicMeta.badgeClass">{{ topicMeta.label }}</span>
              <span class="rounded-full bg-[#FFF3EC] px-2.5 py-1 text-xs text-[#E8845A]">{{ toneLabel }}</span>
            </div>

            <div class="rounded-[14px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
              <p class="text-xs font-semibold text-[#8CA0C0]">情景描述</p>
              <div class="mt-2 rounded-[11px] border border-[#E8EDF5] bg-white p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="rounded-[11px] bg-[#1B3A6B] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                    @click="playSceneAudio"
                  >
                    ▶ 播放
                  </button>
                  <p class="text-xs text-[#8CA0C0]">{{ listeningLabel }}</p>
                </div>
                <div class="mt-2 h-2 overflow-hidden rounded-full bg-[#E8EDF5]">
                  <div class="h-full bg-[#1B3A6B] transition-all" :style="{ width: `${listeningProgress}%` }" />
                </div>
                <p v-if="autoPlayHint" class="mt-2 text-xs text-[#1B3A6B]">
                  {{ autoPlayHint }}
                </p>
                <p v-if="sceneAudioError" class="mt-2 text-xs text-[#E8845A]">
                  {{ sceneAudioError }}
                </p>
              </div>

              <p class="mt-3 text-sm leading-relaxed text-[#1E293B]" v-html="highlightedScenarioHtml" />

              <div class="mt-3 rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFF8F4] px-3 py-2">
                <p class="text-xs text-[#8CA0C0]">你的角色</p>
                <p class="mt-1 text-sm text-[#1E293B]">{{ currentQuestion.key_points?.role || "请根据场景代入角色回应。" }}</p>
              </div>
            </div>

            <div class="grid grid-cols-4 gap-2">
              <article
                v-for="stage in stageList"
                :key="stage.key"
                class="rounded-[11px] border px-2 py-2 text-center text-xs"
                :class="stage.isActive
                  ? 'border-[#1B3A6B] bg-[#EDF2FB] text-[#1B3A6B]'
                  : stage.isDone
                    ? 'border-[#E8845A] bg-[#FFF3EC] text-[#E8845A]'
                    : 'border-[#E8EDF5] bg-white text-[#8CA0C0]'"
              >
                {{ stage.label }}
              </article>
            </div>

            <div class="rounded-[11px] border border-[#E8EDF5] bg-white p-3">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-xs text-[#8CA0C0]">{{ timerInfo.label }}</p>
                <p class="text-xs font-semibold text-[#1B3A6B]">{{ timerInfo.remaining }}s</p>
              </div>
              <div class="h-2 overflow-hidden rounded-full bg-[#E8EDF5]">
                <div class="h-full bg-[#E8845A] transition-all" :style="{ width: `${timerInfo.progress}%` }" />
              </div>
            </div>

            <div class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
              <template v-if="currentPhase === PHASE.LISTENING">
                <button
                  type="button"
                  class="w-full rounded-[11px] bg-[#52C41A] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                  @click="playSceneAudio"
                >
                  {{ listeningActionLabel }}
                </button>
              </template>

              <template v-else-if="currentPhase === PHASE.PREPARING">
                <div class="space-y-2">
                  <button
                    type="button"
                    class="w-full rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                    @click="startRecordingPhase"
                  >
                    准备完毕，开始回应
                  </button>
                  <button
                    type="button"
                    class="w-full rounded-[11px] border border-[#E8EDF5] bg-white px-4 py-3 text-sm font-semibold text-[#8CA0C0] hover:bg-[#F8FAFD]"
                    @click="playSceneAudio"
                  >
                    再听一遍场景
                  </button>
                </div>
              </template>

              <template v-else-if="currentPhase === PHASE.RECORDING">
                <button
                  type="button"
                  class="w-full rounded-[11px] bg-[#1B3A6B] px-4 py-3 text-sm font-semibold text-white hover:opacity-90"
                  :disabled="!canStopRecording"
                  @click="stopRecordingPhase('manual')"
                >
                  正在录音 · 点击结束
                </button>
                <div class="mt-2 rounded-[11px] bg-white px-3 py-2">
                  <RecordingWave :is-recording="recorder.isRecording" />
                </div>
              </template>
              <template v-else>
                <div class="space-y-3">
                  <p v-if="recordingFinalizePending" class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]">
                    正在生成录音回放，请稍候...
                  </p>
                  <div v-if="hasUsableAudio && playbackUrl" class="rounded-[11px] border border-[#E8EDF5] bg-white p-3">
                    <audio class="w-full" :src="playbackUrl" controls preload="metadata" />
                    <p class="mt-1 text-xs text-[#8CA0C0]">时长 {{ formatDuration(playbackDurationSec) }}</p>
                  </div>
                  <p v-else-if="!recordingFinalizePending" class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-2 text-xs text-[#8CA0C0]">
                    本次录音不可用，请直接下一题或重新开始该题。
                  </p>

                  <div>
                    <p class="mb-2 text-xs text-[#8CA0C0]">自我评分：{{ RATING_LABELS[selfRating] || "请选择" }}</p>
                    <div class="flex items-center gap-2">
                      <button
                        v-for="star in [1, 2, 3, 4, 5]"
                        :key="star"
                        type="button"
                        class="text-xl transition-colors"
                        :class="star <= selfRating ? 'text-[#E8845A]' : 'text-[#D3DCE9]'"
                        @click="setRating(star)"
                      >
                        ★
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <button
                type="button"
                class="mt-3 w-full rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="nextQuestionBusy"
                @click="handleNextQuestion"
              >
                {{ nextQuestionBusy ? "跳转中..." : "下一题 →" }}
              </button>
            </div>
          </section>

          <section class="space-y-3 rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-[#1B3A6B]">回应辅助</h2>
              <div class="flex gap-1">
                <button
                  v-for="item in [
                    { key: 'mind', label: '思路' },
                    { key: 'template', label: '模板' },
                    { key: 'phrases', label: '句型' },
                    { key: 'tips', label: '要点' }
                  ]"
                  :key="item.key"
                  type="button"
                  class="rounded-[20px] px-2.5 py-1 text-xs transition-colors"
                  :class="activeTab === item.key ? 'bg-[#1B3A6B] text-white' : 'bg-[#F8FAFD] text-[#8CA0C0] hover:text-[#1B3A6B]'"
                  @click="activeTab = item.key"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div v-if="activeTab === 'mind'" class="space-y-2">
              <div class="flex flex-wrap gap-2">
                <span class="rounded-[20px] bg-[#EDF2FB] px-2.5 py-1 text-xs text-[#1B3A6B]">{{ toneLabel }}</span>
                <span class="rounded-[20px] px-2.5 py-1 text-xs" :class="topicMeta.badgeClass">{{ topicMeta.label }}</span>
                <span class="rounded-[20px] bg-[#FFF3EC] px-2.5 py-1 text-xs text-[#E8845A]">{{ behaviorLabel }}</span>
              </div>

              <article
                v-for="(item, idx) in directions"
                :key="`${item.head}-${idx}`"
                class="rounded-[11px] border bg-[#F8FAFD] p-3"
                :class="idx === 0 ? 'border-l-4 border-l-[#1B3A6B]' : idx === 1 ? 'border-l-4 border-l-[#52C41A]' : 'border-l-4 border-l-[#E8845A]'"
              >
                <p class="text-sm font-semibold text-[#1E293B]">{{ item.head }}</p>
                <p class="mt-1 text-xs leading-relaxed text-[#8CA0C0]">{{ item.body }}</p>
                <p class="mt-2 text-xs italic text-[#1B3A6B]">{{ item.eg }}</p>
              </article>
            </div>

            <div v-else-if="activeTab === 'template'" class="space-y-3">
              <div class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3 text-sm leading-relaxed text-[#1E293B]">
                <template v-for="(segment, idx) in templateOpenerSegments" :key="`${segment.text}-${idx}`">
                  <span v-if="segment.isSlot" class="rounded bg-[#FFE6D9] px-1.5 py-0.5 text-[#E8845A]">{{ segment.text }}</span>
                  <span v-else>{{ segment.text }}</span>
                </template>
                <span v-if="!templateOpenerSegments.length" class="text-[#8CA0C0]">暂无开场模板</span>
              </div>

              <button type="button" class="text-xs font-semibold text-[#1B3A6B] underline" @click="showFullTemplate = !showFullTemplate">
                {{ showFullTemplate ? "收起完整示例回应" : "查看完整示例回应" }}
              </button>

              <p v-if="showFullTemplate" class="rounded-[11px] border border-[#E8EDF5] bg-white p-3 text-sm leading-relaxed text-[#1E293B]">
                {{ currentQuestion.key_points?.templateFull || "暂无完整示例。" }}
              </p>

              <span class="inline-flex rounded-[20px] bg-[#EDF2FB] px-2.5 py-1 text-xs text-[#1B3A6B]">适用语气：{{ toneLabel }}</span>
            </div>

            <div v-else-if="activeTab === 'phrases'" class="space-y-3">
              <section v-for="group in phraseGroups" :key="group.key" class="space-y-2">
                <p class="text-xs font-semibold text-[#8CA0C0]">{{ group.label }}</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="(item, idx) in group.items"
                    :key="`${group.key}-${idx}`"
                    type="button"
                    class="rounded-[20px] border px-2.5 py-1 text-xs transition-colors"
                    :class="isPhraseUsed(group.key, idx, item) ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white' : 'border-[#E8EDF5] bg-white text-[#1E293B] hover:bg-[#F8FAFD]'"
                    @click="togglePhrase(group.key, idx, item)"
                  >
                    {{ item }}
                  </button>
                </div>
              </section>
            </div>

            <div v-else class="space-y-2">
              <article
                v-for="(item, idx) in tips"
                :key="`${item}-${idx}`"
                class="rounded-[11px] border border-l-4 border-l-[#E8845A] border-[#E8EDF5] bg-[#FFF8F4] p-3 text-sm text-[#1E293B]"
              >
                {{ item }}
              </article>
              <p v-if="!tips.length" class="text-xs text-[#8CA0C0]">暂无提示要点。</p>
            </div>
          </section>
        </div>

        <section class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <p class="text-sm font-semibold text-[#1B3A6B]">今日练习统计</p>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <div class="rounded-[11px] bg-[#F8FAFD] px-3 py-2">
                <p class="text-xs text-[#8CA0C0]">已练题数</p>
                <p class="mt-1 text-lg font-semibold text-[#1E293B]">{{ todayStats.practicedCount }}</p>
              </div>
              <div class="rounded-[11px] bg-[#F8FAFD] px-3 py-2">
                <p class="text-xs text-[#8CA0C0]">分钟</p>
                <p class="mt-1 text-lg font-semibold text-[#1E293B]">{{ todayStats.practiceMinutes }}</p>
              </div>
              <div class="rounded-[11px] bg-[#F8FAFD] px-3 py-2">
                <p class="text-xs text-[#8CA0C0]">平均评分</p>
                <p class="mt-1 text-lg font-semibold text-[#1E293B]">{{ todayStats.averageRating || "0.0" }}</p>
              </div>
            </div>
          </article>

          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4">
            <p class="text-sm font-semibold text-[#1B3A6B]">历史录音（最近2条）</p>
            <div v-if="!historyItems.length" class="mt-3 rounded-[11px] bg-[#F8FAFD] p-3 text-xs text-[#8CA0C0]">
              还没有可展示的录音记录。
            </div>
            <div v-else class="mt-3 space-y-2">
              <article v-for="item in historyItems" :key="item.id" class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="line-clamp-1 text-xs font-medium text-[#1E293B]">{{ item.summary }}</p>
                  <p class="text-xs text-[#1B3A6B]">{{ renderStars(item.rating) }}</p>
                </div>
                <p class="mt-1 text-xs text-[#8CA0C0]">{{ formatDateTime(item.createdAt) }} · {{ formatDuration(item.durationSec) }}</p>
                <div class="mt-2">
                  <audio v-if="item.hasAudio" class="w-full" :src="item.blobUrl" controls preload="metadata" />
                  <button
                    v-else
                    type="button"
                    class="rounded-[11px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#8CA0C0] hover:bg-[#F8FAFD]"
                    @click="replayHistory(item)"
                  >
                    进入题目重练
                  </button>
                </div>
              </article>
            </div>
          </article>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";
import { useDIRecorder } from "@/composables/useDIRecorder";
import { getDIQuestionsByFilters, getDITemplateById, getDITemplatesByFilters } from "@/lib/di-data";
import {
  DI_IMAGE_TYPE_FILTERS,
  getDIImageTypeMeta,
  inferDIImageTypeFromText,
  normalizeDIImageType
} from "@/composables/useDITemplate";

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const uiStore = useUIStore();

const SESSION_TOTAL = 6;

const loadingQuestions = ref(true);
const loadingStats = ref(false);
const submittingRound = ref(false);
const allQuestions = ref([]);
const selectedImageType = ref("map");
const sessionQuestions = ref([]);
const currentQuestionIndex = ref(0);
const activeTab = ref("structure");
const templatePickerOpen = ref(false);
const templateMode = ref("random");
const usedPhraseFlags = ref({});
const selectedTemplateId = ref("");
const carriedTemplateBlockIds = ref([]);
const selfRating = ref(0);
const isFavorite = ref(false);
const favoriteBusy = ref(false);
const favoriteSource = ref("checking");
const latestSavedAt = ref("");
const playbackTimeSec = ref(0);
const playbackDurationSec = ref(0);
const historyAudioRefs = reactive({});
const summaryStats = ref({
  practicedCount: 0,
  totalMinutes: 0,
  averageRating: 0
});

const diRecorder = useDIRecorder({
  prepareSeconds: 25,
  recordingSeconds: 40
});
const recorderPhase = computed(() => `${diRecorder.phase.value || ""}`.trim());
const recorderTimerLabel = computed(() => `${diRecorder.timerLabel.value || ""}`.trim());
const recorderTimerRemaining = computed(() => Number(diRecorder.timerRemaining.value || 0));
const recorderTimerProgress = computed(() => Number(diRecorder.timerProgress.value || 0));
const canSkipPrepare = computed(() => Boolean(diRecorder.canSkipPrepare.value));
const canFinishRecording = computed(() => Boolean(diRecorder.canFinishRecording.value));
const recorderPreviewUrl = computed(() => `${diRecorder.previewUrl.value || ""}`.trim());

const currentQuestion = computed(() => sessionQuestions.value[currentQuestionIndex.value] || null);
const currentImageMeta = computed(() => getDIImageTypeMeta(currentQuestion.value?.imageType || selectedImageType.value));
const templateCandidates = computed(() => {
  if (carriedTemplateBlockIds.value.length) {
    const carriedTemplates = carriedTemplateBlockIds.value
      .map((templateId) => getDITemplateById(templateId))
      .filter(Boolean);
    if (carriedTemplates.length) {
      return carriedTemplates;
    }
  }

  const imageType = currentQuestion.value?.imageType || selectedImageType.value;
  return getDITemplatesByFilters({
    imageType
  });
});
const selectedTemplate = computed(() => {
  const templates = templateCandidates.value;
  if (!templates.length) return null;
  const selectedId = `${selectedTemplateId.value || ""}`.trim();
  if (selectedId) {
    const matched = templates.find((item) => item.id === selectedId);
    if (matched) return matched;
  }
  return templates[0] || null;
});
const templateCountLabel = computed(() => templateCandidates.value.length);
const questionHighFrequencyWords = computed(() => normalizeQuestionHighFrequencyWords(currentQuestion.value?.highFrequencyWords));
const progressDots = computed(() => {
  const total = sessionQuestions.value.length || SESSION_TOTAL;
  return Array.from({ length: total }, (_, index) => index);
});
const currentStageIndex = computed(() => {
  if (diRecorder.phase.value === "prepare") return 0;
  if (diRecorder.phase.value === "recording") return 1;
  return 2;
});
const stageItems = [
  { key: "prepare", label: "看图准备" },
  { key: "recording", label: "开口描述" },
  { key: "playback", label: "听回放" }
];
const playbackTimeLabel = computed(() => `${formatSeconds(playbackTimeSec.value)} / ${formatSeconds(playbackDurationSec.value)}`);
const ratingCopy = computed(() => {
  const map = {
    1: "卡壳了",
    2: "凑合",
    3: "还不错",
    4: "很流利",
    5: "完美！"
  };
  return map[selfRating.value] || "请先自评后再进入下一题";
});
const recentRecordings = computed(() => practiceStore.diRecentRecordings.slice(0, 3));
const canGoNext = computed(() => selfRating.value > 0 || submittingRound.value);
const recorderErrorText = computed(() => `${diRecorder.recorder.error.value || ""}`.trim());

watch(
  () => diRecorder.phase.value,
  (value) => {
    practiceStore.setPhase(value);
  },
  { immediate: true }
);

watch(
  () => diRecorder.stopResult.value,
  (value) => {
    practiceStore.setAudioBlob(value?.blob || null);
    practiceStore.setTranscript(value?.transcript || "");
    playbackTimeSec.value = 0;
    playbackDurationSec.value = Math.max(0, Number(value?.playableDurationSec || diRecorder.recordingDurationSec.value || 0));
    selfRating.value = 0;
  }
);

function clampDifficulty(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(3, Math.round(parsed)));
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // no-op
    }
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeQueryArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => `${item || ""}`.trim()).filter(Boolean))];
  }
  const text = `${value || ""}`.trim();
  return text ? [text] : [];
}

function syncTemplateCarryFromRoute() {
  carriedTemplateBlockIds.value = normalizeQueryArray(route.query?.tb);
}

function normalizeQuestionHighFrequencyWords(value) {
  return toArray(value)
    .map((item) => {
      const word = `${item?.word || ""}`.trim();
      if (!word) return null;
      return {
        word,
        partOfSpeech: `${item?.partOfSpeech || item?.pos || ""}`.trim(),
        chinese: `${item?.chinese || item?.definitionZh || item?.defZh || ""}`.trim(),
        note: `${item?.note || item?.definitionEn || item?.defEn || ""}`.trim(),
        example: `${item?.example || ""}`.trim()
      };
    })
    .filter(Boolean);
}

function normalizeQuestionRow(row) {
  const content = `${row?.content || ""}`.trim();
  const topic = `${row?.topic || row?.displayTitle || row?.sourceNumberLabel || ""}`.trim();
  const imageUrl = `${row?.image_url || row?.imageUrl || ""}`.trim();
  const normalizedType = normalizeDIImageType(row?.image_type);
  const inferredType = normalizedType || inferDIImageTypeFromText(topic, content);

  return {
    id: `${row?.id || ""}`.trim(),
    taskType: "DI",
    content,
    topic,
    imageUrl,
    keyPoints: toArray(row?.key_points),
    difficulty: clampDifficulty(row?.difficulty),
    imageType: inferredType,
    highFrequencyWords: normalizeQuestionHighFrequencyWords(
      row?.high_frequency_words || row?.highFrequencyWords || row?.vocab || row?.key_terms || row?.keyTerms
    )
  };
}

function getLocalFallbackQuestions() {
  const local = getDIQuestionsByFilters({});
  return (Array.isArray(local) ? local : [])
    .map((item) =>
      normalizeQuestionRow({
        id: item.id,
        content: item.promptText || item.content || item.displayTitle,
        topic: item.displayTitle || item.sourceNumberLabel,
        image_url: item.imageUrl,
        key_points: item.tags || [],
        difficulty: item.difficulty,
        image_type: item.imageType,
        highFrequencyWords: item.highFrequencyWords || []
      })
    )
    .filter((item) => item.id && item.content);
}

function shuffle(list) {
  const cloned = [...list];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[swapIndex]] = [cloned[swapIndex], cloned[i]];
  }
  return cloned;
}

function formatSeconds(value) {
  const sec = Math.max(0, Math.round(Number(value || 0)));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return date.toLocaleString();
}

function resolveStartOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function resolveEndOfTodayIso() {
  const now = new Date();
  now.setHours(24, 0, 0, 0);
  return now.toISOString();
}
function resolveDurationFromScoreJson(scoreJson) {
  const score = scoreJson && typeof scoreJson === "object" ? scoreJson : {};
  const fromFlat = Number(score?.duration_sec || 0);
  if (Number.isFinite(fromFlat) && fromFlat > 0) return fromFlat;
  const fromMetrics = Number(score?.metrics?.speech_duration_sec || 0);
  if (Number.isFinite(fromMetrics) && fromMetrics > 0) return fromMetrics;
  return 0;
}

function resolveRatingFromScoreJson(scoreJson) {
  const score = scoreJson && typeof scoreJson === "object" ? scoreJson : {};
  const rating = Number(score?.self_rating || 0);
  if (!Number.isFinite(rating)) return 0;
  return Math.max(0, Math.min(5, Math.round(rating)));
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function loadQuestions() {
  loadingQuestions.value = true;
  try {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("task_type", "DI")
      .order("id", { ascending: true });

    if (error) throw error;

    const normalized = (Array.isArray(data) ? data : [])
      .filter((row) => row?.is_active !== false)
      .map((row) => normalizeQuestionRow(row))
      .filter((row) => row.id && row.content);

    if (normalized.length) {
      allQuestions.value = normalized;
      return;
    }

    const fallback = getLocalFallbackQuestions();
    allQuestions.value = fallback;
    if (fallback.length) {
      uiStore.showToast("Supabase 暂无 DI 题，已使用本地种子题库。", "warning");
    } else {
      uiStore.showToast("DI 题库为空，请先在 Supabase questions 表添加 DI 题目。", "warning");
    }
  } catch (error) {
    console.warn("DI questions load failed:", error);
    const fallback = getLocalFallbackQuestions();
    allQuestions.value = fallback;
    if (fallback.length) {
      uiStore.showToast("Supabase 读取失败，已使用本地种子题库。", "warning");
    } else {
      uiStore.showToast("DI 题库加载失败，请检查 Supabase 配置。", "warning");
    }
  } finally {
    loadingQuestions.value = false;
  }
}

function resetTemplatePanelState() {
  activeTab.value = "structure";
  usedPhraseFlags.value = {};
  templatePickerOpen.value = false;
  templateMode.value = carriedTemplateBlockIds.value.length ? "manual" : "random";
}

function chooseRandomTemplate() {
  const templates = templateCandidates.value;
  templateMode.value = "random";
  templatePickerOpen.value = false;
  if (!templates.length) {
    selectedTemplateId.value = "";
    return;
  }
  const randomItem = templates[Math.floor(Math.random() * templates.length)];
  selectedTemplateId.value = randomItem?.id || "";
}

function applyCarriedTemplateForCurrentQuestion() {
  const templates = templateCandidates.value;
  if (!templates.length) {
    selectedTemplateId.value = "";
    templateMode.value = "random";
    return false;
  }

  if (!carriedTemplateBlockIds.value.length) return false;

  const matchedTemplateId = carriedTemplateBlockIds.value.find((templateId) =>
    templates.some((item) => item.id === templateId)
  );
  if (!matchedTemplateId) return false;

  selectedTemplateId.value = matchedTemplateId;
  templateMode.value = "manual";
  templatePickerOpen.value = false;
  return true;
}

function selectTemplate(templateId) {
  const normalized = `${templateId || ""}`.trim();
  if (!normalized) return;
  const exists = templateCandidates.value.some((item) => item.id === normalized);
  if (!exists) return;
  templateMode.value = "manual";
  selectedTemplateId.value = normalized;
  templatePickerOpen.value = false;
}

function toggleTemplatePicker() {
  const next = !templatePickerOpen.value;
  templatePickerOpen.value = next;
  if (next) {
    templateMode.value = "manual";
  }
}

async function applyQuestionState() {
  const question = currentQuestion.value;
  if (!question) return;
  practiceStore.setQuestion(question);
  practiceStore.setTranscript("");
  practiceStore.setAudioBlob(null);
  playbackTimeSec.value = 0;
  playbackDurationSec.value = 0;
  selfRating.value = 0;
  latestSavedAt.value = "";
  resetTemplatePanelState();
  const appliedCarriedTemplate = applyCarriedTemplateForCurrentQuestion();
  if (!appliedCarriedTemplate) {
    chooseRandomTemplate();
  }
  await loadFavoriteState();
  await diRecorder.enterPreparePhase();
}

async function buildSession(type, preferredQuestionId = "") {
  const normalizedType = normalizeDIImageType(type) || "map";
  selectedImageType.value = normalizedType;
  const sameTypePool = allQuestions.value.filter((item) => item.imageType === normalizedType);
  const sourcePool = sameTypePool.length ? sameTypePool : allQuestions.value;

  if (!sourcePool.length) {
    sessionQuestions.value = [];
    currentQuestionIndex.value = 0;
    return;
  }

  const shuffled = shuffle(sourcePool);
  const sessionSize = Math.min(SESSION_TOTAL, shuffled.length);
  let session = shuffled.slice(0, sessionSize);
  const normalizedPreferred = `${preferredQuestionId || ""}`.trim();
  if (normalizedPreferred) {
    const preferred = sourcePool.find((item) => item.id === normalizedPreferred);
    if (preferred) {
      session = [preferred, ...session.filter((item) => item.id !== preferred.id)].slice(0, sessionSize);
    }
  }

  sessionQuestions.value = session;
  currentQuestionIndex.value = 0;
  await applyQuestionState();
}

async function initializeSessionFromRoute() {
  const preferredQuestionId = `${route.query?.qid || route.query?.questionId || route.params?.id || ""}`.trim();
  const routeType = normalizeDIImageType(route.query?.type || route.query?.imageType);
  const questionMatchedType = preferredQuestionId
    ? allQuestions.value.find((item) => item.id === preferredQuestionId)?.imageType
    : "";
  const preferredType = routeType || normalizeDIImageType(questionMatchedType) || "map";
  await buildSession(preferredType, preferredQuestionId);
}

async function switchImageType(type) {
  if (!type || type === selectedImageType.value) return;
  await buildSession(type);
}

async function activateRandomQuestion() {
  if (!sessionQuestions.value.length) return;
  if (sessionQuestions.value.length === 1) {
    await buildSession(selectedImageType.value);
    return;
  }

  let nextIndex = currentQuestionIndex.value;
  while (nextIndex === currentQuestionIndex.value) {
    nextIndex = Math.floor(Math.random() * sessionQuestions.value.length);
  }
  currentQuestionIndex.value = nextIndex;
  await applyQuestionState();
}

async function startRecordingNow() {
  const ok = await diRecorder.skipPreparePhase();
  if (!ok && recorderErrorText.value) {
    uiStore.showToast(recorderErrorText.value, "warning");
  }
}

async function jumpToNextQuestionFromPrepare() {
  if (recorderPhase.value !== "prepare") return;
  if (!sessionQuestions.value.length) return;

  diRecorder.timer.stop();
  diRecorder.recorder.stopRecording();

  if (currentQuestionIndex.value >= sessionQuestions.value.length - 1) {
    await buildSession(selectedImageType.value);
    return;
  }

  currentQuestionIndex.value += 1;
  await applyQuestionState();
}

function togglePhraseUsage(phrase) {
  const key = `${phrase || ""}`.trim().toLowerCase();
  if (!key) return;
  const next = { ...usedPhraseFlags.value };
  next[key] = !next[key];
  usedPhraseFlags.value = next;
}

function isPhraseUsed(phrase) {
  const key = `${phrase || ""}`.trim().toLowerCase();
  return Boolean(usedPhraseFlags.value[key]);
}

function onPlaybackTimeUpdate(event) {
  const audio = event?.target;
  if (!(audio instanceof HTMLAudioElement)) return;
  playbackTimeSec.value = Number(audio.currentTime || 0);
}

function onPlaybackLoadedMetadata(event) {
  const audio = event?.target;
  if (!(audio instanceof HTMLAudioElement)) return;
  playbackDurationSec.value = Number(audio.duration || diRecorder.recordingDurationSec.value || 0);
}

function bindHistoryAudioRef(recordId, element) {
  const id = `${recordId || ""}`.trim();
  if (!id) return;
  if (element) historyAudioRefs[id] = element;
  else delete historyAudioRefs[id];
}

function playHistoryRecord(record) {
  const id = `${record?.id || ""}`.trim();
  const audio = historyAudioRefs[id];
  if (!(audio instanceof HTMLAudioElement)) return;
  try {
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === "function") {
      playback.catch(() => {
        // no-op
      });
    }
  } catch {
    // no-op
  }
}
function favoriteLocalStorageKey(userId) {
  return `kai_kou_di_favorites_${userId}`;
}

function readLocalFavorites(userId) {
  const key = favoriteLocalStorageKey(userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return new Set();
    return new Set(list.map((item) => `${item || ""}`.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalFavorites(userId, favoriteSet) {
  const key = favoriteLocalStorageKey(userId);
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
      .eq("task_type", "DI")
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
    console.warn("DI favorite load fallback to local:", error);
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
    const nextState = !isFavorite.value;
    const localFavorites = readLocalFavorites(userId);
    if (nextState) localFavorites.add(questionId);
    else localFavorites.delete(questionId);
    writeLocalFavorites(userId, localFavorites);
    isFavorite.value = nextState;

    if (favoriteSource.value !== "local") {
      if (nextState) {
        const { error } = await supabase.from("favorites").insert({
          user_id: userId,
          task_type: "DI",
          question_id: questionId
        });
        if (error && !isDuplicateInsertError(error)) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      } else {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", userId)
          .eq("task_type", "DI")
          .eq("question_id", questionId);
        if (error) {
          if (isMissingFavoritesTableError(error)) favoriteSource.value = "local";
          else throw error;
        }
      }
    }

    uiStore.showToast(nextState ? "已收藏本题" : "已取消收藏", "success", 1200);
  } catch (error) {
    console.warn("DI favorite toggle failed:", error);
    uiStore.showToast("收藏操作失败，请稍后重试。", "warning");
  } finally {
    favoriteBusy.value = false;
  }
}

function stopSpeechSynthesis() {
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
}

function playModelReading() {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    uiStore.showToast("当前浏览器不支持范文朗读。", "warning");
    return;
  }
  stopSpeechSynthesis();
  const text = `${selectedTemplate.value?.sentence || ""}`.trim();
  if (!text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-AU";
  utterance.rate = 0.9;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function loadTodayStats() {
  const userId = await resolveCurrentUserId();
  if (!userId) return;

  loadingStats.value = true;
  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("score_json, created_at")
      .eq("user_id", userId)
      .eq("task_type", "DI")
      .gte("created_at", resolveStartOfTodayIso())
      .lt("created_at", resolveEndOfTodayIso())
      .order("created_at", { ascending: false });

    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    const practicedCount = rows.length;
    const totalDurationSec = rows.reduce((sum, row) => sum + resolveDurationFromScoreJson(row?.score_json), 0);
    const ratingValues = rows
      .map((row) => resolveRatingFromScoreJson(row?.score_json))
      .filter((value) => value > 0);
    const totalRating = ratingValues.reduce((sum, value) => sum + value, 0);

    summaryStats.value = {
      practicedCount,
      totalMinutes: Math.round(totalDurationSec / 60),
      averageRating: ratingValues.length ? Number((totalRating / ratingValues.length).toFixed(1)) : 0
    };
  } catch (error) {
    console.warn("DI today stats load failed:", error);
    summaryStats.value = {
      practicedCount: 0,
      totalMinutes: 0,
      averageRating: 0
    };
  } finally {
    loadingStats.value = false;
  }
}
async function persistCurrentRound({ allowSkip = false } = {}) {
  if (submittingRound.value) return false;
  const question = currentQuestion.value;
  const result = diRecorder.stopResult.value;
  if (!question || !result?.blob) {
    uiStore.showToast("请先完成录音。", "warning");
    return false;
  }

  const rating = Math.max(0, Math.min(5, Math.round(Number(selfRating.value || 0))));
  if (!allowSkip && rating <= 0) {
    uiStore.showToast("请先完成自我评分，或点击“跳过评分”。", "warning");
    return false;
  }

  const userId = await resolveCurrentUserId();
  if (!userId) {
    uiStore.showToast("登录状态失效，请重新登录。", "warning");
    return false;
  }

  submittingRound.value = true;
  try {
    const payload = {
      user_id: userId,
      task_type: "DI",
      question_id: question.id,
      transcript: "",
      score_json: {
        self_rating: rating,
        duration_sec: Math.max(0, Number(diRecorder.recordingDurationSec.value || 0)),
        image_type: question.imageType
      },
      feedback: ""
    };

    const { error } = await supabase.from("practice_logs").insert(payload);
    if (error) {
      console.warn("DI practice_logs insert failed:", error);
      uiStore.showToast("保存练习失败，请稍后重试。", "warning");
      return false;
    }

    let blobUrl = "";
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      try {
        blobUrl = URL.createObjectURL(result.blob);
      } catch {
        blobUrl = "";
      }
    }

    if (blobUrl) {
      practiceStore.pushDIRecentRecording({
        questionId: question.id,
        blobUrl,
        durationSec: Number(diRecorder.recordingDurationSec.value || 0),
        rating,
        createdAt: new Date().toISOString()
      });
    }

    latestSavedAt.value = new Date().toISOString();
    await loadTodayStats();
    return true;
  } finally {
    submittingRound.value = false;
  }
}

async function goToNextQuestion({ allowSkip = false } = {}) {
  const saved = await persistCurrentRound({ allowSkip });
  if (!saved) return;

  if (currentQuestionIndex.value >= sessionQuestions.value.length - 1) {
    await buildSession(selectedImageType.value);
    return;
  }

  currentQuestionIndex.value += 1;
  await applyQuestionState();
}

async function handleBackHome() {
  stopSpeechSynthesis();
  router.push("/home");
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }

  syncTemplateCarryFromRoute();
  await loadQuestions();
  await initializeSessionFromRoute();
  await loadTodayStats();
});

watch(
  () => route.query?.tb,
  () => {
    syncTemplateCarryFromRoute();
    const appliedCarriedTemplate = applyCarriedTemplateForCurrentQuestion();
    if (!appliedCarriedTemplate && !selectedTemplateId.value) {
      chooseRandomTemplate();
    }
  }
);

onUnmounted(() => {
  stopSpeechSynthesis();
});
</script>

<template>
  <div class="min-h-screen bg-[#F0F4F8] text-[#1E293B] di-font">
    <header class="bg-[#1B3A6B] px-4 py-3 text-white">
      <div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
        <div class="min-w-0">
          <button
            type="button"
            class="mb-1 inline-flex items-center gap-1 text-sm text-white/90 transition-opacity hover:opacity-80"
            @click="handleBackHome"
          >
            <span>← 返回</span>
          </button>
          <h1 class="truncate text-lg font-bold">DI 图表描述</h1>
          <p class="text-xs text-white/70">第 {{ currentQuestionIndex + 1 }} 题 / 共 {{ sessionQuestions.length || SESSION_TOTAL }} 题</p>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <span
              v-for="dot in progressDots"
              :key="dot"
              class="h-2 w-2 rounded-full border border-white/60"
              :class="dot < currentQuestionIndex ? 'border-[#E8845A] bg-[#E8845A]' : dot === currentQuestionIndex ? 'border-white bg-white' : 'bg-transparent'"
            />
          </div>

          <button
            type="button"
            class="rounded-full border border-white/30 px-3 py-1.5 text-xs text-white/90 transition-colors hover:bg-white/10"
            :disabled="favoriteBusy || !currentQuestion"
            @click="toggleFavorite"
          >
            <span :class="isFavorite ? 'text-[#FFD166]' : 'text-white/70'">{{ isFavorite ? "♥" : "♡" }}</span>
            收藏
          </button>

          <button
            type="button"
            class="rounded-full border border-white/30 px-3 py-1.5 text-xs text-white/90 transition-colors hover:bg-white/10"
            :disabled="!sessionQuestions.length"
            @click="activateRandomQuestion"
          >
            随机
          </button>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl px-4 py-4">
      <section class="mb-4 overflow-x-auto">
        <div class="inline-flex min-w-full gap-2">
          <button
            v-for="item in DI_IMAGE_TYPE_FILTERS"
            :key="item.id"
            type="button"
            class="rounded-[20px] px-4 py-2 text-sm font-semibold transition-colors"
            :class="selectedImageType === item.id ? 'bg-[#1B3A6B] text-white' : 'bg-white text-[#1B3A6B] border border-[#E8EDF5]'"
            @click="switchImageType(item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </section>

      <div v-if="loadingQuestions" class="rounded-[14px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#8CA0C0]">
        DI 题库加载中...
      </div>
      <div v-else-if="!currentQuestion" class="rounded-[14px] border border-[#E8EDF5] bg-white p-8 text-center text-sm text-[#8CA0C0]">
        当前没有可用 DI 题目，请先在 Supabase `questions` 表添加 `task_type = DI` 的题目。
      </div>

      <template v-else>
        <section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-[#8CA0C0]">{{ currentQuestion.id || "DI-UNK" }} · {{ currentQuestion.topic || "Mixed" }}</p>
              <span class="rounded-full px-2 py-0.5 text-xs font-semibold" :class="currentImageMeta.badgeClass">{{ currentImageMeta.label }}</span>
            </div>

            <div class="mb-3 flex h-[190px] items-center justify-center overflow-hidden rounded-[10px] bg-[#F4F7FB]">
              <img
                v-if="currentQuestion.imageUrl"
                :src="currentQuestion.imageUrl"
                :alt="currentQuestion.topic || currentQuestion.id"
                class="h-full w-full object-contain"
              />
              <p v-else class="px-4 text-center text-xs text-[#8CA0C0]">当前题目缺少 image_url，请在题库补充图片地址。</p>
            </div>

            <div class="mb-3 grid grid-cols-3 rounded-[11px] bg-[#F8FAFD] p-1 text-center text-xs">
              <div
                v-for="(stage, stageIndex) in stageItems"
                :key="stage.key"
                class="rounded-[9px] px-2 py-1.5"
                :class="stageIndex === currentStageIndex ? 'bg-white text-[#1B3A6B] shadow-sm font-semibold' : 'text-[#8CA0C0]'"
              >
                {{ stage.label }}
              </div>
            </div>

            <div class="mb-4">
              <div class="mb-1 flex items-center justify-between text-xs text-[#8CA0C0]">
                <span>{{ recorderTimerLabel }}</span>
                <span class="text-base font-bold text-[#1B3A6B]">{{ recorderTimerRemaining }}</span>
              </div>
              <div class="h-2 rounded-full bg-[#E8EDF5]">
                <div class="h-2 rounded-full bg-[#1B3A6B] transition-all duration-300" :style="{ width: `${recorderTimerProgress}%` }" />
              </div>
            </div>
            <div v-if="recorderPhase === 'prepare'" class="space-y-2">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  class="w-full rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  :disabled="!canSkipPrepare"
                  @click="startRecordingNow"
                >
                  跳过准备，立即录音
                </button>
                <button
                  type="button"
                  class="w-full rounded-[11px] border border-[#1B3A6B] bg-white px-4 py-3 text-sm font-semibold text-[#1B3A6B] transition-colors hover:bg-[#F4F7FB]"
                  :disabled="!canSkipPrepare"
                  @click="jumpToNextQuestionFromPrepare"
                >
                  下一题 →
                </button>
              </div>
              <p class="text-center text-xs text-[#8CA0C0]">准备阶段会在 25 秒后自动进入录音。</p>
              <p v-if="recorderErrorText" class="text-center text-xs text-red-500">{{ recorderErrorText }}</p>
            </div>

            <div v-else-if="recorderPhase === 'recording'" class="space-y-2">
              <button
                type="button"
                class="wave-btn w-full rounded-[11px] bg-[#1B3A6B] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                :disabled="!canFinishRecording"
                @click="diRecorder.stopRecordingPhase({ reason: 'manual_end' })"
              >
                <span class="wave-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </span>
                正在录音，点击结束
              </button>
              <p class="text-center text-xs text-[#8CA0C0]">录音阶段会在 40 秒后自动结束。</p>
            </div>

            <div v-else-if="recorderPhase === 'processing'" class="space-y-2">
              <button
                type="button"
                class="w-full rounded-[11px] bg-[#1B3A6B] px-4 py-3 text-sm font-semibold text-white opacity-80"
                disabled
              >
                正在结束录音...
              </button>
              <p class="text-center text-xs text-[#8CA0C0]">请稍候，正在整理音频。</p>
            </div>

            <div v-else class="space-y-3">
              <audio
                class="w-full"
                controls
                :src="recorderPreviewUrl"
                @timeupdate="onPlaybackTimeUpdate"
                @loadedmetadata="onPlaybackLoadedMetadata"
              />
              <p class="text-right text-xs text-[#8CA0C0]">{{ playbackTimeLabel }}</p>

              <div>
                <p class="mb-2 text-sm font-semibold text-[#1B3A6B]">自我评分</p>
                <div class="mb-2 flex items-center gap-1">
                  <button
                    v-for="star in 5"
                    :key="star"
                    type="button"
                    class="text-2xl leading-none transition-colors"
                    :class="star <= selfRating ? 'text-[#FFD166]' : 'text-[#D7DEE9]'"
                    @click="selfRating = star"
                  >
                    ★
                  </button>
                </div>
                <p class="text-xs text-[#8CA0C0]">{{ ratingCopy }}</p>
              </div>

              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="flex-1 rounded-[11px] bg-[#E8845A] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  :disabled="!canGoNext || submittingRound"
                  @click="goToNextQuestion()"
                >
                  {{ submittingRound ? "保存中..." : "下一题 →" }}
                </button>
                <button
                  type="button"
                  class="rounded-[11px] border border-[#E8EDF5] px-3 py-3 text-xs text-[#8CA0C0] transition-colors hover:text-[#1B3A6B]"
                  :disabled="submittingRound"
                  @click="goToNextQuestion({ allowSkip: true })"
                >
                  跳过评分
                </button>
              </div>

              <p v-if="latestSavedAt" class="text-right text-xs text-[#8CA0C0]">已保存：{{ formatDateTime(latestSavedAt) }}</p>
            </div>
          </article>

          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <div class="mb-3 flex items-end justify-between gap-2 border-b border-[#E8EDF5] pb-2">
              <div>
                <h2 class="text-base font-bold text-[#1B3A6B]">{{ currentImageMeta.label }}模板</h2>
                <p class="text-xs text-[#8CA0C0]">仅使用你提供的 30 条 DI 模板 · 当前 {{ templateCountLabel }} 条可选</p>
              </div>
              <div class="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  class="pb-1"
                  :class="activeTab === 'structure' ? 'border-b-2 border-[#E8845A] text-[#E8845A]' : 'text-[#8CA0C0]'"
                  @click="activeTab = 'structure'"
                >
                  结构
                </button>
                <button
                  type="button"
                  class="pb-1"
                  :class="activeTab === 'phrases' ? 'border-b-2 border-[#E8845A] text-[#E8845A]' : 'text-[#8CA0C0]'"
                  @click="activeTab = 'phrases'"
                >
                  句型
                </button>
                <button
                  type="button"
                  class="pb-1"
                  :class="activeTab === 'tips' ? 'border-b-2 border-[#E8845A] text-[#E8845A]' : 'text-[#8CA0C0]'"
                  @click="activeTab = 'tips'"
                >
                  要点
                </button>
              </div>
            </div>

            <div class="mb-3 flex items-center gap-2">
              <button
                type="button"
                class="rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:bg-[#F4F7FB]"
                :class="templateMode === 'random'
                  ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white hover:bg-[#16335E] hover:text-white'
                  : 'border-[#E8EDF5] bg-white text-[#1B3A6B] hover:text-[#1B3A6B] hover:border-[#C9D4E5]'"
                @click="chooseRandomTemplate"
              >
                随机模板
              </button>
              <button
                type="button"
                class="rounded-[10px] border px-3 py-1.5 text-xs transition-colors hover:bg-[#F4F7FB]"
                :class="templateMode === 'manual'
                  ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white hover:bg-[#16335E] hover:text-white'
                  : 'border-[#E8EDF5] bg-white text-[#1B3A6B] hover:text-[#1B3A6B] hover:border-[#C9D4E5]'"
                @click="toggleTemplatePicker"
              >
                选择模板
              </button>
            </div>

            <div v-if="templatePickerOpen" class="mb-3 rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-2">
              <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  v-for="item in templateCandidates"
                  :key="item.id"
                  type="button"
                  class="rounded-[9px] border px-2 py-2 text-left text-xs transition-colors"
                  :class="selectedTemplate?.id === item.id ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white' : 'border-[#E8EDF5] bg-white text-[#1B3A6B]'"
                  @click="selectTemplate(item.id)"
                >
                  <p class="font-semibold">{{ item.shortLabel || item.title || item.id }}</p>
                  <p class="mt-1 opacity-80">{{ item.id }}</p>
                </button>
              </div>
            </div>

            <div v-if="!selectedTemplate" class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3 text-xs text-[#8CA0C0]">
              当前题型暂无可用模板。
            </div>

            <template v-else>
              <div v-if="activeTab === 'structure'" class="space-y-3">
                <button
                  type="button"
                  class="w-full rounded-[11px] bg-[#F4F7FB] px-3 py-2 text-left"
                  @click="playModelReading"
                >
                  <p class="text-xs text-[#8CA0C0]">模板朗读 · Native · en-AU</p>
                  <p class="mt-1 text-sm text-[#1B3A6B]">{{ selectedTemplate.sentence }}</p>
                </button>

                <div class="rounded-[11px] bg-[#F8FAFD] p-3">
                  <p class="text-xs text-[#8CA0C0]">当前模板</p>
                  <p class="mt-1 text-sm font-semibold text-[#1B3A6B]">{{ selectedTemplate.shortLabel || selectedTemplate.title || selectedTemplate.id }}</p>
                  <p class="mt-1 text-xs text-[#8CA0C0]">{{ selectedTemplate.id }} · {{ selectedTemplate.categoryLabel || selectedTemplate.categoryKey }}</p>
                </div>

                <div v-if="selectedTemplate.exampleFilled" class="rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFFDFC] px-3 py-2 text-sm leading-relaxed text-[#334155]">
                  {{ selectedTemplate.exampleFilled }}
                </div>
              </div>

              <div v-else-if="activeTab === 'phrases'" class="space-y-3">
                <div>
                  <p class="mb-2 text-xs font-semibold text-[#8CA0C0]">模板槽位</p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="slot in selectedTemplate.slots"
                      :key="slot"
                      type="button"
                      class="rounded-[20px] border px-3 py-1.5 text-xs transition-colors"
                      :class="isPhraseUsed(slot) ? 'border-[#1B3A6B] bg-[#1B3A6B] text-white' : 'border-[#E8EDF5] bg-white text-[#1B3A6B]'"
                      @click="togglePhraseUsage(slot)"
                    >
                      {{ slot }}
                    </button>
                  </div>
                </div>

                <div>
                  <p class="mb-2 text-xs font-semibold text-[#8CA0C0]">关键词</p>
                  <div class="flex flex-wrap gap-2">
                    <span
                      v-for="keyword in selectedTemplate.keywords"
                      :key="keyword"
                      class="rounded-[20px] border border-[#E8EDF5] bg-white px-3 py-1.5 text-xs text-[#1B3A6B]"
                    >
                      {{ keyword }}
                    </span>
                  </div>
                </div>
              </div>

              <div v-else class="space-y-2">
                <article
                  v-if="selectedTemplate.fillTips"
                  class="rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFFDFC] px-3 py-2"
                >
                  <p class="text-sm font-semibold text-[#1B3A6B]">填充提示</p>
                  <p class="mt-1 text-xs text-[#64748B]">{{ selectedTemplate.fillTips }}</p>
                </article>

                <article
                  v-if="selectedTemplate.notes"
                  class="rounded-[11px] border-l-4 border-[#E8845A] bg-[#FFFDFC] px-3 py-2"
                >
                  <p class="text-sm font-semibold text-[#1B3A6B]">备注</p>
                  <p class="mt-1 text-xs text-[#64748B]">{{ selectedTemplate.notes }}</p>
                </article>

                <article class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] px-3 py-2">
                  <p class="text-sm font-semibold text-[#1B3A6B]">适用题型</p>
                  <p class="mt-1 text-xs text-[#64748B]">{{ selectedTemplate.imageTypes.join(" / ") }}</p>
                </article>
              </div>
            </template>
          </article>
        </section>
        <section class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <p class="mb-3 text-sm font-semibold text-[#1B3A6B]">📊 今日练习</p>
            <div v-if="loadingStats" class="text-xs text-[#8CA0C0]">统计加载中...</div>
            <div v-else class="grid grid-cols-3 gap-2">
              <div class="rounded-[11px] bg-[#F4F7FB] p-3 text-center">
                <p class="text-2xl font-bold text-[#1B3A6B]">{{ summaryStats.practicedCount }}</p>
                <p class="text-xs text-[#8CA0C0]">已练题数</p>
              </div>
              <div class="rounded-[11px] bg-[#F4F7FB] p-3 text-center">
                <p class="text-2xl font-bold text-[#1B3A6B]">{{ summaryStats.totalMinutes }}</p>
                <p class="text-xs text-[#8CA0C0]">分钟</p>
              </div>
              <div class="rounded-[11px] bg-[#F4F7FB] p-3 text-center">
                <p class="text-2xl font-bold text-[#1B3A6B]">{{ summaryStats.averageRating.toFixed(1) }}</p>
                <p class="text-xs text-[#8CA0C0]">平均评分</p>
              </div>
            </div>
          </article>

          <article class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
            <p class="mb-3 text-sm font-semibold text-[#1B3A6B]">💡 历史录音</p>
            <div v-if="recentRecordings.length" class="space-y-2">
              <div
                v-for="record in recentRecordings"
                :key="record.id"
                class="rounded-[11px] bg-[#F4F7FB] p-2"
              >
                <div class="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    class="rounded-full bg-[#1B3A6B] px-3 py-1 text-xs text-white"
                    @click="playHistoryRecord(record)"
                  >
                    ▶ 播放
                  </button>
                  <p class="text-xs text-[#8CA0C0]">{{ formatSeconds(record.durationSec) }}</p>
                </div>
                <p class="mt-1 text-xs text-[#8CA0C0]">{{ formatDateTime(record.createdAt) }}</p>
                <p class="mt-1 text-sm text-[#FFD166]">
                  <span v-for="star in 5" :key="`${record.id}-${star}`">{{ star <= record.rating ? "★" : "☆" }}</span>
                </p>
                <audio
                  :ref="(el) => bindHistoryAudioRef(record.id, el)"
                  class="hidden"
                  preload="metadata"
                  :src="record.blobUrl"
                />
              </div>
            </div>
            <p v-else class="text-xs text-[#8CA0C0]">暂无历史录音，完成一题后会出现在这里。</p>
          </article>
        </section>

        <section class="mt-4 rounded-[14px] border border-[#E8EDF5] bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between gap-2">
            <p class="text-sm font-semibold text-[#1B3A6B]">📚 本题高频词汇</p>
            <p class="text-xs text-[#8CA0C0]">{{ questionHighFrequencyWords.length }} 个词</p>
          </div>

          <div v-if="questionHighFrequencyWords.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <article
              v-for="(word, index) in questionHighFrequencyWords"
              :key="`${word.word}-${index}`"
              class="rounded-[11px] border border-[#E8EDF5] bg-[#F8FAFD] p-3"
            >
              <div class="flex items-baseline gap-2">
                <p class="text-sm font-semibold text-[#1B3A6B]">{{ word.word }}</p>
                <span v-if="word.partOfSpeech" class="text-xs text-[#8CA0C0]">{{ word.partOfSpeech }}</span>
              </div>
              <p v-if="word.chinese" class="mt-1 text-xs text-[#475569]">{{ word.chinese }}</p>
              <p v-if="word.note" class="mt-1 text-xs text-[#64748B]">{{ word.note }}</p>
              <p v-if="word.example" class="mt-1 text-xs italic text-[#8CA0C0]">{{ word.example }}</p>
            </article>
          </div>
          <p v-else class="text-xs text-[#8CA0C0]">当前题目暂无词汇数据。</p>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.di-font {
  font-family: "DM Sans", -apple-system, "PingFang SC", sans-serif;
}

.wave-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.wave-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  height: 12px;
}

.wave-bars span {
  width: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.8);
  animation: wave 1.1s ease-in-out infinite;
}

.wave-bars span:nth-child(1) {
  animation-delay: 0s;
}

.wave-bars span:nth-child(2) {
  animation-delay: 0.14s;
}

.wave-bars span:nth-child(3) {
  animation-delay: 0.28s;
}

.wave-bars span:nth-child(4) {
  animation-delay: 0.42s;
}

@keyframes wave {
  0%,
  100% {
    height: 4px;
    opacity: 0.55;
  }
  50% {
    height: 12px;
    opacity: 1;
  }
}
</style>

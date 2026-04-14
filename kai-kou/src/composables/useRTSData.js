import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { RTS_FALLBACK_QUESTIONS } from "@/data/rtsFallbackQuestions";

const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
const RTS_AUDIO_BUCKET = "question-audio";
const RTS_AUDIO_FOLDER = "rts";

const TONE_LABEL_MAP = {
  formal: "正式语气",
  informal: "非正式语气",
  "semi-formal": "半正式语气"
};

export const RTS_TOPIC_META = {
  work: {
    key: "work",
    label: "学业事务",
    shortLabel: "学业",
    tag: "Academic",
    emoji: "🎓",
    badgeClass: "bg-[#E1F5EE] text-[#085041]"
  },
  daily: {
    key: "daily",
    label: "日常安排",
    shortLabel: "日常",
    tag: "Daily",
    emoji: "🏡",
    badgeClass: "bg-[#EEF2FF] text-[#2F3C8F]"
  },
  service: {
    key: "service",
    label: "服务沟通",
    shortLabel: "服务",
    tag: "Service",
    emoji: "🛎️",
    badgeClass: "bg-[#FAEEDA] text-[#633806]"
  },
  social: {
    key: "social",
    label: "社交协作",
    shortLabel: "社交",
    tag: "Social",
    emoji: "🤝",
    badgeClass: "bg-[#EEEDFE] text-[#3C3489]"
  }
};

const RTS_TOPIC_ORDER = ["work", "daily", "service", "social"];

const MOCK_RTS_QUESTIONS = RTS_FALLBACK_QUESTIONS;

let cachedQuestions = null;
let cachedSource = "mock";

function toObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function toSafeString(value) {
  return `${value || ""}`.trim();
}

function toSafeArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => `${item || ""}`.trim()).filter(Boolean);
}

function parseJsonLike(value) {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return toObject(value);
}

function normalizeTopic(value) {
  const normalized = toSafeString(value).toLowerCase();
  if (RTS_TOPIC_META[normalized]) return normalized;
  return "daily";
}

function normalizeTone(value) {
  const normalized = toSafeString(value).toLowerCase();
  if (normalized === "formal" || normalized === "informal" || normalized === "semi-formal") return normalized;
  return "semi-formal";
}

function normalizeDirections(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const source = toObject(item) || {};
      return {
        head: toSafeString(source.head),
        body: toSafeString(source.body),
        eg: toSafeString(source.eg)
      };
    })
    .filter((item) => item.head || item.body || item.eg)
    .slice(0, 3);
}

function normalizePhrases(value) {
  const source = toObject(value) || {};
  return {
    opening: toSafeArray(source.opening),
    request: toSafeArray(source.request),
    closing: toSafeArray(source.closing)
  };
}

function normalizeKeyPoints(value) {
  const source = parseJsonLike(value) || {};
  const tone = normalizeTone(source.tone);
  const directions = normalizeDirections(source.directions);
  return {
    role: toSafeString(source.role),
    tone,
    toneLabel: toSafeString(source.toneLabel) || TONE_LABEL_MAP[tone],
    directions,
    templateOpener: toSafeString(source.templateOpener),
    templateFull: toSafeString(source.templateFull),
    phrases: normalizePhrases(source.phrases),
    tips: toSafeArray(source.tips).slice(0, 8)
  };
}

function normalizeDifficulty(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(3, Math.round(number)));
}

function buildRTSAudioPath(questionId) {
  const normalizedId = toSafeString(questionId);
  if (!normalizedId) return "";
  return `${RTS_AUDIO_FOLDER}/${normalizedId}.mp3`;
}

function buildRTSAudioUrl(questionId) {
  const storagePath = buildRTSAudioPath(questionId);
  if (!storagePath || !hasSupabaseConfig) return "";

  try {
    const { data } = supabase.storage.from(RTS_AUDIO_BUCKET).getPublicUrl(storagePath);
    return toSafeString(data?.publicUrl);
  } catch (error) {
    console.warn("RTS audio url resolve failed:", error, { questionId: toSafeString(questionId), storagePath });
    return "";
  }
}

function normalizeQuestion(raw, index = 0) {
  const source = toObject(raw) || {};
  const id = toSafeString(source.id) || `RTS_MOCK_${index + 1}`;
  const content = toSafeString(source.content);
  const topic = normalizeTopic(source.topic);
  const audioPath = buildRTSAudioPath(id);
  const audioUrl = buildRTSAudioUrl(id);
  return {
    id,
    task_type: "RTS",
    taskType: "RTS",
    content,
    audio_path: audioPath,
    audio_url: audioUrl,
    topic,
    key_points: normalizeKeyPoints(source.key_points),
    difficulty: normalizeDifficulty(source.difficulty),
    is_active: source.is_active !== false
  };
}

function getMockQuestions() {
  return MOCK_RTS_QUESTIONS.map((item, index) => normalizeQuestion(item, index));
}

function resolveQuestionSummary(content, maxLength = 82) {
  const normalized = toSafeString(content).replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function parseScoreJson(rawValue) {
  const parsed = parseJsonLike(rawValue);
  return toObject(parsed) || {};
}

function resolveSelfRating(scoreJson) {
  const value = Number(scoreJson?.self_rating);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(5, Math.round(value)));
}

function resolveDurationSec(scoreJson) {
  const direct = Number(scoreJson?.duration_sec);
  if (Number.isFinite(direct) && direct >= 0) return Math.round(direct);
  return 0;
}

function resolveDateKey(dateValue) {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildQuestionMap(list) {
  const map = new Map();
  list.forEach((item) => {
    map.set(item.id, item);
  });
  return map;
}

function buildRecentLogs(logRows, questionMap, limit = 3) {
  return logRows.slice(0, limit).map((row) => {
    const scoreJson = parseScoreJson(row?.score_json);
    const questionId = toSafeString(row?.question_id);
    const matched = questionMap.get(questionId) || null;
    const content = toSafeString(matched?.content || row?.transcript || "");
    const topic = normalizeTopic(matched?.topic || "daily");
    return {
      id: `${row?.id || ""}`.trim(),
      questionId,
      topic,
      summary: resolveQuestionSummary(content),
      rating: resolveSelfRating(scoreJson),
      durationSec: resolveDurationSec(scoreJson),
      createdAt: toSafeString(row?.created_at)
    };
  });
}

function buildQuestionPracticeCountMap(logRows) {
  return logRows.reduce((acc, row) => {
    const key = toSafeString(row?.question_id);
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function fetchUserLogs(userId, limit = 300) {
  const normalizedUserId = toSafeString(userId);
  if (!normalizedUserId) return [];

  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, question_id, score_json, transcript, created_at")
      .eq("user_id", normalizedUserId)
      .eq("task_type", "RTS")
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(1000, Number(limit || 300))));

    if (error) {
      console.warn("RTS logs load failed:", error);
      return [];
    }

    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn("RTS logs load failed:", error);
    return [];
  }
}

export function useRTSData() {
  const questions = ref([]);
  const loading = ref(false);
  const dataSource = ref("mock");

  async function loadQuestions({ force = false } = {}) {
    if (!force && Array.isArray(cachedQuestions) && cachedQuestions.length) {
      questions.value = cachedQuestions;
      dataSource.value = cachedSource;
      return cachedQuestions;
    }

    loading.value = true;
    try {
      const fallback = getMockQuestions();
      cachedQuestions = fallback;
      cachedSource = "mock";
      questions.value = fallback;
      dataSource.value = "mock";
      return fallback;
    } finally {
      loading.value = false;
    }
  }

  async function getQuestionById(questionId) {
    const normalizedId = toSafeString(questionId);
    if (!normalizedId) return null;
    const list = await loadQuestions();
    return list.find((item) => item.id === normalizedId) || null;
  }

  async function getRandomQuestion(excludedId = "") {
    const list = await loadQuestions();
    if (!list.length) return null;
    const normalizedExcludedId = toSafeString(excludedId);
    const pool = list.filter((item) => item.id !== normalizedExcludedId);
    const candidates = pool.length ? pool : list;
    return candidates[Math.floor(Math.random() * candidates.length)] || null;
  }

  function getTopicStats(sourceList = questions.value) {
    const list = Array.isArray(sourceList) ? sourceList : [];
    return RTS_TOPIC_ORDER.map((topicKey) => {
      const topicMeta = RTS_TOPIC_META[topicKey];
      const count = list.filter((item) => item.topic === topicKey).length;
      return {
        ...topicMeta,
        count
      };
    });
  }

  async function getUserRTSStats(userId, { recentLimit = 3, logsLimit = 300 } = {}) {
    const list = await loadQuestions();
    const questionMap = buildQuestionMap(list);
    const logs = await fetchUserLogs(userId, logsLimit);
    const nowDateKey = resolveDateKey(new Date().toISOString());
    const todayLogs = logs.filter((item) => resolveDateKey(item?.created_at) === nowDateKey);
    const ratingValues = logs
      .map((item) => resolveSelfRating(parseScoreJson(item?.score_json)))
      .filter((rating) => rating > 0);
    const todayDurationSec = todayLogs.reduce((sum, item) => sum + resolveDurationSec(parseScoreJson(item?.score_json)), 0);

    return {
      todayPracticed: todayLogs.length,
      todayMinutes: Math.round(todayDurationSec / 60),
      averageRating: ratingValues.length
        ? Number((ratingValues.reduce((sum, rating) => sum + rating, 0) / ratingValues.length).toFixed(1))
        : 0,
      totalQuestions: list.length,
      recentLogs: buildRecentLogs(logs, questionMap, recentLimit),
      questionPracticeCountMap: buildQuestionPracticeCountMap(logs)
    };
  }

  return {
    questions,
    loading,
    dataSource,
    loadQuestions,
    getQuestionById,
    getRandomQuestion,
    getTopicStats,
    getUserRTSStats,
    resolveQuestionSummary
  };
}

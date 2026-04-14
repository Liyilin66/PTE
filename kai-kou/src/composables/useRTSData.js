import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { RTS_FALLBACK_QUESTIONS } from "@/data/rtsFallbackQuestions";

const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

const RTS_AUDIO_BUCKET = "question-audio";
const RTS_AUDIO_FOLDER = "rts";
const DYNAMIC_TEMPLATE_CACHE_KEY = "RTS_DYNAMIC_TEMPLATE_CACHE_V3";
const DYNAMIC_TEMPLATE_PREFIX = "Hi, [name], sorry to bother you.";

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
    emoji: "📗",
    badgeClass: "bg-[#E1F5EE] text-[#085041]"
  },
  daily: {
    key: "daily",
    label: "日常安排",
    shortLabel: "日常",
    tag: "Daily",
    emoji: "🗓",
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

const FORMAL_HINTS = [
  "professor",
  "teacher",
  "tutor",
  "lecturer",
  "librarian",
  "manager",
  "officer",
  "inspector",
  "staff",
  "accommodation",
  "maintenance"
];

const INFORMAL_HINTS = [
  "friend",
  "classmate",
  "roommate",
  "flatmate",
  "neighbor",
  "wife",
  "tom",
  "lisa",
  "sam",
  "guys"
];

const EN_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "to",
  "of",
  "for",
  "from",
  "in",
  "on",
  "at",
  "by",
  "with",
  "without",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "done",
  "can",
  "could",
  "would",
  "should",
  "will",
  "shall",
  "may",
  "might",
  "must",
  "have",
  "has",
  "had",
  "i",
  "you",
  "your",
  "yours",
  "my",
  "me",
  "we",
  "our",
  "ours",
  "he",
  "she",
  "they",
  "them",
  "it",
  "this",
  "that",
  "these",
  "those",
  "there",
  "here",
  "just",
  "very",
  "really",
  "about",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "how",
  "into",
  "also",
  "still",
  "much",
  "more",
  "most",
  "some",
  "any",
  "all",
  "few",
  "many",
  "lot"
]);

let cachedQuestions = null;
let cachedSource = "mock";
let dynamicTemplateCache = null;

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

function normalizeWhitespace(text) {
  return toSafeString(text).replace(/\s+/g, " ");
}

function toLower(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function sentenceCase(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return "";
  return normalized.replace(/(^|[.!?]\s+)([a-z])/g, (matched, lead, ch) => `${lead}${ch.toUpperCase()}`);
}

function polishGeneratedEnglish(text) {
  return sentenceCase(text)
    .replace(/\bfollow the schedule to complete housework\b/gi, "follow the cleaning schedule")
    .replace(/\bfor making this call\b/gi, "for this call");
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

function splitSentences(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];
  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function ensureSentence(text) {
  const normalized = polishGeneratedEnglish(text);
  if (!normalized) return "";
  if (/[.!?]$/.test(normalized)) return normalized;
  return `${normalized}.`;
}

function truncateWords(text, maxWords = 20) {
  const words = normalizeWhitespace(text).split(" ").filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}

function uniqueList(list, limit = 4) {
  const seen = new Set();
  const output = [];
  for (const item of list) {
    const normalized = normalizeWhitespace(item).replace(/[,.!?;:\-\s]+$/, "");
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function stripQuestionTail(content) {
  return normalizeWhitespace(content)
    .replace(/\s*what would you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what should you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what will you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what do you say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what are you going to say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how would you(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how do you(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what would i say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what should i say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*what do i say(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how would i(?:[^.?!]*)?\??\s*$/i, "")
    .replace(/\s*how do i(?:[^.?!]*)?\??\s*$/i, "")
    .trim();
}

function toFirstPersonNarration(text) {
  return normalizeWhitespace(text)
    .replace(/\b[Yy]ou are\b/g, "I am")
    .replace(/\b[Yy]ou were\b/g, "I was")
    .replace(/\b[Yy]ou have\b/g, "I have")
    .replace(/\b[Yy]ou\'ve\b/g, "I've")
    .replace(/\b[Yy]ou\'re\b/g, "I'm")
    .replace(/\b[Yy]our\b/g, "my")
    .replace(/\b[Yy]ou\b/g, "I")
    .replace(/\b[Ii]\s+decide to\b/g, "I decide to")
    .replace(/\b[Ii]\s+want to\s+ask\b/g, "I want to ask")
    .replace(/\b[Ii]\s+need to\s+call\b/g, "I need to call")
    .replace(/^i\b/, "I");
}

function isInstructionSentence(text) {
  const lower = toLower(text);
  return /what would (you|i) say|what should (you|i) say|what will (you|i) say|what do (you|i) say|what are (you|i) going to say|how would (you|i)|how do (you|i)|what should you say to|how do you ask|how would you explain/.test(lower);
}

function cleanScenarioLines(lines = []) {
  return lines
    .map((line) => polishGeneratedEnglish(line))
    .filter(Boolean)
    .filter((line) => !isInstructionSentence(line));
}

function inferAudience(content, fallbackRole = "") {
  const combined = `${toLower(content)} ${toLower(fallbackRole)}`;
  if (combined.includes("professor") || combined.includes("teacher") || combined.includes("tutor") || combined.includes("lecturer")) return "your professor or teacher";
  if (combined.includes("librarian") || combined.includes("library staff")) return "library staff";
  if (combined.includes("manager") || combined.includes("officer") || combined.includes("inspector") || combined.includes("maintenance team")) return "the relevant staff member";
  if (combined.includes("roommate") || combined.includes("flatmate") || combined.includes("neighbor")) return "your roommate or neighbor";
  if (combined.includes("friend") || combined.includes("classmate")) return "your friend or classmate";
  return "the other person";
}

function inferTone(content, topic, fallbackTone = "") {
  const explicit = normalizeTone(fallbackTone);
  if (explicit !== "semi-formal") return explicit;

  const lower = toLower(content);
  if (FORMAL_HINTS.some((item) => lower.includes(item)) || topic === "service") return "formal";
  if (INFORMAL_HINTS.some((item) => lower.includes(item)) || topic === "social") return "informal";
  return "semi-formal";
}

function extractKeywords(content, limit = 6) {
  const words = (normalizeWhitespace(content).toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) || [])
    .filter((word) => !EN_STOPWORDS.has(word));
  return uniqueList(words, limit);
}

function extractRequestAction(content, scenarioLines = []) {
  const source = normalizeWhitespace(content);
  const patterns = [
    /\byou need to\s+([^.!?]+)/i,
    /\byou want to\s+([^.!?]+)/i,
    /\byou should\s+([^.!?]+)/i,
    /\byou decide to\s+([^.!?]+)/i,
    /\byou are planning to\s+([^.!?]+)/i,
    /\byou are interested in\s+([^.!?]+)/i
  ];

  for (const pattern of patterns) {
    const matched = source.match(pattern);
    if (!matched?.[1]) continue;
    const action = toFirstPersonNarration(matched[1]).replace(/^I\s+/i, "");
    if (!action) continue;
    return `Could you please ${action}?`;
  }

  const fromScenario = scenarioLines.find((item) => /\b(need|want|ask|report|request|suggest|borrow|return|help|change|invite|apologize)\b/i.test(item));
  if (fromScenario) {
    const cleaned = toFirstPersonNarration(fromScenario)
      .replace(/^I\s+(need|want)\s+to\s+/i, "")
      .replace(/^I\s+/i, "");
    if (cleaned) return `Could you please ${cleaned}?`;
  }

  return "Could you please help me with this situation?";
}

function buildTemplateFromQuestion(content, tone) {
  const scenarioText = stripQuestionTail(content);
  const firstPersonText = toFirstPersonNarration(scenarioText);
  const scenarioLines = cleanScenarioLines(splitSentences(firstPersonText));

  const fallbackOpening = {
    formal: "Hello, I am calling to explain my situation.",
    informal: "Hi, I want to talk to you about something.",
    "semi-formal": "Hi, I need to explain this situation."
  };

  const baseOpener = ensureSentence(scenarioLines[0] || fallbackOpening[tone] || fallbackOpening["semi-formal"]);
  const opener = ensureSentence(`${ensureSentence(DYNAMIC_TEMPLATE_PREFIX)} ${baseOpener}`.trim());
  const detail = ensureSentence(scenarioLines[1] || scenarioLines[0] || "I want to explain this clearly so we can solve it quickly.");
  const request = ensureSentence(extractRequestAction(content, scenarioLines));

  const closing = tone === "formal"
    ? "Thank you for your understanding and support."
    : tone === "informal"
      ? "Thanks for understanding and helping me out."
      : "Thank you for understanding and helping me with this.";

  const full = [
    opener,
    detail,
    request,
    closing
  ]
    .map((line) => ensureSentence(truncateWords(line, 28)))
    .filter(Boolean)
    .join(" ");

  return {
    opener,
    full,
    scenarioLines
  };
}

function buildDynamicPhrases(templatePayload, fallbackPhrases = {}) {
  const sentences = splitSentences(templatePayload.full);
  const requestLike = sentences.filter((item) => /\b(could|would|can|please|may)\b/i.test(item));
  const closingLike = sentences.filter((item) => /\b(thank|thanks|appreciate|sorry|promise)\b/i.test(item));

  return {
    opening: uniqueList([
      templatePayload.opener,
      sentences[0],
      ...(fallbackPhrases.opening || [])
    ], 4),
    request: uniqueList([
      ...requestLike,
      ...(fallbackPhrases.request || []),
      sentences[1],
      sentences[2]
    ], 4),
    closing: uniqueList([
      ...closingLike,
      ...(fallbackPhrases.closing || []),
      sentences[sentences.length - 1]
    ], 4)
  };
}

function buildDynamicDirections(content, templatePayload, fallbackDirections = []) {
  const scenarioSnippet = truncateWords(templatePayload.scenarioLines[0] || stripQuestionTail(content), 18);
  const requestSentence = splitSentences(templatePayload.full).find((item) => /\b(could|would|can|please|may)\b/i.test(item)) || "Could you please help me with this situation?";

  const generated = [
    {
      head: "先复述题目情景",
      body: `直接用题目关键词说明场景：${scenarioSnippet}。`,
      eg: ensureSentence(truncateWords(templatePayload.opener, 18))
    },
    {
      head: "再表达核心需求",
      body: "说明你的困难，再提出一个明确请求。",
      eg: ensureSentence(truncateWords(requestSentence, 18))
    },
    {
      head: "最后礼貌收尾",
      body: "确认后续安排并表达感谢。",
      eg: ensureSentence("Thank you for understanding and helping me.")
    }
  ];

  return generated.map((item, index) => ({
    head: item.head,
    body: item.body,
    eg: item.eg || fallbackDirections[index]?.eg || ""
  }));
}

function buildDynamicTips(content, fallbackTips = []) {
  const keywords = extractKeywords(content, 6);
  const keywordLabel = keywords.length ? keywords.join(", ") : "key scenario words";

  return uniqueList([
    `尽量复用题干关键词：${keywordLabel}`,
    "把题目里的 You/Your 改成 I/My 来作答。",
    "先交代情况，再给出请求，最后礼貌收尾。",
    "避免泛泛表达，优先说题目里出现的具体细节。",
    ...(fallbackTips || [])
  ], 6);
}

function getLocalStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}

function loadDynamicTemplateCache() {
  if (dynamicTemplateCache && typeof dynamicTemplateCache === "object") return dynamicTemplateCache;
  dynamicTemplateCache = {};

  const storage = getLocalStorage();
  if (!storage) return dynamicTemplateCache;

  try {
    const raw = storage.getItem(DYNAMIC_TEMPLATE_CACHE_KEY);
    if (!raw) return dynamicTemplateCache;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      dynamicTemplateCache = parsed;
    }
  } catch {
    dynamicTemplateCache = {};
  }

  return dynamicTemplateCache;
}

function persistDynamicTemplateCache(cache) {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(DYNAMIC_TEMPLATE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore quota errors
  }
}

function buildTemplateSignature(content) {
  return toLower(content);
}

function getCachedDynamicKeyPoints(questionId) {
  const key = toSafeString(questionId);
  if (!key) return null;
  const cache = loadDynamicTemplateCache();
  const item = toObject(cache[key]);
  if (!item) return null;
  return toObject(item.keyPoints);
}

function saveDynamicKeyPoints(questionId, signature, keyPoints) {
  const key = toSafeString(questionId);
  if (!key || !signature || !toObject(keyPoints)) return;
  const cache = loadDynamicTemplateCache();
  cache[key] = {
    signature,
    updatedAt: new Date().toISOString(),
    keyPoints
  };
  dynamicTemplateCache = cache;
  persistDynamicTemplateCache(cache);
}

function buildDynamicKeyPoints({ questionId, content, topic, baseKeyPoints }) {
  const signature = buildTemplateSignature(content);
  const cached = getCachedDynamicKeyPoints(questionId);
  if (cached) return cached;

  const tone = inferTone(content, topic, baseKeyPoints?.tone);
  const role = toSafeString(baseKeyPoints?.role) || `You are a student speaking to ${inferAudience(content, baseKeyPoints?.role)}.`;
  const templatePayload = buildTemplateFromQuestion(content, tone);

  const phrases = buildDynamicPhrases(templatePayload, baseKeyPoints?.phrases || {});
  const directions = buildDynamicDirections(content, templatePayload, baseKeyPoints?.directions || []);
  const tips = buildDynamicTips(content, baseKeyPoints?.tips || []);

  const result = {
    role,
    tone,
    toneLabel: toSafeString(baseKeyPoints?.toneLabel) || TONE_LABEL_MAP[tone],
    directions: directions.length ? directions : (baseKeyPoints?.directions || []),
    templateOpener: templatePayload.opener,
    templateFull: templatePayload.full,
    phrases,
    tips,
    templateSource: "dynamic-question",
    templateSignature: signature
  };

  saveDynamicKeyPoints(questionId, signature, result);
  return result;
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

  const baseKeyPoints = normalizeKeyPoints(source.key_points);
  const dynamicKeyPoints = buildDynamicKeyPoints({
    questionId: id,
    content,
    topic,
    baseKeyPoints
  });

  return {
    id,
    task_type: "RTS",
    taskType: "RTS",
    content,
    audio_path: audioPath,
    audio_url: audioUrl,
    topic,
    key_points: dynamicKeyPoints,
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

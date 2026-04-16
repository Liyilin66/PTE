import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { RTS_FALLBACK_QUESTIONS } from "@/data/rtsFallbackQuestions";

const hasSupabaseConfig =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

const RTS_AUDIO_BUCKET = "question-audio";
const RTS_AUDIO_FOLDER = "rts";
const DYNAMIC_TEMPLATE_GENERATOR_VERSION = "v5";
const DYNAMIC_TEMPLATE_CACHE_KEY = "RTS_DYNAMIC_TEMPLATE_CACHE_V5";
const LEGACY_DYNAMIC_TEMPLATE_CACHE_KEYS = ["RTS_DYNAMIC_TEMPLATE_CACHE_V4", "RTS_DYNAMIC_TEMPLATE_CACHE_V3"];

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

const DYNAMIC_INTENT_HINTS = {
  advice: ["advice", "recommend", "suggest", "calm down", "encourage"],
  report: ["report", "not working", "broken", "damaged", "missing", "locked", "run out of battery", "repair"],
  reschedule: ["alternative arrangement", "extension", "change the time", "double booked", "late", "missed the deadline", "at the same time"],
  boundary: ["too noisy", "disappearing", "copy your", "dirty common areas", "keeps talking", "without asking"],
  initiative: ["volunteer", "interested in", "participating", "enroll", "research project"],
  decline: ["cannot attend", "cannot join", "can't attend", "can't join", "cannot commit"],
  correction: ["made a mistake", "correct this information", "wrong address", "actually at"],
  coordination: ["group assignment", "what you can do", "switch rooms", "hasn't sent", "has not finished", "check back"],
  help: ["help", "borrow", "lend", "guidance", "notes"]
};

const TEMPLATE_OPENER_BANK = {
  formal: [
    "Hello, could I talk to you for a minute?",
    "Excuse me, may I explain my situation briefly?",
    "Hi, I need to discuss a small problem with you."
  ],
  informal: [
    "Hi [name], can we talk for a minute?",
    "Hey [name], do you have a minute?",
    "Hi, I need your help with something."
  ],
  "semi-formal": [
    "Hi [name], could we talk for a minute?",
    "Hello, I need to explain this situation.",
    "Hi, could I explain this quickly?"
  ]
};

const TEMPLATE_REQUEST_BANK = {
  advice: "Could you try one small step first and see how it goes?",
  report: "Could you please check this and tell me what I should do next?",
  reschedule: "Could we change to another time, or can I have a short extension?",
  boundary: "Could we set one clear rule so this does not happen again?",
  initiative: "Could you tell me the start time and what I need to prepare?",
  decline: "I cannot join this time. Can I help in another way?",
  correction: "Please use the correct information and ignore my last message.",
  coordination: "Can we confirm the new plan and who will do each part?",
  help: "Could you please help me with this when you have a moment?",
  general: "Could we talk about the best next step?"
};

const TEMPLATE_SUPPORT_BANK = {
  advice: "I hope this can help you feel more confident.",
  report: "This is affecting my study, so I hope it can be fixed soon.",
  reschedule: "I still want to finish the task well and on time.",
  boundary: "I want to solve this politely and keep a good relationship.",
  initiative: "I am ready to join and do my part.",
  decline: "I really appreciate the invitation and hope you understand.",
  correction: "I wanted to fix this right away so there is no confusion.",
  coordination: "I want us to stay on the same plan and finish on time.",
  help: "I am asking early so we can solve this faster.",
  general: "I am happy to follow any reasonable arrangement."
};

const TEMPLATE_CLOSING_BANK = {
  formal: "Thank you for your understanding and support.",
  informal: "Thanks a lot for understanding.",
  "semi-formal": "Thank you for understanding and helping out."
};

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
    .replace(/\bfor making this call\b/gi, "for this call")
    .replace(/\bone of them are\b/gi, "one of them is")
    .replace(/\bmy phone run out of battery\b/gi, "my phone ran out of battery")
    .replace(/\bin fridge\b/gi, "in the fridge")
    .replace(/\btwo pages has been\b/gi, "two pages have been")
    .replace(/\binfluences my sleep\b/gi, "affects my sleep")
    .replace(/\bsome saving\b/gi, "some savings")
    .replace(/\bvisitor of my roommate\b/gi, "my roommate's visitor");
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
    .replace(/\b[Yy]ou\'ve\b/g, "I've")
    .replace(/\b[Yy]ou\'re\b/g, "I'm")
    .replace(/\b[Yy]ou are\b/g, "I am")
    .replace(/\b[Yy]ou were\b/g, "I was")
    .replace(/\b[Yy]ou have\b/g, "I have")
    .replace(/\b[Yy]ou need to\b/g, "I need to")
    .replace(/\b[Yy]ou need\b/g, "I need")
    .replace(/\b[Yy]ou want to\b/g, "I want to")
    .replace(/\b[Yy]ou want\b/g, "I want")
    .replace(/\b[Yy]ou can\b/g, "I can")
    .replace(/\b[Yy]ou cannot\b/g, "I cannot")
    .replace(/\b[Yy]ou should\b/g, "I should")
    .replace(/\b[Yy]ou must\b/g, "I must")
    .replace(/\b[Yy]ou just\b/g, "I just")
    .replace(/\b[Yy]our\b/g, "my")
    .replace(/\bhelp you\b/gi, "help me")
    .replace(/\bfor you\b/gi, "for me")
    .replace(/\bwith you\b/gi, "with me")
    .replace(/\bto you\b/gi, "to me")
    .replace(/^you\b/i, "I")
    .replace(/^I and my ([a-z][a-z\s'-]+?) have\b/i, "My $1 and I have")
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
    .map((line) => line.replace(/\bI and my ([a-z][a-z\s'-]+?)\b/gi, "my $1 and I"))
    .map((line) => line.replace(/^[,;:\-\s]+/, "").replace(/[,:;-\s]+$/, ""))
    .filter(Boolean)
    .filter((line) => !isInstructionSentence(line));
}

function normalizeSentenceKey(text) {
  return normalizeWhitespace(text).toLowerCase().replace(/[^a-z0-9\s]/g, "");
}

function sentenceTokenSet(text) {
  return new Set(normalizeSentenceKey(text).split(/\s+/).filter(Boolean));
}

function sentenceSimilarity(a, b) {
  const aTokens = sentenceTokenSet(a);
  const bTokens = sentenceTokenSet(b);
  if (!aTokens.size || !bTokens.size) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function dedupeSentences(list, limit = 5) {
  const output = [];
  for (const line of list) {
    const sentence = ensureSentence(line);
    if (!sentence) continue;
    const key = normalizeSentenceKey(sentence);
    if (!key) continue;
    if (output.some((existing) => sentenceSimilarity(existing, sentence) >= 0.84)) continue;
    output.push(sentence);
    if (output.length >= limit) break;
  }
  return output;
}

function splitScenarioClauses(text) {
  const normalized = normalizeWhitespace(text)
    .replace(/[“”]/g, "\"")
    .replace(/[’]/g, "'")
    .replace(/[!?]+/g, ".")
    .replace(/\s*;\s*/g, ". ")
    .replace(/\s*,\s*(but|and|so|because|while|however|which)\b/gi, ". ");

  return normalized
    .split(/(?<=[.])\s+|\.\s+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function inferIntent(content) {
  const lower = toLower(content);
  for (const [intent, hints] of Object.entries(DYNAMIC_INTENT_HINTS)) {
    if (hints.some((hint) => lower.includes(hint))) return intent;
  }
  return "general";
}

function buildTemplateSeed(content, tone, intent) {
  const source = `${normalizeWhitespace(content)}|${tone}|${intent}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0; // keep 32-bit integer
  }
  return Math.abs(hash);
}

function pickBySeed(list, seed = 0) {
  if (!Array.isArray(list) || !list.length) return "";
  const safeSeed = Math.abs(Number(seed || 0));
  return list[safeSeed % list.length];
}

function buildOpenerLine(tone, seed) {
  return pickBySeed(TEMPLATE_OPENER_BANK[tone] || TEMPLATE_OPENER_BANK["semi-formal"], seed)
    || TEMPLATE_OPENER_BANK["semi-formal"][0];
}

function buildContextLine(scenarioLines, intent) {
  const preferMatchers = {
    report: /\b(broken|not working|damaged|missing|locked|battery|problem)\b/i,
    reschedule: /\b(conflict|double booked|late|deadline|same time|meeting|competition)\b/i,
    boundary: /\b(noisy|talking|dirty|without asking|copy|disappearing)\b/i,
    correction: /\b(mistake|wrong|correct|actually)\b/i,
    initiative: /\b(interested|volunteer|join|project|enroll)\b/i,
    decline: /\b(cannot|can't|cannot attend|cannot join|final year)\b/i,
    coordination: /\b(group|deadline|hasn'?t sent|not finished|switch rooms)\b/i,
    help: /\b(help|borrow|lend|notes|guidance)\b/i
  };

  const matcher = preferMatchers[intent];
  const picked = scenarioLines.find((line) => matcher && matcher.test(line))
    || scenarioLines[0]
    || "I have a situation that needs a quick solution";

  const normalized = normalizeWhitespace(picked)
    .replace(/^(and|but|so|because)\s+/i, "")
    .replace(/^I\s+am\s+calling\s+to\s+say\s+/i, "I am calling because ");

  return normalized.startsWith("I ") || normalized.startsWith("I'm")
    ? normalized
    : `I am calling because ${normalized}`;
}

function buildSecondContextLine(scenarioLines, primaryLine = "") {
  const candidate = scenarioLines.find((line) => sentenceSimilarity(line, primaryLine) < 0.7 && line.split(/\s+/).length >= 4);
  if (!candidate) return "";

  const normalized = normalizeWhitespace(candidate).replace(/^(and|but|so|because)\s+/i, "");
  if (!normalized) return "";

  if (normalized.startsWith("I ") || normalized.startsWith("I'm")) return normalized;
  return `Also, ${normalized}`;
}

function buildRequestLine(intent) {
  return TEMPLATE_REQUEST_BANK[intent] || TEMPLATE_REQUEST_BANK.general;
}

function buildSupportLine(intent) {
  return TEMPLATE_SUPPORT_BANK[intent] || TEMPLATE_SUPPORT_BANK.general;
}

function buildActionLine(content) {
  const source = normalizeWhitespace(content);
  const patterns = [
    /\byou need to\s+([^.!?]+)/i,
    /\byou want to\s+([^.!?]+)/i,
    /\byou have to\s+([^.!?]+)/i,
    /\byou decide to\s+([^.!?]+)/i,
    /\byou are planning to\s+([^.!?]+)/i,
    /\byou are interested in\s+([^.!?]+)/i
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;

    const phrase = toFirstPersonNarration(match[1])
      .replace(/^I\s+/i, "")
      .replace(/\s*[,;:]\s*$/g, "")
      .trim();

    if (!phrase) continue;
    return ensureSentence(truncateWords(`I need to ${phrase}`, 20));
  }

  return "";
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

function buildTemplateFromQuestion(content, tone) {
  const intent = inferIntent(content);
  const scenarioText = stripQuestionTail(content);
  const firstPersonText = toFirstPersonNarration(scenarioText);
  const scenarioLines = cleanScenarioLines(splitScenarioClauses(firstPersonText));
  const seed = buildTemplateSeed(content, tone, intent);
  const opener = ensureSentence(buildOpenerLine(tone, seed));
  const detail = buildContextLine(scenarioLines, intent);
  const detailTwo = buildSecondContextLine(scenarioLines, detail);
  const action = buildActionLine(content);
  const request = buildRequestLine(intent);
  const support = buildSupportLine(intent);
  const closing = TEMPLATE_CLOSING_BANK[tone] || TEMPLATE_CLOSING_BANK["semi-formal"];

  const full = dedupeSentences([
    opener,
    detail,
    detailTwo,
    action,
    request,
    support,
    closing
  ], 6).join(" ");

  return {
    opener,
    full,
    scenarioLines,
    intent
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

function purgeLegacyDynamicTemplateCaches(storage) {
  if (!storage) return;
  for (const key of LEGACY_DYNAMIC_TEMPLATE_CACHE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // ignore storage removal errors
    }
  }
}

function loadDynamicTemplateCache() {
  if (dynamicTemplateCache && typeof dynamicTemplateCache === "object") return dynamicTemplateCache;
  dynamicTemplateCache = {};

  const storage = getLocalStorage();
  if (!storage) return dynamicTemplateCache;
  purgeLegacyDynamicTemplateCaches(storage);

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
  return `${DYNAMIC_TEMPLATE_GENERATOR_VERSION}:${toLower(content)}`;
}

function getCachedDynamicKeyPoints(questionId, signature) {
  const key = toSafeString(questionId);
  if (!key || !signature) return null;
  const cache = loadDynamicTemplateCache();
  const item = toObject(cache[key]);
  if (!item) return null;
  if (toSafeString(item.signature) !== signature) return null;
  if (toSafeString(item.generatorVersion) !== DYNAMIC_TEMPLATE_GENERATOR_VERSION) return null;
  return toObject(item.keyPoints);
}

function saveDynamicKeyPoints(questionId, signature, keyPoints) {
  const key = toSafeString(questionId);
  if (!key || !signature || !toObject(keyPoints)) return;
  const cache = loadDynamicTemplateCache();
  cache[key] = {
    signature,
    generatorVersion: DYNAMIC_TEMPLATE_GENERATOR_VERSION,
    updatedAt: new Date().toISOString(),
    keyPoints
  };
  dynamicTemplateCache = cache;
  persistDynamicTemplateCache(cache);
}

function buildDynamicKeyPoints({ questionId, content, topic, baseKeyPoints }) {
  const signature = buildTemplateSignature(content);
  const cached = getCachedDynamicKeyPoints(questionId, signature);
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

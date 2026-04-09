import { createClient } from "@supabase/supabase-js";
import { generateScoreTextWithFallback } from "../backend/llm/score-llm-service.js";
import { getGroqApiKeyFromEnv } from "../backend/llm/providers/groq.js";
import { analyzeWEEssayForm } from "../backend/we/form-gate-rules.js";
import {
  buildWEAiFallbackResult,
  buildWEFormGateResult,
  finalizeWEScorePayload
} from "../backend/we/normalize-we-score.js";
import { buildWEPrompt } from "../backend/we/we-prompt.js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const RA_MIN_SCORE = 10;
const RA_MAX_SCORE = 90;
const RA_WEIGHTS = {
  content: 0.2,
  fluency: 0.45,
  pronunciation: 0.35
};
const RA_FORCE_BASELINE_RESPONSE_TYPES = new Set(["silence", "noise_only"]);
const RA_CONTENT_MATCH_FLOOR_SCORE = 45;
const RA_CONTENT_MATCH_WORD_THRESHOLD = 10;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  const requestId = createRequestId(req);
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      request_id: requestId
    });
  }

  if (!supabase) {
    return res.status(500).json({
      error: "supabase_not_configured",
      message: "Supabase environment variables are not configured.",
      request_id: requestId
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: "Please sign in first.",
      request_id: requestId
    });
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const user = authData?.user || null;
  if (authError || !user) {
    return res.status(401).json({
      error: "Session expired. Please sign in again.",
      request_id: requestId
    });
  }

  const { taskType, transcript, questionContent } = req.body || {};
  const normalizedTaskType = normalizeTaskType(taskType);
  const safeTranscript = typeof transcript === "string" ? transcript : "";
  const trimmedTranscript = safeTranscript.trim();
  const weFormAnalysis = normalizedTaskType === "WE" ? analyzeWEEssayForm(safeTranscript) : null;

  if (!trimmedTranscript) {
    if (normalizedTaskType === "RA") {
      const raSilenceResult = finalizeRAScore(
        { responseType: "silence" },
        {
          transcript: safeTranscript,
          questionContent
        }
      );
      return res.status(200).json({
        ...raSilenceResult,
        provider_used: "none",
        fallback_reason: null,
        request_id: requestId
      });
    }

    if (normalizedTaskType === "WE") {
      return res.status(200).json({
        ...buildWEFormGateResult({ formAnalysis: weFormAnalysis }),
        request_id: requestId
      });
    }

    return res.status(400).json({
      error: "transcript_too_short",
      scores: { pronunciation: 0, fluency: 0, content: 0 },
      feedback: "No speech/text recognized. Please retry.",
      overall: 0,
      request_id: requestId
    });
  }

  if (normalizedTaskType !== "RA" && normalizedTaskType !== "WE" && trimmedTranscript.length < 3) {
    return res.status(400).json({
      error: "transcript_too_short",
      scores: { pronunciation: 0, fluency: 0, content: 0 },
      feedback: "No speech/text recognized. Please retry.",
      overall: 0,
      request_id: requestId
    });
  }

  try {
    const authedSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });

    const { data: profile, error: profileError } = await authedSupabase
      .from("profiles")
      .select("is_premium, trial_days, trial_granted_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("load profile error:", profileError);
      return res.status(500).json({
        error: "profile_load_failed",
        request_id: requestId
      });
    }

    const access = getAccessStatus(user, profile);
    if (!access.canUseAiScoring) {
      return res.status(403).json({
        error: "access_expired",
        message: "AI scoring access is not available for this account.",
        access,
        request_id: requestId
      });
    }

    if (normalizedTaskType === "WE" && Number(weFormAnalysis?.form_score || 0) === 0) {
      return res.status(200).json({
        ...buildWEFormGateResult({ formAnalysis: weFormAnalysis }),
        request_id: requestId
      });
    }

    const hasGeminiApiKey = hasConfiguredGeminiApiKey();
    const hasGroqApiKey = hasConfiguredGroqApiKey();
    if (!hasGeminiApiKey && !hasGroqApiKey) {
      if (normalizedTaskType === "WE") {
        return res.status(200).json(
          {
            ...buildWEAiFallbackResult({
              formAnalysis: weFormAnalysis,
              providerUsed: "none",
              fallbackReason: "llm_api_keys_missing",
              errorStage: "precheck_missing_all_keys",
              rawErrorType: "llm_api_keys_missing",
              reasonCodes: ["ai_review_unavailable"]
            }),
            request_id: requestId
          }
        );
      }

      return res.status(500).json({
        error: "missing_api_key",
        scores: { pronunciation: 60, fluency: 60, content: 60 },
        feedback: "AI service is not configured yet.",
        overall: 60,
        request_id: requestId
      });
    }

    const prompt = buildPrompt(normalizedTaskType, safeTranscript, questionContent, weFormAnalysis);
    const llmResult = await generateScoreTextWithFallback({
      prompt,
      taskType: normalizedTaskType
    });
    const latency = normalizeLatency(llmResult?.latency);
    const providerAttempts = normalizeProviderAttempts(llmResult?.provider_attempts);

    let parsedPayload;
    try {
      parsedPayload = parseModelJson(llmResult?.raw_text, { taskType: normalizedTaskType });
    } catch (error) {
      error.error_stage = "response_parse";
      error.provider_used = llmResult?.provider_used || "gemini";
      error.fallback_reason = llmResult?.fallback_reason ?? null;
      error.raw_error_type = error?.raw_error_type || "model_json_parse_failed";
      error.provider_attempts = providerAttempts;
      error.latency = latency;
      throw error;
    }

    let parsed;
    try {
      parsed = normalizeResult(parsedPayload, {
        taskType: normalizedTaskType,
        transcript: safeTranscript,
        questionContent,
        weFormAnalysis,
        providerUsed: llmResult?.provider_used || "gemini",
        fallbackReason: llmResult?.fallback_reason ?? null
      });
    } catch (error) {
      error.error_stage = "response_normalize";
      error.provider_used = llmResult?.provider_used || "gemini";
      error.fallback_reason = llmResult?.fallback_reason ?? null;
      error.raw_error_type = error?.raw_error_type || "score_normalize_failed";
      error.provider_attempts = providerAttempts;
      error.latency = latency;
      throw error;
    }

    const responsePayload = {
      ...parsed,
      provider_used: llmResult?.provider_used || "gemini",
      fallback_reason: llmResult?.fallback_reason ?? null,
      request_id: requestId
    };

    logScoreEvent("score_success", {
      request_id: requestId,
      task_type: normalizedTaskType,
      provider_used: responsePayload.provider_used,
      fallback_reason: responsePayload.fallback_reason,
      raw_error_type: llmResult?.raw_error_type || null,
      error_stage: "",
      response_status: 200,
      provider_attempts: providerAttempts,
      latency_total_ms: latency.total_ms,
      latency_primary_ms: latency.primary_ms,
      latency_fallback_ms: latency.fallback_ms
    });

    return res.json(responsePayload);
  } catch (error) {
    const latency = normalizeLatency(error?.latency);
    const providerUsed = `${error?.provider_used || error?.provider || "gemini"}`;
    const rawErrorType = error?.raw_error_type || "ai_error_unknown";
    const fallbackReason = normalizeFallbackReason(error?.fallback_reason, rawErrorType);
    const errorStage = error?.error_stage || "provider_call";
    const providerAttempts = normalizeProviderAttempts(error?.provider_attempts);

    logScoreEvent("score_failed", {
      request_id: requestId,
      task_type: normalizedTaskType,
      provider_used: providerUsed,
      fallback_reason: fallbackReason,
      raw_error_type: rawErrorType,
      error_stage: errorStage,
      response_status: normalizedTaskType === "WE" ? 200 : 500,
      provider_attempts: providerAttempts,
      latency_total_ms: latency.total_ms,
      latency_primary_ms: latency.primary_ms,
      latency_fallback_ms: latency.fallback_ms
    });

    if (normalizedTaskType === "WE") {
      return res.status(200).json(
        {
          ...buildWEAiFallbackResult({
            formAnalysis: weFormAnalysis,
            providerUsed,
            fallbackReason,
            errorStage,
            rawErrorType,
            reasonCodes: ["ai_review_unavailable"]
          }),
          request_id: requestId
        }
      );
    }

    return res.status(500).json({
      error: "ai_error",
      scores: { pronunciation: 60, fluency: 60, content: 60 },
      feedback: "AI analysis is temporarily unavailable. This is an estimated fallback score.",
      overall: 60,
      provider_used: providerUsed,
      fallback_reason: fallbackReason,
      request_id: requestId
    });
  }
}

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return "";
  }
  return header.slice(7).trim();
}

function getDaysSince(fromDate, now = new Date()) {
  const diff = now.getTime() - fromDate.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function parseDateOrFallback(value, fallbackDate) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallbackDate;
  return parsed;
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function getAccessStatus(user, profile) {
  const now = new Date();
  const isPremium = Boolean(profile?.is_premium);
  const trialDays = toNonNegativeInteger(profile?.trial_days);
  const registeredAt = parseDateOrFallback(user?.created_at, now);
  const trialStartAt = parseDateOrFallback(profile?.trial_granted_at, registeredAt);
  const trialDaysLeft = trialDays > 0 ? Math.max(0, trialDays - getDaysSince(trialStartAt, now)) : 0;
  const isInTrial = !isPremium && trialDaysLeft > 0;

  let accessStatus = "not_opened";
  if (isPremium) accessStatus = "vip";
  else if (isInTrial) accessStatus = "trial";
  else if (trialDays > 0) accessStatus = "trial_expired";

  return {
    isPremium,
    isInTrial,
    trialDaysLeft,
    canUseAiScoring: isPremium || isInTrial,
    accessStatus,
    statusText: buildStatusText(accessStatus, trialDaysLeft)
  };
}

function buildStatusText(accessStatus, trialDaysLeft) {
  if (accessStatus === "vip") return "VIP - Unlimited practice";
  if (accessStatus === "trial") return `Trial - ${trialDaysLeft} day(s) left`;
  if (accessStatus === "trial_expired") return "Trial expired";
  return "Not activated";
}

function createRequestId(req) {
  const existingId = `${req.headers?.["x-request-id"] || ""}`.trim();
  if (existingId) return existingId;
  return `score_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeLatency(latency) {
  return {
    total_ms: Math.max(0, Math.round(Number(latency?.total_ms || 0))),
    primary_ms: Math.max(0, Math.round(Number(latency?.primary_ms || 0))),
    fallback_ms: Math.max(0, Math.round(Number(latency?.fallback_ms || 0)))
  };
}

function logScoreEvent(event, payload) {
  const entry = {
    event,
    ...payload
  };
  if (event === "score_failed") {
    console.error("[score:llm]", entry);
    return;
  }
  console.info("[score:llm]", entry);
}

function normalizeTaskType(taskType) {
  if (typeof taskType !== "string") return "RA";
  const normalized = taskType.trim().toUpperCase();
  return normalized || "RA";
}

function hasConfiguredGeminiApiKey() {
  const apiKey = `${process.env.GEMINI_API_KEY || ""}`.trim();
  return Boolean(apiKey && apiKey !== "YOUR_GEMINI_API_KEY");
}

function hasConfiguredGroqApiKey() {
  return Boolean(getGroqApiKeyFromEnv());
}

function normalizeFallbackReason(fallbackReason, rawErrorType) {
  const reason = `${fallbackReason || rawErrorType || ""}`.trim();
  return reason || null;
}

function normalizeProviderAttempts(attempts) {
  if (!Array.isArray(attempts)) return [];
  return attempts
    .map((item) => ({
      provider: `${item?.provider || ""}`.trim(),
      stage: `${item?.stage || ""}`.trim(),
      started_at: `${item?.started_at || ""}`.trim(),
      ended_at: `${item?.ended_at || ""}`.trim(),
      duration_ms: Math.max(0, Math.round(Number(item?.duration_ms || 0))),
      timeout_ms: Number.isFinite(Number(item?.timeout_ms)) ? Math.round(Number(item.timeout_ms)) : undefined,
      status: `${item?.status || ""}`.trim(),
      raw_error_type: `${item?.raw_error_type || ""}`.trim()
    }))
    .filter((item) => item.provider);
}

function parseModelJson(rawText, options = {}) {
  const cleanText = `${rawText || ""}`.replace(/```json|```/gi, "").trim();
  const strictPayload = tryParseJsonObject(cleanText);
  if (strictPayload) return strictPayload;

  if (options?.taskType !== "RA") {
    throw new Error("Invalid JSON from model");
  }

  return parseRALoosePayload(cleanText);
}

function tryParseJsonObject(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function parseRALoosePayload(text) {
  const pronunciation = extractNumberByKeys(text, ["pronunciation"]);
  const fluency = extractNumberByKeys(text, ["fluency"]);
  const content = extractNumberByKeys(text, ["content"]);
  const responseType = normalizeRAResponseType(extractStringByKeys(text, ["responseType", "response_type", "type"]));
  const feedback = extractStringByKeys(text, ["feedback", "comment"]);

  return {
    responseType: responseType || "invalid_response",
    scores: {
      pronunciation,
      fluency,
      content
    },
    feedback: feedback || ""
  };
}

function extractNumberByKeys(text, keys) {
  for (const key of keys) {
    const withQuotes = new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
    const plain = new RegExp(`${key}\\s*[:=]\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
    const quotedMatch = text.match(withQuotes);
    if (quotedMatch?.[1]) return Number(quotedMatch[1]);
    const plainMatch = text.match(plain);
    if (plainMatch?.[1]) return Number(plainMatch[1]);
  }
  return undefined;
}

function extractStringByKeys(text, keys) {
  for (const key of keys) {
    const quotedPattern = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, "i");
    const plainPattern = new RegExp(`${key}\\s*[:=]\\s*([a-zA-Z_\\-]+)`, "i");
    const quotedMatch = text.match(quotedPattern);
    if (quotedMatch?.[1]) return quotedMatch[1].trim();
    const plainMatch = text.match(plainPattern);
    if (plainMatch?.[1]) return plainMatch[1].trim();
  }
  return "";
}

function normalizeResult(payload, options = {}) {
  if (options?.taskType === "RA") {
    return finalizeRAScore(payload, options);
  }

  if (options?.taskType === "WE") {
    return finalizeWEScorePayload(payload, {
      formAnalysis: options?.weFormAnalysis,
      providerUsed: options?.providerUsed || "gemini",
      fallbackReason: options?.fallbackReason ?? null
    });
  }

  const pronunciation = clampScore(payload?.scores?.pronunciation);
  const fluency = clampScore(payload?.scores?.fluency);
  const content = clampScore(payload?.scores?.content);
  const feedback = typeof payload?.feedback === "string"
    ? payload.feedback.trim()
    : "Practice completed. Keep the momentum.";
  const overallRaw = Number(payload?.overall);
  const overall = Number.isFinite(overallRaw)
    ? Math.max(0, Math.min(100, Math.round(overallRaw)))
    : Math.round((pronunciation + fluency + content) / 3);
  const keywords = Array.isArray(payload?.keywords)
    ? payload.keywords
        .map((item) => ({
          word: typeof item?.word === "string" ? item.word : "",
          hit: Boolean(item?.hit)
        }))
        .filter((item) => item.word)
    : [];

  return {
    scores: {
      pronunciation,
      fluency,
      content
    },
    keywords,
    feedback,
    overall
  };
}

function finalizeRAScore(payload, context = {}) {
  const responseType = normalizeRAResponseType(
    payload?.responseType || payload?.response_type || payload?.transcriptQuality || payload?.resultType
  );
  const rawPronunciation = pickRAScore(payload, "pronunciation");
  const rawFluency = pickRAScore(payload, "fluency");
  const rawContent = pickRAScore(payload, "content");
  const invalidCheck = checkInvalidRAResponse({
    responseType
  });

  if (invalidCheck.isInvalid) {
    return buildRAInvalidResult(payload, invalidCheck.responseType);
  }

  const overlap = calculateWordOverlap(context?.transcript, context?.questionContent);
  const pronunciation = clampRASubScore(rawPronunciation);
  const fluency = clampRASubScore(rawFluency);
  let content = clampRASubScore(rawContent);
  if (overlap.uniqueMatchedCount >= RA_CONTENT_MATCH_WORD_THRESHOLD) {
    content = Math.max(content, RA_CONTENT_MATCH_FLOOR_SCORE);
  }
  const weightedOverall =
    pronunciation * RA_WEIGHTS.pronunciation + fluency * RA_WEIGHTS.fluency + content * RA_WEIGHTS.content;
  const overall = clampRAOverall(weightedOverall);
  const feedback = normalizeFeedback(payload?.feedback, "Keep practicing pacing and stress patterns for steadier delivery.");

  return {
    scores: {
      pronunciation,
      fluency,
      content
    },
    keywords: [],
    feedback,
    overall,
    responseType: responseType || "valid_reading"
  };
}

function pickRAScore(payload, key) {
  const score = payload?.scores?.[key] ?? payload?.[key];
  return Number(score);
}

function checkInvalidRAResponse({ responseType }) {
  if (RA_FORCE_BASELINE_RESPONSE_TYPES.has(responseType)) {
    return { isInvalid: true, responseType };
  }

  return { isInvalid: false, responseType: responseType || "valid_reading" };
}

function calculateWordOverlap(transcript, referenceText) {
  const transcriptTokens = tokenizeForOverlap(transcript);
  const referenceTokens = tokenizeForOverlap(referenceText);

  if (!referenceTokens.length) {
    return { hasReference: false, matchedCount: 0, uniqueMatchedCount: 0 };
  }

  const referenceSet = new Set(referenceTokens);
  const matchedWords = new Set();
  let matchedCount = 0;
  for (const token of transcriptTokens) {
    if (referenceSet.has(token)) {
      matchedCount += 1;
      matchedWords.add(token);
    }
  }

  return {
    hasReference: true,
    matchedCount,
    uniqueMatchedCount: matchedWords.size
  };
}

function tokenizeForOverlap(text) {
  return `${text || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function buildRAInvalidResult(payload, responseType) {
  const feedback = normalizeFeedback(payload?.feedback, "No valid reading was detected this time, so a baseline score was used.");

  return {
    scores: {
      pronunciation: RA_MIN_SCORE,
      fluency: RA_MIN_SCORE,
      content: RA_MIN_SCORE
    },
    keywords: [],
    feedback,
    overall: RA_MIN_SCORE,
    responseType: responseType || "invalid_response"
  };
}

function normalizeRAResponseType(value) {
  const normalized = `${value || ""}`.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return "";
  if (normalized.includes("silence") || normalized.includes("no_speech")) return "silence";
  if (normalized.includes("too_short") || normalized.includes("short")) return "too_short";
  if (normalized.includes("gibber")) return "gibberish";
  if (normalized.includes("off") && normalized.includes("topic")) return "off_topic";
  if (normalized.includes("noise")) return "noise_only";
  if (normalized.includes("valid")) return "valid_reading";
  if (normalized === "random" || normalized === "invalid") return "invalid_response";
  return normalized;
}

function clampRASubScore(value) {
  if (!Number.isFinite(value)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(value)));
}

function clampRAOverall(value) {
  if (!Number.isFinite(value)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(value)));
}

function normalizeFeedback(value, fallback) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized || fallback;
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(90, Math.round(num)));
}

function buildPrompt(taskType, transcript, questionContent, weFormAnalysis) {
  const question = questionContent || "";

  if (taskType === "WE") {
    return buildWEPrompt({
      essayText: transcript,
      questionContent: questionContent || "",
      formAnalysis: weFormAnalysis || analyzeWEEssayForm(transcript)
    });
  }

  const prompts = {
    RA: `
You are a PTE Academic examiner evaluating ONLY a Read Aloud response.

Original passage:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Task:
1) First classify responseType as one of:
- valid_reading
- silence
- too_short
- gibberish
- off_topic
- noise_only

2) Then score ONLY these 3 dimensions (10-90 scale):
- pronunciation: clarity and accuracy of individual sounds
- fluency: pace, rhythm, and smooth delivery
- content: coverage and correctness of the original passage

Rules:
- If responseType is silence / noise_only, set all 3 scores to 10.
- For too_short / gibberish / off_topic, keep normal scoring based on recognized useful content.
- If 10 or more valid words clearly match the original passage, set content to at least 45.
- Even for valid_reading, do not return any score below 10.
- Feedback must be in Chinese, warm coach tone, 2-3 sentences, with one actionable tip.
- Output JSON only, no markdown, no extra text.

Respond ONLY with this JSON shape:
{
  "responseType": "<valid_reading|silence|too_short|gibberish|off_topic|noise_only>",
  "scores": {
    "pronunciation": <number 10-90>,
    "fluency": <number 10-90>,
    "content": <number 10-90>
  },
  "feedback": "<Chinese feedback>",
  "overall": <number 10-90>
}`,

    RS: `
You are a PTE Academic examiner evaluating a Repeat Sentence response.

Original sentence:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Evaluate keyword coverage: compare what the student said against the original sentence.
Identify which important content words (nouns, verbs, adjectives) were:
- hit: present in student's response
- missed: not present in student's response

Score overall as a percentage of keywords covered (0-100).

Rules:
- Feedback in Chinese, warm coach tone
- Never use harsh negative words like "太差", "错误很多", "不行"
- Instead say things like "这次已经抓住关键词了，下次把句尾补完整会更稳。"

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": <number 0-90>,
    "fluency": <number 0-90>,
    "content": <number 0-90>
  },
  "keywords": [
    { "word": "<keyword>", "hit": <true or false> }
  ],
  "feedback": "<Chinese feedback, warm tone, 2 sentences>",
  "overall": <keyword coverage percentage 0-100>
}`,

    RL: `
You are a PTE Academic examiner evaluating a Re-tell Lecture response.

Lecture content / topic hint:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Evaluate:
- content: key points coverage (did they mention the main topic and at least 2 points?)
- pronunciation: clarity
- fluency: natural delivery

Rules:
- Feedback in Chinese, warm coach tone
- Encourage use of template: "The lecture mainly discusses... The speaker mentions... In conclusion..."
- Never use negative words

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": <number 0-90>,
    "fluency": <number 0-90>,
    "content": <number 0-90>
  },
  "feedback": "<Chinese feedback, 2-3 sentences, mention specific points they did well>",
  "overall": <average of three scores>
}`,

    WFD: `
You are a PTE Academic examiner evaluating a Write From Dictation response.

Original sentence:
"${question}"

Student input:
"${transcript}"

Evaluate:
- content: exact word match coverage
- pronunciation: use 0 for WFD
- fluency: use 0 for WFD

Rules:
- Feedback in Chinese, warm coach tone
- Focus on spelling, function words, and missing words
- Never use harsh negative words like "太差", "错误很多", "不行"

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": 0,
    "fluency": 0,
    "content": <number 0-90>
  },
  "feedback": "<Chinese feedback, 1-2 sentences>",
  "overall": <number 0-100>
}`
  };

  return prompts[taskType] || prompts.RA;
}





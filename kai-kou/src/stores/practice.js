import { defineStore } from "pinia";
import router from "@/router";
import { useAuthStore } from "@/stores/auth";
import { getApiUrl } from "@/lib/api-url";
import { supabase } from "@/lib/supabase";

const RA_MIN_SCORE = 10;
const RA_MAX_SCORE = 90;
const SCORE_API_TIMEOUT_MS = 15000;
const PRACTICE_AUDIO_BUCKET = "practice-audio";
const WE_RAW_MAX = 26;
const WE_REVIEW_LABEL = "AI评阅（估分）";
const WE_GATE_LEVEL = "需重写";
const WE_AI_FALLBACK_REASON_CODE = "ai_review_unavailable";
const WE_STATUS_SCORED = "scored";
const WE_STATUS_RULE_GATED = "rule_gated";
const WE_STATUS_AI_DEGRADED = "ai_review_degraded";
const WE_AI_FALLBACK_LEVEL = "评阅降级";
const WE_AI_FALLBACK_IMPROVEMENTS = [
  "AI评阅服务暂时不可用，请稍后重试。",
  "本次为降级结果，你的作文不一定存在内容不足问题。"
];
const WE_AI_FALLBACK_FINAL_COMMENT = "AI评阅服务暂时不可用，本次已进入降级结果。你的作文不一定存在内容不足问题，请稍后重试。";

const TASKS = [
  {
    id: "ra",
    title: "RA - Read Aloud",
    subtitle: "Pacing trainer",
    description: "Follow the text with stable pace and fluent delivery.",
    icon: "ra",
    iconBg: "bg-[#1E4A86]",
    to: "/ra"
  },
  {
    id: "rs",
    title: "RS - Repeat Sentence",
    subtitle: "Keyword catcher",
    description: "Catch key words first, then repeat fluently.",
    icon: "rs",
    iconBg: "bg-[#2E5EA8]",
    to: "/rs"
  },
  {
    id: "rl",
    title: "RL - Re-tell Lecture",
    subtitle: "Template builder",
    description: "Use a stable framework to structure your summary.",
    icon: "rl",
    iconBg: "bg-gradient-to-br from-[#7A1DE6] to-[#BC1CFB]",
    to: "/rl"
  },
  {
    id: "we",
    title: "WE - Write Essay",
    subtitle: "Structure first",
    description: "Write with clear intro, body, and conclusion.",
    icon: "we",
    iconBg: "bg-[#00AA45]",
    to: "/we"
  },
  {
    id: "wfd",
    title: "WFD - Write From Dictation",
    subtitle: "Accuracy drill",
    description: "Listen carefully and type complete sentences.",
    icon: "wfd",
    iconBg: "bg-[#F3054E]",
    to: "/wfd"
  }
];

export const usePracticeStore = defineStore("practice", {
  state: () => ({
    tasks: TASKS,

    currentQuestion: null,
    selectedQuestion: null,
    questionContent: "",
    phase: "idle",

    transcript: "",
    audioBlob: null,
    result: null,
    wfdResult: null
  }),

  actions: {
    setQuestion(question) {
      this.currentQuestion = question;
      this.questionContent = question?.content || "";
      this.phase = "idle";
      this.transcript = "";
      this.audioBlob = null;
      this.result = null;
      this.wfdResult = null;
    },

    setSelectedQuestion(question) {
      this.selectedQuestion = question || null;
    },

    clearSelectedQuestion() {
      this.selectedQuestion = null;
    },

    setPhase(phase) {
      this.phase = phase;
    },

    setTranscript(text) {
      this.transcript = text;
    },

    setAudioBlob(blob) {
      this.audioBlob = blob;
    },

    setResult(result) {
      this.result = result;
      this.wfdResult = null;
      this.phase = "done";
    },

    setWFDResult(result) {
      this.wfdResult = result || null;
      this.phase = "done";
    },

    resetResult() {
      this.result = null;
      this.wfdResult = null;
      this.transcript = "";
      this.audioBlob = null;
      this.phase = "idle";
    },

    async submitScore(taskType, transcript, questionContent, questionId, options = {}) {
      this.phase = "processing";
      const normalizedTaskType = normalizeTaskType(taskType);
      const submittedTranscript = typeof transcript === "string" ? transcript : "";
      const trimmedSubmittedTranscript = submittedTranscript.trim();
      this.transcript = submittedTranscript;
      this.questionContent = questionContent || this.questionContent || "";

      if (normalizedTaskType === "WE") {
        this.result = null;
      }

      const authStore = useAuthStore();
      const normalizedQuestionId = questionId || this.currentQuestion?.id || "unknown";
      const clientRequestId = `${options?.requestId || createRequestId("we")}`.trim() || createRequestId("we");
      const submitSeq = Number(options?.submitSeq || 0);
      const submissionDebug = buildSubmissionDebugInfo(trimmedSubmittedTranscript);
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("getSession error:", sessionError);
      }

      const session = sessionData?.session || null;
      const token = session?.access_token || authStore.session?.access_token || "";
      const scoreApiUrl = getApiUrl("/api/score");
      const scoreApiStartedAt = getNowMs();
      let scoreApiStatus = 0;
      let remainingDeducted = false;

      function decrementRemainingOnce() {
        if (remainingDeducted) return;
        authStore.decrementRemaining();
        remainingDeducted = true;
      }

      if (!token) {
        if (normalizedTaskType === "WE") {
          this.result = null;
          this.phase = "idle";
          return buildWESubmitErrorResult({
            error: "auth_session_missing",
            scoreErrorCode: "AUTH_SESSION_MISSING",
            scoreApiMs: getElapsedMs(scoreApiStartedAt),
            status: scoreApiStatus,
            requestId: clientRequestId,
            submitSeq,
            submissionDebug,
            diagnostics: buildScoreApiDiagnostics({
              requestId: clientRequestId,
              scoreErrorCode: "AUTH_SESSION_MISSING",
              failureType: "auth_error"
            })
          });
        }

        await authStore.logout();
        router.push("/auth");
        return null;
      }

      try {
        const scoreAbortController = typeof AbortController !== "undefined" ? new AbortController() : null;
        const timeoutId = scoreAbortController
          ? setTimeout(() => {
              scoreAbortController.abort();
            }, SCORE_API_TIMEOUT_MS)
          : null;

        let response;
        try {
          response = await fetch(scoreApiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "x-request-id": clientRequestId
            },
            body: JSON.stringify({
              taskType,
              transcript: submittedTranscript,
              questionContent: this.questionContent,
              question_id: normalizedQuestionId,
              request_id: clientRequestId
            }),
            signal: scoreAbortController?.signal
          });
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        scoreApiStatus = Number(response?.status || 0);
        const scoreApiMs = getElapsedMs(scoreApiStartedAt);
        const responsePayload = await safeReadResponse(response);
        const data = responsePayload.data;
        const responseRequestId = resolveResponseRequestId({
          responseData: data,
          clientRequestId
        });
        const responseDiagnostics = buildScoreApiDiagnostics({
          response,
          responsePayload,
          requestId: responseRequestId
        });
        console.info("[practice:score] score_api_done", {
          taskType: normalizedTaskType,
          questionId: normalizedQuestionId,
          scoreApiMs,
          scoreErrorCode: "",
          status: scoreApiStatus,
          request_id: responseRequestId
        });

        if (
          (response.status === 403 || response.status === 429) &&
          (data?.error === "access_expired" || data?.error === "daily_limit_reached")
        ) {
          this.result = {
            error: "access_expired",
            message: data.message || "当前账号未开通 AI 评阅，请开通 VIP 或使用试用权限。"
          };
          this.phase = "limited";
          await authStore.loadStatus();
          router.push("/limit");
          return this.result;
        }

        if (response.status === 401) {
          if (normalizedTaskType === "WE") {
            this.result = null;
            this.phase = "idle";
            return buildWESubmitErrorResult({
              error: "auth_session_expired",
              scoreErrorCode: "AUTH_SESSION_EXPIRED",
              scoreApiMs,
              status: scoreApiStatus,
              requestId: responseRequestId,
              submitSeq,
              submissionDebug,
              diagnostics: {
                ...responseDiagnostics,
                failure_type: "auth_error"
              }
            });
          }

          await authStore.logout();
          router.push("/auth");
          return null;
        }

        let normalizedResult = null;
        if (!response.ok) {
          if (data && typeof data === "object" && (data.scores || data.traits || typeof data.status === "string")) {
            normalizedResult = normalizeScoreData(data, taskType);
          } else {
            const responseError = new Error(`Score API failed with status ${response.status}`);
            responseError.code = getScoreApiErrorCode({
              status: response.status,
              isHtml: responsePayload.isHtml
            });
            responseError.diagnostics = {
              ...responseDiagnostics,
              score_error_code: responseError.code,
              failure_type: "http_error"
            };
            throw responseError;
          }
        }

        if (!normalizedResult) {
          normalizedResult = normalizeScoreData(data || {}, taskType);
        }

        this.result = {
          ...normalizedResult,
          submitted_word_count: submissionDebug.submitted_word_count,
          submitted_excerpt: submissionDebug.submitted_excerpt,
          submitted_text_hash: submissionDebug.submitted_text_hash,
          reviewed_at: new Date().toISOString(),
          meta: {
            scoreApiMs,
            scoreErrorCode: "",
            status: scoreApiStatus,
            statusText: responseDiagnostics.statusText,
            contentType: responseDiagnostics.contentType,
            request_id: responseRequestId,
            submit_seq: submitSeq
          }
        };
        this.phase = "done";
        decrementRemainingOnce();

        if (session?.user?.id) {
          const currentTranscript = this.transcript;
          const currentQuestionContent = this.questionContent;
          const currentResult = this.result;
          const currentAudioBlob = this.audioBlob;
          const currentTaskType = normalizedTaskType;
          const currentUserId = session.user.id;

          void (async () => {
            const logStartedAt = getNowMs();
            const audioMeta = await uploadPracticeAudioForRA({
              taskType: currentTaskType,
              userId: currentUserId,
              questionId: normalizedQuestionId,
              blob: currentAudioBlob
            });
            const scoreJson = buildPracticeLogScoreJson({
              taskType: currentTaskType,
              result: currentResult,
              questionId: normalizedQuestionId,
              questionContent: currentQuestionContent,
              audioMeta
            });
            const payload = {
              user_id: currentUserId,
              task_type: currentTaskType,
              question_id: normalizedQuestionId,
              transcript: currentTranscript,
              score_json: scoreJson,
              feedback: currentResult?.feedback || ""
            };
            const { error: insertError } = await supabase.from("practice_logs").insert(payload);
            const practiceLogMs = getElapsedMs(logStartedAt);

            if (insertError) {
              console.warn("practice_logs insert error:", insertError, {
                taskType: normalizedTaskType,
                questionId: normalizedQuestionId,
                practiceLogMs
              });
              return;
            }

            console.info("[practice:score] practice_logs_insert_done", {
              taskType: normalizedTaskType,
              questionId: normalizedQuestionId,
              practiceLogMs,
              hasAudio: Boolean(audioMeta?.path)
            });
          })();
        }

        return this.result;
      } catch (error) {
        const scoreApiMs = getElapsedMs(scoreApiStartedAt);
        const scoreErrorCode =
          error?.name === "AbortError"
            ? "SCORE_API_TIMEOUT"
            : isScoreApiKnownErrorCode(error?.code)
              ? error.code
              : "SCORE_API_FAILED";
        const failureType = resolveScoreFailureType(error, scoreErrorCode);
        const diagnostics = normalizeScoreApiDiagnostics(error?.diagnostics, {
          requestId: clientRequestId,
          status: scoreApiStatus,
          scoreErrorCode,
          failureType
        });
        console.error("Score API failed:", {
          error,
          taskType: normalizedTaskType,
          questionId: normalizedQuestionId,
          scoreApiMs,
          scoreErrorCode,
          status: scoreApiStatus,
          scoreApiUrl,
          request_id: diagnostics.request_id,
          failure_type: diagnostics.failure_type,
          diagnostics
        });

        if (normalizedTaskType === "WE") {
          this.result = null;
          this.phase = "idle";
          return buildWESubmitErrorResult({
            error: "score_request_failed",
            scoreErrorCode,
            scoreApiMs,
            status: diagnostics.status,
            requestId: diagnostics.request_id || clientRequestId,
            submitSeq,
            submissionDebug,
            diagnostics
          });
        }

        this.result = {
          ...buildFallbackResult(taskType),
          meta: {
            scoreApiMs,
            scoreErrorCode,
            status: scoreApiStatus
          }
        };
        this.phase = "done";
        return this.result;
      }
    }
  }
});

function normalizeScoreData(data, taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return normalizeWEScoreData(data);
  }

  const pronunciation =
    normalizedTaskType === "RA" ? clampRAScore(data?.scores?.pronunciation) : clampScore(data?.scores?.pronunciation);
  const fluency = normalizedTaskType === "RA" ? clampRAScore(data?.scores?.fluency) : clampScore(data?.scores?.fluency);
  const content = normalizedTaskType === "RA" ? clampRAScore(data?.scores?.content) : clampScore(data?.scores?.content);
  const overall =
    normalizedTaskType === "RA"
      ? clampRAOverall(data?.overall)
      : clampOverall(data?.overall, Math.round((pronunciation + fluency + content) / 3));
  const feedback = typeof data?.feedback === "string" && data.feedback.trim()
    ? data.feedback.trim()
    : "这次练习已完成，继续保持。";

  return {
    scores: {
      pronunciation,
      fluency,
      content
    },
    keywords: normalizeKeywords(data?.keywords),
    feedback,
    overall
  };
}

function normalizeWEScoreData(data) {
  const gateTriggered = Boolean(data?.gate?.triggered);
  const reasonCodes = Array.isArray(data?.gate?.reason_codes)
    ? data.gate.reason_codes.map((item) => `${item || ""}`.trim()).filter(Boolean)
    : [];
  const status = normalizeWEStatus(data?.status, {
    gateTriggered,
    reasonCodes
  });
  const isAiReviewDegraded = status === WE_STATUS_AI_DEGRADED;
  const traitStatus = status === WE_STATUS_SCORED ? WE_STATUS_SCORED : "";
  const formScore = clampRange(data?.traits?.form?.score, 0, 2);
  const contentScore = clampRange(data?.traits?.content?.score, 0, 6);
  const traits = {
    content: { score: contentScore, max: 6 },
    form: { score: formScore, max: 2 },
    development_structure_coherence: normalizeTraitObject(data?.traits?.development_structure_coherence, 6, traitStatus),
    grammar: normalizeTraitObject(data?.traits?.grammar, 2, traitStatus),
    general_linguistic_range: normalizeTraitObject(data?.traits?.general_linguistic_range, 6, traitStatus),
    vocabulary_range: normalizeTraitObject(data?.traits?.vocabulary_range, 2, traitStatus),
    spelling: normalizeTraitObject(data?.traits?.spelling, 2, traitStatus)
  };

  const rawTotal = status !== WE_STATUS_SCORED
    ? 0
    : clampRange(
      data?.raw_total,
      0,
      WE_RAW_MAX
    );

  const overallEstimated = status !== WE_STATUS_SCORED
    ? 0
    : clampRange(
      data?.overall_estimated,
      0,
      90,
      Math.round(((Number(rawTotal || 0)) / WE_RAW_MAX) * 90)
    );

  const visibleSummary = normalizeWESummary(data?.visible_summary, {
    gateTriggered,
    overallEstimated,
    reasonCodes
  });
  const feedback = normalizeZhText(data?.feedback, visibleSummary.final_comment);

  return {
    taskType: "WE",
    status,
    is_ai_review_degraded: isAiReviewDegraded,
    is_estimated: true,
    review_label: resolveWEReviewLabel(data?.review_label, status),
    raw_total: rawTotal,
    raw_max: WE_RAW_MAX,
    overall_estimated: overallEstimated,
    traits,
    gate: {
      triggered: gateTriggered,
      reason_codes: reasonCodes
    },
    provider_used: `${data?.provider_used || "none"}`.trim() || "none",
    fallback_reason: data?.fallback_reason ?? null,
    error_stage: `${data?.error_stage || ""}`.trim() || "",
    raw_error_type: `${data?.raw_error_type || ""}`.trim() || "",
    visible_summary: visibleSummary,
    feedback,
    gate_reason_messages_zh: reasonCodes.map((code) => mapGateReasonCodeToZh(code)).filter(Boolean)
  };
}

function normalizeTaskType(taskType) {
  if (typeof taskType !== "string") return "";
  return taskType.trim().toUpperCase();
}

function normalizeWEStatus(rawStatus, { gateTriggered = false, reasonCodes = [] } = {}) {
  const normalizedReasonCodes = Array.isArray(reasonCodes)
    ? reasonCodes.map((item) => `${item || ""}`.trim()).filter(Boolean)
    : [];
  if (normalizedReasonCodes.includes(WE_AI_FALLBACK_REASON_CODE)) {
    return WE_STATUS_AI_DEGRADED;
  }

  const normalizedStatus = `${rawStatus || ""}`.trim().toLowerCase();
  if (normalizedStatus === WE_STATUS_AI_DEGRADED) return WE_STATUS_AI_DEGRADED;
  if (normalizedStatus === WE_STATUS_RULE_GATED) return WE_STATUS_RULE_GATED;
  if (normalizedStatus === WE_STATUS_SCORED) return WE_STATUS_SCORED;
  if (gateTriggered) return WE_STATUS_RULE_GATED;
  return WE_STATUS_SCORED;
}

function resolveWEReviewLabel(rawLabel, status) {
  const normalizedLabel = `${rawLabel || ""}`.trim();
  if (normalizedLabel) return normalizedLabel;
  if (status === WE_STATUS_AI_DEGRADED) return "AI评阅（降级）";
  if (status === WE_STATUS_RULE_GATED) return "规则判定（未进入AI评阅）";
  return WE_REVIEW_LABEL;
}

function buildFallbackResult(taskType) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return {
      taskType: "WE",
      status: WE_STATUS_RULE_GATED,
      is_ai_review_degraded: false,
      is_estimated: true,
      review_label: WE_REVIEW_LABEL,
      raw_total: 0,
      raw_max: WE_RAW_MAX,
      overall_estimated: 0,
      traits: {
        content: { score: 0, max: 6 },
        form: { score: 0, max: 2 },
        development_structure_coherence: null,
        grammar: null,
        general_linguistic_range: null,
        vocabulary_range: null,
        spelling: null
      },
      gate: {
        triggered: true,
        reason_codes: ["content_zero_no_meaningful_response"]
      },
      provider_used: "none",
      fallback_reason: null,
      visible_summary: {
        level: WE_GATE_LEVEL,
        strengths: [],
        improvements: [
          "请先满足作文长度与基本格式要求。",
          "请确保回应题目且填写完整内容。"
        ],
        final_comment: "本次作文触发基础规则限制，系统已给出低分估分，请重写后再提交。"
      },
      feedback: "本次作文触发基础规则限制，系统已给出低分估分，请重写后再提交。",
      gate_reason_messages_zh: [mapGateReasonCodeToZh("content_zero_no_meaningful_response")]
    };
  }

  const fallback = {
    scores: {
      pronunciation: 65,
      fluency: 63,
      content: 67
    },
    feedback: "网络暂时不稳定，这是估算分数。你已经完成了练习，继续保持。",
    overall: 65
  };

  if (normalizedTaskType === "RS") {
    return {
      ...fallback,
      keywords: []
    };
  }

  return {
    ...fallback,
    keywords: []
  };
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(90, Math.round(num)));
}

function clampRAScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(num)));
}

function clampRAOverall(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return RA_MIN_SCORE;
  return Math.max(RA_MIN_SCORE, Math.min(RA_MAX_SCORE, Math.round(num)));
}

function clampOverall(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function normalizeKeywords(keywords) {
  if (!Array.isArray(keywords)) return [];
  return keywords
    .map((item) => ({
      word: typeof item?.word === "string" ? item.word : "",
      hit: Boolean(item?.hit)
    }))
    .filter((item) => item.word);
}

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function getElapsedMs(startAt) {
  return Math.max(0, Math.round(getNowMs() - startAt));
}

function buildPracticeLogScoreJson({ taskType, result, questionId, questionContent, audioMeta }) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WE") {
    return {
      status: `${result?.status || "scored"}`.trim() || "scored",
      traits: result?.traits || null,
      gate: result?.gate || { triggered: true, reason_codes: [] },
      raw_total: result?.raw_total ?? null,
      raw_max: WE_RAW_MAX,
      overall_estimated: result?.overall_estimated ?? null,
      provider_used: `${result?.provider_used || "none"}`.trim() || "none",
      fallback_reason: result?.fallback_reason ?? null,
      visible_summary: result?.visible_summary || null,
      request_id: `${result?.meta?.request_id || ""}`.trim() || "",
      submitted_word_count: Number(result?.submitted_word_count || 0),
      submitted_excerpt: `${result?.submitted_excerpt || ""}`.trim() || "",
      submitted_text_hash: `${result?.submitted_text_hash || ""}`.trim() || "",
      reviewed_at: `${result?.reviewed_at || ""}`.trim() || ""
    };
  }

  if (normalizedTaskType !== "RA") {
    return result?.scores || {};
  }

  const pronunciation = clampRAScore(result?.scores?.pronunciation);
  const fluency = clampRAScore(result?.scores?.fluency);
  const content = clampRAScore(result?.scores?.content);
  const overall = clampRAOverall(result?.overall);
  const snapshotContent = `${questionContent || ""}`.trim();

  return {
    scores: {
      pronunciation,
      fluency,
      content,
      overall
    },
    audio: audioMeta || null,
    questionSnapshot: {
      id: `${questionId || "unknown"}`.trim() || "unknown",
      content: snapshotContent,
      taskType: "RA"
    }
  };
}

async function uploadPracticeAudioForRA({ taskType, userId, questionId, blob }) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType !== "RA") return null;
  if (!userId) return null;
  if (!blob || Number(blob?.size || 0) <= 0) return null;

  const mimeType = normalizeMimeType(blob?.type);
  const ext = getAudioExtByMimeType(mimeType);
  const safeQuestionId = sanitizePathSegment(questionId || "unknown");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const path = `ra/${userId}/${timestamp}-${safeQuestionId}-${randomSuffix}.${ext}`;

  try {
    const { error } = await supabase.storage.from(PRACTICE_AUDIO_BUCKET).upload(path, blob, {
      contentType: mimeType || "application/octet-stream",
      upsert: false
    });

    if (error) {
      console.warn("RA audio upload failed:", error, {
        path,
        mimeType,
        size: Number(blob?.size || 0)
      });
      return null;
    }

    return {
      bucket: PRACTICE_AUDIO_BUCKET,
      path,
      mimeType: mimeType || "",
      size: Number(blob?.size || 0),
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn("RA audio upload error:", error, {
      path,
      mimeType,
      size: Number(blob?.size || 0)
    });
    return null;
  }
}

function sanitizePathSegment(value) {
  const cleaned = `${value || ""}`
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  return cleaned || "unknown";
}

function normalizeMimeType(value) {
  return `${value || ""}`.trim().toLowerCase();
}

function getAudioExtByMimeType(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

async function safeReadResponse(response) {
  const contentType = `${response?.headers?.get?.("content-type") || ""}`.toLowerCase();
  try {
    const rawText = await response.text();
    const trimmedText = `${rawText || ""}`.trim();
    if (!trimmedText) {
      return {
        data: null,
        isHtml: false,
        contentType,
        rawText: ""
      };
    }

    let data = null;
    try {
      data = JSON.parse(trimmedText);
    } catch {
      data = null;
    }

    return {
      data,
      isHtml: isLikelyHtmlResponse(trimmedText, contentType),
      contentType,
      rawText: trimmedText.slice(0, 1200)
    };
  } catch {
    return {
      data: null,
      isHtml: false,
      contentType,
      rawText: ""
    };
  }
}

function isLikelyHtmlResponse(text, contentType = "") {
  if (`${contentType || ""}`.includes("text/html")) return true;
  return /^<!doctype html/i.test(text) || /^<html/i.test(text) || text.includes("<html");
}

function getScoreApiErrorCode({ status, isHtml = false } = {}) {
  if (Number(status) === 404) {
    return isHtml ? "SCORE_API_ROUTE_NOT_FOUND_HTML" : "SCORE_API_ROUTE_NOT_FOUND";
  }
  if (isHtml) return "SCORE_API_UNEXPECTED_HTML";
  return "SCORE_API_HTTP_ERROR";
}

function isScoreApiKnownErrorCode(code) {
  return [
    "SCORE_API_HTTP_ERROR",
    "SCORE_API_ROUTE_NOT_FOUND",
    "SCORE_API_ROUTE_NOT_FOUND_HTML",
    "SCORE_API_UNEXPECTED_HTML"
  ].includes(`${code || ""}`);
}

function normalizeTraitObject(value, max, status) {
  if (status !== WE_STATUS_SCORED) return null;
  return {
    score: clampRange(value?.score, 0, max),
    max
  };
}

function normalizeWESummary(value, { gateTriggered = false, overallEstimated = 0, reasonCodes = [] } = {}) {
  const fallbackStrengths = ["结构基本完整，主题方向较明确。", "主要观点能够被理解。"];
  const fallbackImprovements = ["补充更具体的论据和展开细节。", "提交前检查语法与拼写错误。"];
  const normalizedReasonCodes = Array.isArray(reasonCodes)
    ? reasonCodes.map((item) => `${item || ""}`.trim()).filter(Boolean)
    : [];

  if (gateTriggered) {
    const isAiFallbackGate = normalizedReasonCodes.includes(WE_AI_FALLBACK_REASON_CODE);
    if (isAiFallbackGate) {
      return {
        level: normalizeZhText(value?.level, WE_AI_FALLBACK_LEVEL),
        strengths: [],
        improvements: normalizeZhList(value?.improvements, WE_AI_FALLBACK_IMPROVEMENTS),
        final_comment: normalizeZhText(
          value?.final_comment || value?.finalComment,
          WE_AI_FALLBACK_FINAL_COMMENT
        )
      };
    }

    return {
      level: WE_GATE_LEVEL,
      strengths: [],
      improvements: ["请先满足作文长度与基本格式要求。", "请确保回应题目且填写完整内容。"],
      final_comment: "本次作文触发基础规则限制，系统已给出低分估分，请重写后再提交。"
    };
  }

  const strengths = normalizeZhList(value?.strengths, fallbackStrengths);
  const improvements = normalizeZhList(value?.improvements, fallbackImprovements);

  return {
    level: normalizeZhLevel(value?.level, overallEstimated),
    strengths,
    improvements,
    final_comment: normalizeZhText(
      value?.final_comment || value?.finalComment,
      "本次为AI估分结果，请根据改进建议持续优化作文表达。"
    )
  };
}

function normalizeZhList(items, fallbackItems) {
  const normalized = [];
  for (let i = 0; i < 2; i += 1) {
    const candidate = normalizeZhText(Array.isArray(items) ? items[i] : "", fallbackItems[i] || "");
    if (candidate) {
      normalized.push(candidate);
    }
  }
  return normalized.length ? normalized : fallbackItems.slice(0, 2);
}

function normalizeZhLevel(value, overallEstimated) {
  const raw = `${value || ""}`.trim();
  if (containsChinese(raw)) return raw;

  const lower = raw.toLowerCase();
  if (lower.includes("strong")) return "较强";
  if (lower.includes("fair")) return "中等";
  if (lower.includes("develop")) return "需提升";
  if (lower.includes("rewrite") || lower.includes("not scored")) return WE_GATE_LEVEL;

  if (overallEstimated >= 78) return "较强";
  if (overallEstimated >= 60) return "中等";
  return "需提升";
}

function normalizeZhText(value, fallback) {
  const text = `${value || ""}`.trim();
  if (containsChinese(text)) return text;
  return `${fallback || ""}`.trim();
}

function containsChinese(value) {
  return /[\u4e00-\u9fff]/.test(`${value || ""}`);
}

function mapGateReasonCodeToZh(code) {
  const map = {
    form_zero_word_count_too_short: "作文字数过少，未达到 WE 最低长度要求。",
    form_zero_word_count_too_long: "作文字数过多，超出 WE 推荐长度范围。",
    form_zero_all_caps: "全文大写会被判定为格式不合规。",
    form_zero_missing_punctuation: "标点过少，句子边界不清晰。",
    form_zero_bullets_or_fragmented_sentences: "内容过于碎片化或使用了项目符号，影响作文结构。",
    content_zero_off_topic: "内容与题目关联度不足，存在离题风险。",
    content_zero_template_not_filled: "模板占位内容未替换，作文未完成。",
    content_zero_no_meaningful_response: "有效内容不足，无法形成可评阅作文。",
    ai_review_unavailable: WE_AI_FALLBACK_FINAL_COMMENT
  };

  return map[`${code || ""}`.trim()] || "本次作文触发规则限制，请根据建议重写后再提交。";
}

function clampRange(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function buildWESubmitErrorResult({
  error = "score_request_failed",
  scoreErrorCode = "",
  scoreApiMs = 0,
  status = 0,
  requestId = "",
  submitSeq = 0,
  submissionDebug,
  diagnostics
} = {}) {
  const normalizedDiagnostics = normalizeScoreApiDiagnostics(diagnostics, {
    requestId,
    status,
    scoreErrorCode
  });

  return {
    error,
    submitted_word_count: Number(submissionDebug?.submitted_word_count || 0),
    submitted_excerpt: `${submissionDebug?.submitted_excerpt || ""}`.trim(),
    submitted_text_hash: `${submissionDebug?.submitted_text_hash || ""}`.trim(),
    reviewed_at: new Date().toISOString(),
    meta: {
      scoreApiMs: Math.max(0, Math.round(Number(scoreApiMs || 0))),
      scoreErrorCode: `${scoreErrorCode || normalizedDiagnostics.score_error_code || ""}`.trim(),
      status: normalizedDiagnostics.status,
      statusText: normalizedDiagnostics.statusText,
      contentType: normalizedDiagnostics.contentType,
      request_id: normalizedDiagnostics.request_id,
      submit_seq: Number(submitSeq || 0),
      failure_type: normalizedDiagnostics.failure_type,
      is_http_error: normalizedDiagnostics.is_http_error,
      is_fetch_failed: normalizedDiagnostics.is_fetch_failed,
      backend_error: normalizedDiagnostics.backend_error,
      backend_code: normalizedDiagnostics.backend_code,
      backend_meta: normalizedDiagnostics.backend_meta
    }
  };
}

function resolveResponseRequestId({ responseData, clientRequestId } = {}) {
  const responseRequestId = `${responseData?.request_id || ""}`.trim();
  if (responseRequestId) return responseRequestId;
  return `${clientRequestId || ""}`.trim();
}

function buildScoreApiDiagnostics({
  response,
  responsePayload,
  requestId = "",
  scoreErrorCode = "",
  failureType = ""
} = {}) {
  const responseData = responsePayload?.data;
  return normalizeScoreApiDiagnostics(
    {
      request_id: requestId,
      status: Number(response?.status || 0),
      statusText: `${response?.statusText || ""}`.trim(),
      contentType: `${responsePayload?.contentType || ""}`.trim().toLowerCase(),
      score_error_code: `${scoreErrorCode || ""}`.trim(),
      failure_type: `${failureType || ""}`.trim(),
      backend_error: normalizeOptionalText(responseData?.error),
      backend_code: normalizeOptionalText(responseData?.code ?? responseData?.error_code),
      backend_meta: isPlainObject(responseData?.meta) ? responseData.meta : null,
      response_body_snippet: `${responsePayload?.rawText || ""}`.trim(),
      is_html: Boolean(responsePayload?.isHtml)
    },
    {
      requestId,
      status: Number(response?.status || 0),
      scoreErrorCode,
      failureType
    }
  );
}

function normalizeScoreApiDiagnostics(diagnostics, fallback = {}) {
  const safe = isPlainObject(diagnostics) ? diagnostics : {};
  const scoreErrorCode = `${safe.score_error_code || fallback.scoreErrorCode || ""}`.trim();
  const failureType = normalizeFailureType(
    `${safe.failure_type || fallback.failureType || resolveFailureTypeFromScoreError(scoreErrorCode)}`.trim()
  );
  const statusNumber = Number(safe.status ?? fallback.status ?? 0);
  const status = Number.isFinite(statusNumber) ? Math.max(0, Math.round(statusNumber)) : 0;
  const requestId = `${safe.request_id || fallback.requestId || ""}`.trim();
  const statusText = `${safe.statusText || safe.status_text || ""}`.trim();
  const contentType = `${safe.contentType || safe.content_type || ""}`.trim().toLowerCase();
  const backendError = normalizeOptionalText(safe.backend_error);
  const backendCode = normalizeOptionalText(safe.backend_code);
  const backendMeta = isPlainObject(safe.backend_meta) ? safe.backend_meta : null;
  const responseBodySnippet = `${safe.response_body_snippet || ""}`.trim().slice(0, 240);
  const isHttpError = status >= 400 || failureType === "http_error" || failureType === "auth_error";
  const isFetchFailed = failureType === "fetch_failed" || failureType === "timeout";

  return {
    request_id: requestId,
    status,
    statusText,
    contentType,
    score_error_code: scoreErrorCode,
    failure_type: failureType,
    is_http_error: isHttpError,
    is_fetch_failed: isFetchFailed,
    backend_error: backendError,
    backend_code: backendCode,
    backend_meta: backendMeta,
    response_body_snippet: responseBodySnippet,
    is_html: Boolean(safe.is_html)
  };
}

function resolveScoreFailureType(error, scoreErrorCode) {
  const normalizedCode = `${scoreErrorCode || ""}`.trim();
  if (error?.name === "AbortError" || normalizedCode === "SCORE_API_TIMEOUT") return "timeout";
  if (normalizedCode === "AUTH_SESSION_MISSING" || normalizedCode === "AUTH_SESSION_EXPIRED") return "auth_error";
  if (isScoreApiKnownErrorCode(error?.code) || isScoreApiKnownErrorCode(normalizedCode)) return "http_error";
  return "fetch_failed";
}

function resolveFailureTypeFromScoreError(scoreErrorCode) {
  const normalizedCode = `${scoreErrorCode || ""}`.trim();
  if (!normalizedCode) return "unknown";
  if (normalizedCode === "SCORE_API_TIMEOUT") return "timeout";
  if (normalizedCode === "AUTH_SESSION_MISSING" || normalizedCode === "AUTH_SESSION_EXPIRED") return "auth_error";
  if (isScoreApiKnownErrorCode(normalizedCode)) return "http_error";
  if (normalizedCode === "SCORE_API_FAILED") return "fetch_failed";
  return "unknown";
}

function normalizeFailureType(value) {
  const normalized = `${value || ""}`.trim().toLowerCase();
  if (normalized === "timeout") return "timeout";
  if (normalized === "http_error") return "http_error";
  if (normalized === "fetch_failed") return "fetch_failed";
  if (normalized === "auth_error") return "auth_error";
  return normalized || "unknown";
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) return "";
  return `${value}`.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildSubmissionDebugInfo(transcript) {
  const safeText = `${transcript || ""}`.trim();
  const words = safeText ? safeText.split(/\s+/).filter(Boolean) : [];
  const excerpt = safeText.slice(0, 180);
  const hash = hashText(safeText);

  return {
    submitted_word_count: words.length,
    submitted_excerpt: excerpt,
    submitted_text_hash: hash
  };
}

function hashText(text) {
  let hash = 2166136261;
  const normalized = `${text || ""}`;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createRequestId(prefix = "req") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}



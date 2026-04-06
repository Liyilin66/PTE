import { defineStore } from "pinia";
import router from "@/router";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

const RA_MIN_SCORE = 10;
const RA_MAX_SCORE = 90;
const SCORE_API_TIMEOUT_MS = 15000;
const PRACTICE_AUDIO_BUCKET = "practice-audio";

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

    async submitScore(taskType, transcript, questionContent, questionId) {
      this.phase = "processing";
      this.transcript = transcript || "";
      this.questionContent = questionContent || this.questionContent || "";

      const authStore = useAuthStore();
      const normalizedTaskType = normalizeTaskType(taskType);
      const normalizedQuestionId = questionId || this.currentQuestion?.id || "unknown";
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("getSession error:", sessionError);
      }

      const session = sessionData?.session || null;
      const token = session?.access_token || "";
      const scoreApiStartedAt = getNowMs();
      let scoreApiStatus = 0;
      let remainingDeducted = false;

      function decrementRemainingOnce() {
        if (remainingDeducted) return;
        authStore.decrementRemaining();
        remainingDeducted = true;
      }

      if (!token) {
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
          response = await fetch("/api/score", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              taskType,
              transcript,
              questionContent: this.questionContent,
              question_id: normalizedQuestionId
            }),
            signal: scoreAbortController?.signal
          });
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }

        scoreApiStatus = Number(response?.status || 0);
        const scoreApiMs = getElapsedMs(scoreApiStartedAt);
        const data = await safeReadJson(response);
        console.info("[practice:score] score_api_done", {
          taskType: normalizedTaskType,
          questionId: normalizedQuestionId,
          scoreApiMs,
          scoreErrorCode: "",
          status: scoreApiStatus
        });

        if (
          (response.status === 403 || response.status === 429) &&
          (data?.error === "access_expired" || data?.error === "daily_limit_reached")
        ) {
          this.result = {
            error: "access_expired",
            message: data.message || "当前账号未开通 AI 评分，请开通 VIP 或使用赠送试用权限。"
          };
          this.phase = "limited";
          await authStore.loadStatus();
          router.push("/limit");
          return this.result;
        }

        if (response.status === 401) {
          await authStore.logout();
          router.push("/auth");
          return null;
        }

        let normalizedResult = null;
        if (!response.ok) {
          if (data && typeof data === "object" && data.scores) {
            normalizedResult = normalizeScoreData(data, taskType);
          } else {
            const responseError = new Error(`Score API failed with status ${response.status}`);
            responseError.code = "SCORE_API_HTTP_ERROR";
            throw responseError;
          }
        }

        if (!normalizedResult) {
          normalizedResult = normalizeScoreData(data || {}, taskType);
        }

        this.result = {
          ...normalizedResult,
          meta: {
            scoreApiMs,
            scoreErrorCode: "",
            status: scoreApiStatus
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
            : error?.code === "SCORE_API_HTTP_ERROR"
              ? "SCORE_API_HTTP_ERROR"
              : "SCORE_API_FAILED";
        console.error("Score API failed:", {
          error,
          taskType: normalizedTaskType,
          questionId: normalizedQuestionId,
          scoreApiMs,
          scoreErrorCode,
          status: scoreApiStatus
        });
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
  const pronunciation =
    normalizedTaskType === "RA" ? clampRAScore(data?.scores?.pronunciation) : clampScore(data?.scores?.pronunciation);
  const fluency = normalizedTaskType === "RA" ? clampRAScore(data?.scores?.fluency) : clampScore(data?.scores?.fluency);
  const content = normalizedTaskType === "RA" ? clampRAScore(data?.scores?.content) : clampScore(data?.scores?.content);
  const overall =
    normalizedTaskType === "RA"
      ? clampRAOverall(data?.overall)
      : clampOverall(data?.overall, Math.round((pronunciation + fluency + content) / 3));
  const feedback = typeof data?.feedback === "string" && data.feedback.trim() ? data.feedback.trim() : "这次练习已经完成，继续保持。";

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

function normalizeTaskType(taskType) {
  if (typeof taskType !== "string") return "";
  return taskType.trim().toUpperCase();
}

function buildFallbackResult(taskType) {
  const fallback = {
    scores: {
      pronunciation: 65,
      fluency: 63,
      content: 67
    },
    feedback: "网络暂时不稳定，这是估算分数。你已经完成了练习，继续保持。",
    overall: 65
  };

  if (taskType === "RS") {
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

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

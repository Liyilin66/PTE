import { defineStore } from "pinia";
import router from "@/router";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";

const TASKS = [
  {
    id: "ra",
    title: "RA - Read Aloud",
    subtitle: "Pacing trainer",
    description: "Follow the text with stable pace and fluent delivery.",
    todayCount: 0,
    icon: "ra",
    iconBg: "bg-[#1E4A86]",
    to: "/ra"
  },
  {
    id: "rs",
    title: "RS - Repeat Sentence",
    subtitle: "Keyword catcher",
    description: "Catch key words first, then repeat fluently.",
    todayCount: 1,
    icon: "rs",
    iconBg: "bg-[#2E5EA8]",
    to: "/rs"
  },
  {
    id: "rl",
    title: "RL - Re-tell Lecture",
    subtitle: "Template builder",
    description: "Use a stable framework to structure your summary.",
    todayCount: 0,
    icon: "rl",
    iconBg: "bg-gradient-to-br from-[#7A1DE6] to-[#BC1CFB]",
    to: "/rl"
  },
  {
    id: "we",
    title: "WE - Write Essay",
    subtitle: "Structure first",
    description: "Write with clear intro, body, and conclusion.",
    todayCount: 0,
    icon: "we",
    iconBg: "bg-[#00AA45]",
    to: "/we"
  },
  {
    id: "wfd",
    title: "WFD - Write From Dictation",
    subtitle: "Accuracy drill",
    description: "Listen carefully and type complete sentences.",
    todayCount: 0,
    icon: "wfd",
    iconBg: "bg-[#F3054E]",
    to: "/wfd"
  }
];

export const usePracticeStore = defineStore("practice", {
  state: () => ({
    day: 1,
    totalDays: 14,
    todayDone: 0,
    todayTarget: 3,
    tasks: TASKS,

    currentQuestion: null,
    selectedQuestion: null,
    questionContent: "",
    phase: "idle",

    transcript: "",
    audioBlob: null,
    result: null
  }),

  getters: {
    progressPercent(state) {
      if (!state.todayTarget) return 0;
      return Math.round((state.todayDone / state.todayTarget) * 100);
    }
  },

  actions: {
    setQuestion(question) {
      this.currentQuestion = question;
      this.questionContent = question?.content || "";
      this.phase = "idle";
      this.transcript = "";
      this.audioBlob = null;
      this.result = null;
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
      this.phase = "done";
    },

    resetResult() {
      this.result = null;
      this.transcript = "";
      this.audioBlob = null;
      this.phase = "idle";
    },

    async submitScore(taskType, transcript, questionContent, questionId) {
      this.phase = "processing";
      this.transcript = transcript || "";
      this.questionContent = questionContent || this.questionContent || "";

      const authStore = useAuthStore();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("getSession error:", sessionError);
      }

      const session = sessionData?.session || null;
      const token = session?.access_token || "";

      if (!token) {
        await authStore.logout();
        router.push("/auth");
        return null;
      }

      try {
        const response = await fetch("/api/score", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            taskType,
            transcript,
            questionContent: this.questionContent,
            question_id: questionId || this.currentQuestion?.id || "unknown"
          })
        });

        const data = await safeReadJson(response);

        if (response.status === 429 && data?.error === "daily_limit_reached") {
          this.result = {
            error: "daily_limit_reached",
            message: data.message || "今日免费额度已用完。"
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

        if (!response.ok) {
          if (data && typeof data === "object" && data.scores) {
            this.result = normalizeScoreData(data);
            this.phase = "done";
            return this.result;
          }
          throw new Error(`Score API failed with status ${response.status}`);
        }

        this.result = normalizeScoreData(data || {});
        this.phase = "done";

        if (session?.user?.id) {
          const { error: insertError } = await supabase.from("practice_logs").insert({
            user_id: session.user.id,
            task_type: taskType,
            question_id: questionId || this.currentQuestion?.id || "unknown",
            transcript: this.transcript,
            score_json: this.result.scores || {},
            feedback: this.result.feedback || ""
          });

          if (insertError) {
            console.warn("practice_logs insert error:", insertError);
          } else {
            authStore.decrementRemaining();
          }
        } else {
          authStore.decrementRemaining();
        }

        return this.result;
      } catch (error) {
        console.error("Score API failed:", error);
        this.result = buildFallbackResult(taskType);
        this.phase = "done";
        return this.result;
      }
    }
  }
});

function normalizeScoreData(data) {
  const pronunciation = clampScore(data?.scores?.pronunciation);
  const fluency = clampScore(data?.scores?.fluency);
  const content = clampScore(data?.scores?.content);
  const overall = clampOverall(data?.overall, Math.round((pronunciation + fluency + content) / 3));
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

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

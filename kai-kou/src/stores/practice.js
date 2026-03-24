import { defineStore } from "pinia";

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
    phase: "idle",

    transcript: "",
    audioBlob: null,

    result: null,

    raPassage:
      "The Great Barrier Reef is the world's largest coral reef system, composed of over 2,900 individual reefs and 900 islands. It stretches for more than 2,300 kilometres and supports extraordinary biodiversity, including many vulnerable species.",
    rsPrompt: "Listen carefully. Repeat the sentence immediately after playback ends.",
    rsSentence:
      "Sustainable urban planning requires cooperation between local governments, private investors, and community organizations.",
    rlTemplate:
      "The lecture mainly discusses [TOPIC]. The speaker first mentions [POINT 1], then explains [POINT 2], and finally concludes that [CONCLUSION]."
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
      this.phase = "idle";
      this.transcript = "";
      this.audioBlob = null;
      this.result = null;
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

    async mockScore(taskType, transcript, meta = {}) {
      this.phase = "processing";
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const keywordHits = buildKeywordHits(meta.keywords || []);
      const pronunciation = randomBetween(60, 85);
      const fluency = randomBetween(58, 83);
      const content = randomBetween(62, 88);
      const coverageRate = keywordHits.length
        ? Math.round((keywordHits.filter((item) => item.hit).length / keywordHits.length) * 100)
        : randomBetween(50, 85);
      const overall = taskType === "RS" ? coverageRate : Math.round((pronunciation + fluency + content) / 3);

      const result = {
        taskType,
        transcript,
        overall,
        scores: {
          pronunciation,
          fluency,
          content
        },
        feedback: getMockFeedback(taskType),
        meta: {
          ...meta,
          keywordHits
        }
      };

      this.setResult(result);
      return result;
    }
  }
});

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getMockFeedback(taskType) {
  const feedbacks = {
    RA: [
      "Good pace. Keep stressing key nouns and maintain sentence endings.",
      "Strong fluency. Try a little more intonation contrast on longer clauses.",
      "Pronunciation is clear. Keep linking short function words naturally."
    ],
    RS: [
      "You captured key words well. Keep your response rhythm steady.",
      "Memory strategy is improving. Anchor the first and last chunks first.",
      "Nice confidence. Continue reducing pauses between phrase groups."
    ],
    RL: [
      "Good structure. Cover one more key point and connect ideas with transitions.",
      "Clear delivery. Mention topic, two details, and a short conclusion for higher content score."
    ]
  };

  const list = feedbacks[taskType] || feedbacks.RA;
  return list[Math.floor(Math.random() * list.length)];
}

function buildKeywordHits(keywords) {
  if (!keywords.length) return [];

  return keywords.map((word) => ({
    word,
    hit: Math.random() > 0.35
  }));
}

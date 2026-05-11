<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { fetchQuestions } from "@/lib/questions";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();

const allQuestions = ref([]);
const practiceLogs = ref([]);
const practiceLogsError = ref("");
const loading = ref(true);
const searchText = ref("");
const selectedDifficulty = ref("all");
const selectedStatus = ref("all");
const sortDescending = ref(true);
const favoriteIds = ref(new Set());
const practiceOrder = ref("sequence");
const playbackCount = ref("single");
const autoPlay = ref("on");

const preferredRecommendationIds = ["WFD_020", "WFD_054", "WFD_061"];

onMounted(async () => {
  loading.value = true;

  try {
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    loadFavorites();
    await Promise.allSettled([loadQuestions(), loadPracticeLogs()]);
  } finally {
    loading.value = false;
  }
});

async function loadQuestions() {
  allQuestions.value = await fetchQuestions("WFD");
}

async function loadPracticeLogs() {
  const userId = authStore.user?.id || authStore.session?.user?.id;
  if (!userId) {
    practiceLogs.value = [];
    practiceLogsError.value = "";
    return;
  }

  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, question_id, transcript, score_json, feedback, created_at")
      .eq("user_id", userId)
      .eq("task_type", "WFD")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      practiceLogs.value = [];
      practiceLogsError.value = error.message || "practice_logs unavailable";
      console.warn("WFD practice_logs read error:", error);
      return;
    }

    practiceLogs.value = Array.isArray(data) ? data : [];
    practiceLogsError.value = "";
  } catch (error) {
    practiceLogs.value = [];
    practiceLogsError.value = error?.message || "practice_logs unavailable";
    console.warn("WFD practice_logs read failed:", error);
  }
}

const normalizedQuestions = computed(() => {
  return allQuestions.value.map((question, index) => {
    const id = normalizeText(question?.id) || `WFD_${String(index + 1).padStart(3, "0")}`;
    const content = getQuestionText(question);
    const wordCount = getWordCount(question);
    const difficulty = resolveDifficulty(question, wordCount);

    return {
      ...(question || {}),
      id,
      content,
      wordCount,
      estimatedSeconds: estimateSeconds(question, wordCount),
      difficulty,
      difficultyLabel: getDifficultyLabel(difficulty),
      difficultyClass: getDifficultyClass(difficulty),
      sortIndex: index,
      updatedAtMs: getQuestionUpdatedAtMs(question)
    };
  });
});

const questionMap = computed(() => {
  return new Map(normalizedQuestions.value.map((item) => [item.id, item]));
});

const normalizedLogs = computed(() => {
  return practiceLogs.value
    .map((log) => {
      const questionId = normalizeText(log?.question_id);
      const scoreJson = parseScoreJson(log?.score_json);
      const scorePercent = resolveWfdScorePercent(scoreJson);
      const createdAt = parseDate(log?.created_at);

      return {
        ...(log || {}),
        questionId,
        question: questionMap.value.get(questionId) || null,
        scoreJson,
        scorePercent,
        createdAt,
        createdAtMs: createdAt?.getTime() || 0
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);
});

const logsByQuestionId = computed(() => {
  const groups = new Map();

  normalizedLogs.value.forEach((log) => {
    if (!log.questionId) return;
    const group = groups.get(log.questionId) || [];
    group.push(log);
    groups.set(log.questionId, group);
  });

  return groups;
});

const practicedIds = computed(() => new Set([...logsByQuestionId.value.keys()]));

const latestLogByQuestionId = computed(() => {
  const map = new Map();

  logsByQuestionId.value.forEach((logs, id) => {
    if (logs.length) map.set(id, logs[0]);
  });

  return map;
});

const difficultyCounts = computed(() => {
  return normalizedQuestions.value.reduce(
    (counts, question) => {
      counts.all += 1;
      counts[question.difficulty] += 1;
      return counts;
    },
    { all: 0, easy: 0, medium: 0, hard: 0 }
  );
});

const statusCounts = computed(() => {
  const total = normalizedQuestions.value.length;
  const practiced = practicedIds.value.size;
  const unpracticed = Math.max(0, total - practiced);
  const needImprove = normalizedQuestions.value.filter((question) => isNeedImprove(question.id)).length;

  return {
    all: total,
    unpracticed,
    practiced,
    improve: needImprove,
    favorites: favoriteIds.value.size
  };
});

const hasRealLogs = computed(() => normalizedLogs.value.length > 0);

const statsCards = computed(() => {
  const recentAverage = hasRealLogs.value
    ? formatScore90(average(normalizedLogs.value.map((item) => item.scorePercent)))
    : "--";
  const practiced = statusCounts.value.practiced;
  const unpracticed = statusCounts.value.unpracticed;

  return [
    { label: "近期均分", value: recentAverage },
    { label: "已练题数", value: formatInteger(practiced) },
    { label: "未练题数", value: formatInteger(unpracticed) }
  ];
});

const statusFilters = computed(() => [
  { value: "all", label: "所有状态", count: statusCounts.value.all, icon: "▣", color: "cream" },
  { value: "unpracticed", label: "未练习", count: statusCounts.value.unpracticed, icon: "", color: "blue" },
  { value: "practiced", label: "已练习", count: statusCounts.value.practiced, icon: "✓", color: "green" },
  { value: "improve", label: "需加强", count: statusCounts.value.improve, icon: "!", color: "orange" },
  { value: "favorites", label: "已收藏", count: statusCounts.value.favorites, icon: "★", color: "brown" }
]);

const difficultyOptions = computed(() => [
  { value: "all", label: "全部难度", count: difficultyCounts.value.all, icon: "▣", tone: "all" },
  { value: "easy", label: "简单", count: difficultyCounts.value.easy, icon: "★", tone: "easy" },
  { value: "medium", label: "中等", count: difficultyCounts.value.medium, icon: "★", tone: "medium" },
  { value: "hard", label: "困难", count: difficultyCounts.value.hard, icon: "★", tone: "hard" }
]);

const filteredQuestions = computed(() => {
  const keyword = searchText.value.trim().toLowerCase();

  let list = normalizedQuestions.value.filter((question) => {
    if (selectedDifficulty.value !== "all" && question.difficulty !== selectedDifficulty.value) return false;

    if (selectedStatus.value === "unpracticed" && practicedIds.value.has(question.id)) return false;
    if (selectedStatus.value === "practiced" && !practicedIds.value.has(question.id)) return false;
    if (selectedStatus.value === "improve" && !isNeedImprove(question.id)) return false;
    if (selectedStatus.value === "favorites" && !favoriteIds.value.has(question.id)) return false;

    if (!keyword) return true;

    return [
      question.id,
      question.content,
      question.topic,
      question.category,
      question.source_number_label,
      question.source_ref_id,
      Array.isArray(question.key_points) ? question.key_points.join(" ") : ""
    ]
      .filter(Boolean)
      .some((item) => normalizeText(item).toLowerCase().includes(keyword));
  });

  list = [...list].sort(compareQuestionsByRecentUpdate);
  if (!sortDescending.value) list.reverse();
  return list;
});

const cardItems = computed(() => filteredQuestions.value.map((question, index) => buildQuestionCard(question, index)));

const recommendedQuestions = computed(() => {
  const byPreferredId = preferredRecommendationIds
    .map((id) => questionMap.value.get(id))
    .filter(Boolean);

  const alreadyPicked = new Set(byPreferredId.map((item) => item.id));
  const ruleRanked = [...normalizedQuestions.value]
    .filter((question) => !alreadyPicked.has(question.id))
    .sort(compareQuestionsForRecommendation);

  return [...byPreferredId, ...ruleRanked].slice(0, 3);
});

const recommendationItems = computed(() => {
  return recommendedQuestions.value.map((question) => ({
    id: question.id,
    difficulty: question.difficultyLabel,
    words: question.wordCount,
    question
  }));
});

const distributionItems = computed(() => {
  const total = Math.max(1, difficultyCounts.value.all);
  return [
    { key: "easy", label: "简单", count: difficultyCounts.value.easy, percent: Math.round((difficultyCounts.value.easy / total) * 100) },
    { key: "medium", label: "中等", count: difficultyCounts.value.medium, percent: Math.round((difficultyCounts.value.medium / total) * 100) },
    { key: "hard", label: "困难", count: difficultyCounts.value.hard, percent: Math.round((difficultyCounts.value.hard / total) * 100) }
  ];
});

const practiceStages = [
  {
    title: "新手阶段",
    text: "从简单题开始，建立基础语感和节奏感，培养自信心。",
    color: "green"
  },
  {
    title: "提升阶段",
    text: "主攻中等题，集中突破流利度和语句组织能力。",
    color: "orange"
  },
  {
    title: "冲刺阶段",
    text: "攻克困难题，应对考试高压和长句挑战。",
    color: "red"
  }
];

function buildQuestionCard(question) {
  const logs = logsByQuestionId.value.get(question.id) || [];
  const latestLog = logs[0] || null;

  return {
    ...question,
    myScore: latestLog ? formatScore10(latestLog.scorePercent) : "--",
    history: logs.length ? logs.slice(0, 3).map(formatHistoryLog) : [],
    historyUnavailable: Boolean(practiceLogsError.value),
    isFavorite: favoriteIds.value.has(question.id)
  };
}

function compareQuestionsByRecentUpdate(a, b) {
  if (a.updatedAtMs || b.updatedAtMs) {
    if (a.updatedAtMs !== b.updatedAtMs) return b.updatedAtMs - a.updatedAtMs;
  }

  const idOrder = getIdSortValue(a.id) - getIdSortValue(b.id);
  return idOrder || a.sortIndex - b.sortIndex;
}

function compareQuestionsForRecommendation(a, b) {
  const aPracticed = practicedIds.value.has(a.id) ? 1 : 0;
  const bPracticed = practicedIds.value.has(b.id) ? 1 : 0;
  if (aPracticed !== bPracticed) return aPracticed - bPracticed;

  const aNeedImprove = isNeedImprove(a.id) ? 0 : 1;
  const bNeedImprove = isNeedImprove(b.id) ? 0 : 1;
  if (aNeedImprove !== bNeedImprove) return aNeedImprove - bNeedImprove;

  const difficultyOrder = { medium: 0, easy: 1, hard: 2 };
  if (difficultyOrder[a.difficulty] !== difficultyOrder[b.difficulty]) {
    return difficultyOrder[a.difficulty] - difficultyOrder[b.difficulty];
  }

  return a.wordCount - b.wordCount || a.sortIndex - b.sortIndex;
}

function isNeedImprove(questionId) {
  const latest = latestLogByQuestionId.value.get(questionId);
  return Boolean(latest && latest.scorePercent > 0 && latest.scorePercent < 80);
}

function selectStatus(value) {
  selectedStatus.value = value;
}

function selectDifficulty(value) {
  selectedDifficulty.value = value;
}

function toggleSortDirection() {
  sortDescending.value = !sortDescending.value;
}

function setPracticeOrder(value) {
  practiceOrder.value = value;
}

function setPlaybackCount(value) {
  playbackCount.value = value;
}

function setAutoPlay(value) {
  autoPlay.value = value;
}

function startPractice(question) {
  if (question) {
    practiceStore.setSelectedQuestion({
      ...(question || {}),
      taskType: "WFD",
      task_type: "WFD"
    });
  }

  router.push("/wfd/practice");
}

function startFilteredPractice() {
  const pool = filteredQuestions.value.length ? filteredQuestions.value : normalizedQuestions.value;
  const question = practiceOrder.value === "random" ? pickRandom(pool) : pool[0];
  startPractice(question || null);
}

function toggleFavorite(questionId) {
  const next = new Set(favoriteIds.value);
  if (next.has(questionId)) {
    next.delete(questionId);
  } else {
    next.add(questionId);
  }

  favoriteIds.value = next;
  saveFavorites();
}

function goWfdCenter() {
  router.push("/wfd");
}

function exitBank() {
  router.push("/home");
}

function loadFavorites() {
  if (typeof window === "undefined") return;

  try {
    const raw = window.localStorage.getItem(getFavoriteStorageKey());
    const ids = JSON.parse(raw || "[]");
    favoriteIds.value = new Set(Array.isArray(ids) ? ids.map(normalizeText).filter(Boolean) : []);
  } catch {
    favoriteIds.value = new Set();
  }
}

function saveFavorites() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getFavoriteStorageKey(), JSON.stringify([...favoriteIds.value]));
  } catch {
    // Favorites are local UI state; storage failures should not block practice.
  }
}

function getFavoriteStorageKey() {
  const userId = normalizeText(authStore.user?.id || authStore.session?.user?.id || "local");
  return `kai-kou:wfd-list:favorites:${userId}`;
}

function getQuestionText(question) {
  return normalizeText(question?.content || question?.audio_script || question?.audioScript || question?.prompt || "");
}

function getWordCount(question) {
  const explicit = Number(question?.word_count ?? question?.wordCount ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);

  const content = getQuestionText(question);
  return content ? content.split(/\s+/).filter(Boolean).length : 0;
}

function estimateSeconds(question, wordCount = getWordCount(question)) {
  const explicit = Number(question?.duration ?? question?.duration_sec ?? question?.durationSec ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  return Math.max(12, Math.round((wordCount || 0) / 2.7));
}

function resolveDifficulty(question, wordCount = getWordCount(question)) {
  const raw = question?.difficulty ?? question?.level ?? "";
  const numeric = Number(raw);

  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric <= 1) return "easy";
    if (numeric >= 3) return "hard";
    return "medium";
  }

  const text = normalizeText(raw).toLowerCase();
  if (/easy|simple|beginner|简单/.test(text)) return "easy";
  if (/hard|difficult|advanced|困难/.test(text)) return "hard";
  if (/medium|normal|中等/.test(text)) return "medium";

  if (wordCount <= 50) return "easy";
  if (wordCount >= 76) return "hard";
  return "medium";
}

function getDifficultyLabel(value) {
  if (value === "easy") return "简单";
  if (value === "hard") return "困难";
  return "中等";
}

function getDifficultyClass(value) {
  if (value === "easy") return "easy";
  if (value === "hard") return "hard";
  return "medium";
}

function parseScoreJson(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function resolveWfdScorePercent(scoreJson) {
  const score = pickNumber([
    scoreJson?.score,
    scoreJson?.percent,
    scoreJson?.accuracy,
    scoreJson?.wfd_accuracy,
    scoreJson?.wfdAccuracy,
    scoreJson?.scores?.score,
    scoreJson?.scores?.overall
  ]);

  if (score !== null) {
    return clamp(score <= 10 ? score * 10 : score, 0, 100);
  }

  const correct = Number(scoreJson?.correct);
  const total = Number(scoreJson?.total);
  if (Number.isFinite(correct) && Number.isFinite(total) && total > 0) {
    return clamp((correct / total) * 100, 0, 100);
  }

  return 0;
}

function pickNumber(values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return null;
}

function getQuestionUpdatedAtMs(question) {
  const date = parseDate(question?.updated_at || question?.updatedAt || question?.created_at || question?.createdAt);
  return date?.getTime() || 0;
}

function getIdSortValue(id) {
  const matched = normalizeText(id).match(/(\d+)/);
  return matched ? Number(matched[1]) : 0;
}

function formatHistoryLog(log) {
  return {
    date: formatShortDate(log.createdAt),
    score: formatScore10(log.scorePercent),
    percent: Math.round(clamp(log.scorePercent, 0, 100)),
    color: getHistoryColor(log.scorePercent)
  };
}

function getHistoryColor(scorePercent) {
  if (scorePercent >= 90) return "green";
  if (scorePercent < 80) return "red";
  return "orange";
}

function formatScore10(scorePercent) {
  return (clamp(scorePercent, 0, 100) / 10).toFixed(1);
}

function formatScore90(scorePercent) {
  return (clamp(scorePercent, 0, 100) * 0.9).toFixed(1);
}

function formatShortDate(date) {
  if (!date) return "--";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function average(values) {
  const safe = values.map(Number).filter((item) => Number.isFinite(item) && item >= 0);
  if (!safe.length) return 0;
  return safe.reduce((sum, item) => sum + item, 0) / safe.length;
}

function formatInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return `${Math.round(number)}`;
}

function pickRandom(pool) {
  if (!pool?.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
</script>

<template>
  <div class="wfd-bank-page" data-testid="wfd-bank-page">
    <header class="topbar" data-testid="wfd-topbar">
      <button class="top-back" type="button" @click="goWfdCenter">‹ WFD 练习中心</button>
      <h1>WFD 题库</h1>
      <div class="top-right">
        <span class="vip-pill">● {{ authStore.statusText.replace(/^✅\s*/, "") || "VIP · 无限练习" }}</span>
        <button class="logout-btn" type="button" @click="exitBank">退出</button>
      </div>
    </header>

    <main class="page-layout" data-testid="wfd-three-column-layout">
      <aside class="left-rail">
        <section class="card status-card">
          <div class="card-title">❖ 练习状态</div>
          <div class="status-list">
            <button
              v-for="item in statusFilters"
              :key="item.value"
              class="status-item"
              :class="{ active: selectedStatus === item.value }"
              type="button"
              @click="selectStatus(item.value)"
            >
              <span class="status-left">
                <span class="status-icon" :class="item.color">{{ item.icon }}</span>
                <span>{{ item.label }}</span>
              </span>
              <span class="count-pill">{{ item.count }}</span>
            </button>
          </div>
        </section>

        <section class="card ai-card">
          <div class="card-title">💡 AI 推荐</div>
          <div class="ai-list">
            <button
              v-for="item in recommendationItems"
              :key="item.id"
              class="ai-row"
              type="button"
              data-testid="wfd-ai-practice"
              @click="startPractice(item.question)"
            >
              <span class="id-tag">{{ item.id }}</span>
              <span>{{ item.difficulty }} · {{ item.words }}词</span>
              <strong>练 →</strong>
            </button>
          </div>
        </section>

        <section class="card data-card">
          <div class="card-title">❖ 我的 WFD 数据</div>
          <div class="data-grid">
            <div v-for="item in statsCards" :key="item.label" class="data-box">
              <strong>{{ item.value }}</strong>
              <span>{{ item.label }}</span>
            </div>
          </div>
        </section>
      </aside>

      <section class="main-column">
        <div class="search-row">
          <label class="search-box">
            <span>⌕</span>
            <input
              v-model="searchText"
              data-testid="wfd-search-input"
              type="text"
              placeholder="搜索题目内容 / 题号 / 关键词..."
            />
          </label>
          <span class="total-count">共 {{ filteredQuestions.length }} 题</span>
        </div>

        <div class="filter-row">
          <div class="difficulty-tabs">
            <button
              v-for="option in difficultyOptions"
              :key="option.value"
              class="tab"
              :class="[option.tone, { active: selectedDifficulty === option.value }]"
              type="button"
              :data-testid="`wfd-difficulty-${option.value}`"
              @click="selectDifficulty(option.value)"
            >
              <span class="tab-icon">{{ option.icon }}</span>{{ option.label }}<em>{{ option.count }}</em>
            </button>
          </div>
          <button class="sort-btn" type="button" data-testid="wfd-sort-button" @click="toggleSortDirection">
            按最近更新⌄
          </button>
        </div>

        <section class="question-list" data-testid="wfd-question-list">
          <div v-if="loading" class="loading-state">
            <div class="spinner"></div>
            <p>正在加载题库...</p>
          </div>

          <article v-for="item in cardItems" v-else :key="item.id" class="question-card" data-testid="wfd-question-card">
            <div class="question-top">
              <div class="question-meta">
                <span class="qid">{{ item.id }}</span>
                <span class="level-badge" :class="item.difficultyClass">{{ item.difficultyLabel }}</span>
                <span>{{ item.wordCount }} 词</span>
                <span>约 {{ item.estimatedSeconds }} 秒</span>
              </div>

              <div class="question-actions">
                <button
                  class="star-btn"
                  :class="{ active: item.isFavorite }"
                  type="button"
                  :aria-label="item.isFavorite ? '取消收藏' : '收藏题目'"
                  @click="toggleFavorite(item.id)"
                >
                  {{ item.isFavorite ? "★" : "☆" }}
                </button>
                <span class="my-score">我的：{{ item.myScore }}</span>
                <button class="practice-btn" type="button" data-testid="wfd-card-practice" @click="startPractice(item)">
                  练习
                </button>
              </div>
            </div>

            <p class="sentence">{{ item.content || "WFD 听写题目" }}</p>

            <div class="history-row">
              <div v-for="history in item.history" :key="`${item.id}-${history.date}-${history.score}`" class="history-item">
                <span>{{ history.date }}</span>
                <strong>{{ history.score }}</strong>
                <div class="history-track">
                  <i :class="history.color" :style="{ width: `${history.percent}%` }"></i>
                </div>
              </div>
              <div v-if="!item.history.length" class="history-empty">
                {{ item.historyUnavailable ? "历史记录暂不可用" : "暂无练习记录" }}
              </div>
              <button class="expand-btn" type="button" aria-label="展开历史">⌄</button>
            </div>
          </article>

          <div v-if="!loading && !cardItems.length" class="empty-state">
            <strong>没有找到匹配的题目</strong>
            <span>试试其他关键词或筛选条件</span>
          </div>
        </section>
      </section>

      <aside class="right-rail">
        <section class="card advice-card">
          <div class="card-title">💡 选题建议</div>
          <div class="stage-list">
            <div v-for="stage in practiceStages" :key="stage.title" class="stage-row">
              <span class="stage-dot" :class="stage.color"></span>
              <div>
                <strong>{{ stage.title }}</strong>
                <p>{{ stage.text }}</p>
              </div>
            </div>
          </div>
        </section>

        <section class="card setting-card">
          <div class="card-title">⚙ 本次练习设置</div>
          <div class="setting-list">
            <div class="setting-row">
              <span>出题方式</span>
              <div class="segmented">
                <button :class="{ selected: practiceOrder === 'sequence' }" type="button" @click="setPracticeOrder('sequence')">顺序</button>
                <button :class="{ selected: practiceOrder === 'random' }" type="button" @click="setPracticeOrder('random')">随机</button>
              </div>
            </div>
            <div class="setting-row">
              <span>播放次数</span>
              <div class="segmented">
                <button :class="{ selected: playbackCount === 'single' }" type="button" @click="setPlaybackCount('single')">单次</button>
                <button :class="{ selected: playbackCount === 'double' }" type="button" @click="setPlaybackCount('double')">双次</button>
              </div>
            </div>
            <div class="setting-row">
              <span>自动播放</span>
              <div class="segmented">
                <button :class="{ selected: autoPlay === 'on' }" type="button" @click="setAutoPlay('on')">开</button>
                <button :class="{ selected: autoPlay === 'off' }" type="button" @click="setAutoPlay('off')">关</button>
              </div>
            </div>
          </div>
          <button class="start-all-btn" type="button" data-testid="wfd-start-filtered" @click="startFilteredPractice">
            ▶ 开始练习全部筛选题
          </button>
        </section>

        <section class="card distribution-card">
          <div class="card-title">◷ 难度分布</div>
          <div class="dist-list">
            <div v-for="item in distributionItems" :key="item.key" class="dist-row">
              <span :class="item.key">{{ item.label }}</span>
              <div class="dist-track">
                <i :class="item.key" :style="{ width: `${item.percent}%` }"></i>
              </div>
              <em>{{ item.count }}</em>
            </div>
          </div>
        </section>
      </aside>
    </main>
  </div>
</template>

<style scoped>
*, *::before, *::after {
  box-sizing: border-box;
}

button,
input {
  font: inherit;
}

button {
  cursor: pointer;
}

.wfd-bank-page {
  min-height: 100vh;
  width: 100%;
  background: #eee8dd;
  color: #2b2118;
  font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.topbar {
  height: 60px;
  display: grid;
  grid-template-columns: clamp(230px, 18vw, 310px) 1fr clamp(230px, 18vw, 310px);
  align-items: center;
  padding: 0 28px;
  background: linear-gradient(180deg, #876441 0%, #775536 100%);
  color: #fff8ee;
  border-bottom: 1px solid rgba(75, 49, 28, 0.22);
}

.topbar h1 {
  margin: 0;
  text-align: center;
  font-size: 22px;
  font-weight: 900;
}

.top-back,
.logout-btn {
  border: 0;
  background: transparent;
  color: rgba(255, 248, 238, 0.88);
  font-weight: 800;
}

.top-back {
  justify-self: start;
  font-size: 15px;
}

.top-right {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.vip-pill {
  display: inline-flex;
  align-items: center;
  height: 26px;
  max-width: 180px;
  padding: 0 14px;
  overflow: hidden;
  border-radius: 999px;
  background: #dff4df;
  color: #168243;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.logout-btn {
  font-size: 14px;
}

.page-layout {
  min-height: calc(100vh - 60px);
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 260px;
  gap: 18px;
  width: 100%;
  max-width: 1720px;
  margin: 0 auto;
  padding: 22px;
  overflow: visible;
  align-items: start;
}

.left-rail,
.right-rail,
.main-column {
  min-width: 0;
  overflow: visible;
}

.left-rail,
.right-rail {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-self: start;
}

.card {
  overflow: hidden;
  background: rgba(255, 252, 246, 0.88);
  border: 1px solid #d7c9b7;
  border-radius: 12px;
  box-shadow: 0 8px 18px rgba(93, 64, 34, 0.035), inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.card-title {
  height: 49px;
  display: flex;
  align-items: center;
  padding: 0 17px;
  border-bottom: 1px solid #e2d6c7;
  font-size: 14.5px;
  font-weight: 900;
}

.status-list {
  padding: 11px 13px 14px;
}

.status-item {
  width: 100%;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: 9px;
  padding: 0 10px;
  background: transparent;
  color: #6d5d4b;
  font-size: 15px;
  font-weight: 700;
}

.status-item + .status-item {
  margin-top: 4px;
}

.status-item.active {
  background: #ece3d6;
  color: #2b2118;
}

.status-left {
  display: inline-flex;
  align-items: center;
  gap: 11px;
}

.status-icon {
  width: 19px;
  height: 19px;
  display: inline-grid;
  place-items: center;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 900;
}

.status-icon.cream {
  background: #faefe2;
  color: #d6703c;
}

.status-icon.blue {
  background: linear-gradient(135deg, #71b8ff, #2d69cf);
  border-radius: 50%;
}

.status-icon.green {
  background: #58bf76;
  color: #fff;
}

.status-icon.orange {
  color: #d98820;
}

.status-icon.brown {
  color: #937a5d;
}

.count-pill {
  min-width: 30px;
  height: 24px;
  display: inline-grid;
  place-items: center;
  padding: 0 8px;
  border-radius: 7px;
  background: #ddd2c2;
  color: #7c5c3e;
  font-size: 13px;
  font-weight: 900;
}

.ai-list {
  padding: 11px 13px 14px;
}

.ai-row {
  width: 100%;
  height: 38px;
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr) 42px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #6d5d4b;
  font-size: 13px;
  text-align: left;
}

.ai-row:hover {
  background: rgba(236, 227, 214, 0.7);
}

.ai-row + .ai-row {
  margin-top: 7px;
}

.ai-row span:nth-child(2) {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ai-row strong {
  color: #7c5c3e;
  text-align: right;
}

.id-tag {
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #decdb9;
  border-radius: 6px;
  background: #f5eadb;
  color: #7b5a39;
  font-size: 13px;
  font-weight: 900;
  white-space: nowrap;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  padding: 15px;
}

.data-box {
  height: 70px;
  display: grid;
  place-items: center;
  border: 1px solid #ded2c2;
  border-radius: 9px;
  background: #f6efe5;
}

.data-box strong {
  font-size: 25px;
  line-height: 1;
  font-weight: 950;
}

.data-box span {
  color: #847564;
  font-size: 12px;
}

.main-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.search-row {
  height: 48px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px;
  align-items: center;
  gap: 16px;
}

.search-box {
  height: 48px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  padding: 0 15px;
  border: 1px solid #d0c1ae;
  border-radius: 11px;
  background: rgba(255, 252, 246, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.search-box span {
  color: #b3997d;
  font-size: 22px;
  line-height: 1;
}

.search-box input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #4a3a2a;
  font-size: 15px;
}

.search-box input::placeholder {
  color: #b5a899;
}

.total-count {
  color: #7b5a39;
  font-size: 16px;
  font-weight: 800;
  text-align: right;
}

.filter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  min-width: 0;
}

.difficulty-tabs {
  display: flex;
  align-items: center;
  flex: 1 1 560px;
  flex-wrap: wrap;
  gap: 10px;
  min-width: 0;
}

.tab,
.sort-btn {
  height: 36px;
  border: 1px solid #decfbe;
  border-radius: 999px;
  background: rgba(255, 252, 246, 0.75);
  color: #6f604f;
  font-size: 13.5px;
  font-weight: 850;
  white-space: nowrap;
}

.tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 13px;
}

.tab.active {
  background: #7a5738;
  border-color: #7a5738;
  color: #fff8ee;
}

.tab.easy .tab-icon {
  color: #31a064;
}

.tab.medium .tab-icon {
  color: #e19a26;
}

.tab.hard .tab-icon {
  color: #c74f4f;
}

.tab em {
  min-width: 26px;
  height: 21px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: rgba(124, 92, 62, 0.14);
  font-size: 12.5px;
  font-style: normal;
  font-weight: 900;
}

.tab.active em {
  background: rgba(255, 255, 255, 0.18);
}

.sort-btn {
  flex: 0 0 126px;
  width: 126px;
  margin-left: auto;
  border-radius: 9px;
  color: #7c5c3e;
}

.question-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
  overflow: visible;
  padding-bottom: 32px;
}

.question-card {
  min-height: 0;
  padding: 15px 18px 12px;
  border: 1px solid #d7c9b7;
  border-radius: 12px;
  background: rgba(255, 252, 246, 0.88);
  box-shadow: 0 7px 18px rgba(93, 64, 34, 0.03), inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

.question-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.question-meta,
.question-actions {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.question-meta {
  color: #8b7966;
  font-size: 13px;
  font-weight: 800;
}

.qid {
  min-width: 76px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border: 1px solid #dfcbb4;
  border-radius: 6px;
  background: #f6eddf;
  color: #5c3c1f;
  font-size: 13px;
  font-weight: 950;
}

.level-badge {
  height: 26px;
  display: inline-grid;
  place-items: center;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 950;
}

.level-badge.easy {
  border: 1px solid #b8ddbf;
  background: #e5f3e8;
  color: #2f8e52;
}

.level-badge.medium {
  border: 1px solid #edcba4;
  background: #fff1e0;
  color: #d47419;
}

.level-badge.hard {
  border: 1px solid #ebbab6;
  background: #ffe7e5;
  color: #c4333b;
}

.question-actions {
  flex: 0 0 auto;
}

.star-btn {
  width: 32px;
  height: 32px;
  display: inline-grid;
  place-items: center;
  border: 1px solid #decdb9;
  border-radius: 9px;
  background: #f9f1e8;
  color: #b3987a;
  font-size: 20px;
  line-height: 1;
}

.star-btn.active {
  color: #b77c25;
  background: #fff0d7;
}

.my-score {
  color: #ce6b1a;
  font-size: 16px;
  font-weight: 950;
  white-space: nowrap;
}

.practice-btn {
  width: 64px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: #7b5a39;
  color: #fff8ee;
  font-size: 15px;
  font-weight: 950;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.sentence {
  margin: 13px 0 13px;
  color: #2f261d;
  font-size: 15.5px;
  line-height: 1.45;
}

.history-row {
  min-height: 36px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) 26px;
  align-items: center;
  gap: 10px;
  padding: 0 9px 0 13px;
  border: 1px solid #eadccc;
  border-radius: 9px;
  background: rgba(250, 246, 239, 0.62);
}

.history-item {
  display: grid;
  grid-template-columns: 40px 30px minmax(38px, 1fr);
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: #7c6c5d;
  font-size: 13px;
  font-weight: 800;
}

.history-item + .history-item {
  border-left: 1px solid #e1d4c5;
  padding-left: 10px;
}

.history-empty {
  grid-column: 1 / 4;
  color: #9b8976;
  font-size: 13px;
  font-weight: 800;
}

.history-item strong {
  color: #7a5a3d;
  font-size: 13px;
  font-weight: 950;
}

.history-track {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #e6ded3;
}

.history-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.history-track i.green {
  background: #5ca96d;
}

.history-track i.orange {
  background: #df8539;
}

.history-track i.red {
  background: #cf3546;
}

.expand-btn {
  width: 26px;
  height: 26px;
  border: 0;
  background: transparent;
  color: #8d7965;
  font-size: 18px;
}

.stage-list {
  padding: 15px 16px 16px;
}

.stage-row {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 12px;
  color: #7d6d5d;
}

.stage-row + .stage-row {
  margin-top: 18px;
}

.stage-dot {
  width: 10px;
  height: 10px;
  margin-top: 5px;
  border-radius: 50%;
}

.stage-dot.green {
  background: #5aaf72;
}

.stage-dot.orange {
  background: #e48d30;
}

.stage-dot.red {
  background: #c94444;
}

.stage-row strong {
  display: block;
  margin-bottom: 8px;
  color: #403126;
  font-size: 14px;
  font-weight: 950;
}

.stage-row p {
  margin: 0;
  font-size: 13px;
  line-height: 1.58;
}

.setting-list {
  padding: 15px 15px 8px;
}

.setting-row {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  color: #574637;
  font-size: 14px;
  font-weight: 800;
}

.segmented {
  display: flex;
  gap: 7px;
  justify-content: flex-end;
}

.segmented button {
  width: 56px;
  height: 31px;
  border: 1px solid #dfd2c2;
  border-radius: 8px;
  background: #f2eadf;
  color: #5e4b3b;
  font-size: 13px;
  font-weight: 900;
}

.segmented button.selected {
  background: #e8dccd;
  color: #2f241b;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.start-all-btn {
  width: calc(100% - 30px);
  height: 42px;
  margin: 0 15px 15px;
  border: 0;
  border-radius: 9px;
  background: #7b5a39;
  color: #fff8ee;
  font-size: 15px;
  font-weight: 950;
  box-shadow: 0 8px 15px rgba(93, 64, 34, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.dist-list {
  padding: 17px 17px 18px;
}

.dist-row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 28px;
  align-items: center;
  gap: 12px;
  color: #7d6d5d;
  font-size: 14px;
  font-weight: 900;
}

.dist-row + .dist-row {
  margin-top: 18px;
}

.dist-row span.easy,
.dist-row span.green,
.dist-row span:first-child.easy {
  color: #27945c;
}

.dist-row span.medium {
  color: #d27219;
}

.dist-row span.hard {
  color: #cc303d;
}

.dist-track {
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
  background: #ded5c9;
}

.dist-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
}

.dist-track i.easy {
  background: #5ca96d;
}

.dist-track i.medium {
  background: #df8539;
}

.dist-track i.hard {
  background: #cf3546;
}

.dist-row em {
  color: #8b7764;
  font-style: normal;
  text-align: right;
}

.loading-state,
.empty-state {
  min-height: 220px;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  border: 1px solid #d7c9b7;
  border-radius: 12px;
  background: rgba(255, 252, 246, 0.72);
  color: #8b7966;
}

.empty-state strong {
  color: #3c2c1f;
  font-size: 18px;
}

.empty-state span,
.loading-state p {
  font-size: 13px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 4px solid #e6d8c8;
  border-top-color: #7b5a39;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1366px) {
  .page-layout {
    grid-template-columns: 244px minmax(0, 1fr) 244px;
    gap: 16px;
    padding: 18px;
  }

  .difficulty-tabs {
    gap: 7px;
  }

  .tab {
    padding: 0 10px;
  }

  .question-card {
    padding-left: 17px;
    padding-right: 17px;
  }

  .history-row {
    gap: 8px;
  }

  .history-item {
    grid-template-columns: 38px 30px minmax(34px, 1fr);
    gap: 7px;
  }
}

@media (max-width: 1279px) {
  .page-layout {
    grid-template-columns: 232px minmax(0, 1fr) 232px;
    gap: 14px;
    padding: 16px;
  }

  .topbar {
    padding: 0 22px;
  }
}
</style>

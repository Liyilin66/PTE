<script setup>
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { supabase } from "@/lib/supabase";
import { getDIQuestionCatalog } from "@/lib/di-data";
import { isDIEnabled } from "@/lib/di-feature";
import { loadHomeAnalyticsSnapshotForAuth } from "@/lib/home-analytics";

const TASK_TYPES = ["RA", "WFD", "RTS", "DI", "RS", "RL", "WE"];
const HOME_ANALYTICS_PAGE_SIZE = 1000;
const HOME_ANALYTICS_MAX_DURATION_SEC = 60 * 60 * 3;
const HOME_ANALYTICS_MAX_SCORE = 90;
const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const HEAT_COLORS = ["#E9EEF7", "#F7DFD0", "#F0BB98", "#E78857", "#CD6A31"];
const MODULE_THEME_MAP = {
  ra: {
    accent: "#2D63FF",
    iconBg: "#EDF3FF",
    iconColor: "#2D63FF"
  },
  wfd: {
    accent: "#15A86B",
    iconBg: "#EAF9F1",
    iconColor: "#15A86B"
  },
  rts: {
    accent: "#7C4DFF",
    iconBg: "#F3EFFF",
    iconColor: "#7C4DFF"
  },
  di: {
    accent: "#EB7A3F",
    iconBg: "#FFF2EA",
    iconColor: "#EB7A3F"
  },
  rs: {
    accent: "#3067FF",
    iconBg: "#EEF4FF",
    iconColor: "#3067FF"
  },
  rl: {
    accent: "#149E6C",
    iconBg: "#E8F7EF",
    iconColor: "#149E6C"
  },
  we: {
    accent: "#E36F35",
    iconBg: "#FFF2EA",
    iconColor: "#E36F35"
  }
};

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const { tasks } = storeToRefs(practiceStore);

const showDIFavorites = ref(false);
const diFavoriteQuestionIds = ref([]);
const loadingDIFavorites = ref(false);
const rtsFavoriteQuestionIds = ref([]);
const loadingRTSFavorites = ref(false);
const homeAnalytics = ref(createEmptyHomeAnalytics());

const taskMap = computed(() =>
  tasks.value.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {})
);
const raTask = computed(() => taskMap.value.ra || null);
const wfdTask = computed(() => taskMap.value.wfd || null);
const rtsTask = computed(() => taskMap.value.rts || null);
const rsTask = computed(() => taskMap.value.rs || null);
const rlTask = computed(() => taskMap.value.rl || null);
const weTask = computed(() => taskMap.value.we || null);
const diEnabled = computed(() => isDIEnabled());
const rtsFavoriteCount = computed(() => rtsFavoriteQuestionIds.value.length);
const diQuestionCatalog = getDIQuestionCatalog();
const diQuestionMap = new Map(diQuestionCatalog.map((item) => [item.id, item]));
const diFavoriteQuestions = computed(() =>
  diFavoriteQuestionIds.value
    .map((id) => {
      const found = diQuestionMap.get(id);
      if (!found) return { id, sourceNumberLabel: id, displayTitle: id, imageType: "" };
      return found;
    })
    .filter(Boolean)
);

const userDisplayName = computed(() => authStore.displayName);

const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "K";
});

const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim());

const greetingLabel = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return "凌晨好";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
});

const accountStatusMeta = computed(() => {
  if (!authStore.loaded) {
    return {
      label: "状态同步中",
      detail: "正在读取账号权限",
      className: "account-pill--neutral"
    };
  }

  if (authStore.isPremium) {
    return {
      label: "VIP",
      detail: "无限练习",
      className: "account-pill--vip"
    };
  }

  if (authStore.isInTrial) {
    return {
      label: `试用 · ${authStore.trialDaysLeft}天`,
      detail: "试用期内可正常练习",
      className: "account-pill--trial"
    };
  }

  if (authStore.accessStatus === "trial_expired") {
    return {
      label: "试用已结束",
      detail: "权限已到期",
      className: "account-pill--neutral"
    };
  }

  return {
    label: "未开通",
    detail: "当前暂无练习权限",
    className: "account-pill--neutral"
  };
});

const streakGoal = computed(() => resolveNextStreakGoal(homeAnalytics.value.currentStreak));
const streakGap = computed(() => Math.max(0, streakGoal.value - homeAnalytics.value.currentStreak));

const heroSupportText = computed(() => {
  if (homeAnalytics.value.loading) return "正在同步你的真实练习记录...";
  if (homeAnalytics.value.currentStreak > 0) {
    if (streakGap.value > 0) {
      return `连续 ${homeAnalytics.value.currentStreak} 天 · 距离 ${streakGoal.value} 天小目标还差 ${streakGap.value} 天`;
    }
    return `连续 ${homeAnalytics.value.currentStreak} 天 · 已达成 ${streakGoal.value} 天小目标`;
  }
  if (homeAnalytics.value.totalCount > 0) {
    return "今天开练，就能重新点亮连续记录";
  }
  return "从一题开始，streak 和热力图会自动累计";
});

const streakCardCaption = computed(() => {
  if (homeAnalytics.value.loading) return "正在统计";
  if (homeAnalytics.value.currentStreak > 0) {
    return streakGap.value > 0 ? `目标 ${streakGoal.value} 天，还差 ${streakGap.value} 天完成` : "当前小目标已完成";
  }
  if (homeAnalytics.value.lastPracticeAt) {
    return `最近练习 ${formatMonthDay(homeAnalytics.value.lastPracticeAt)}`;
  }
  return "今天开始建立你的练习节奏";
});

const activeDaysCardCaption = computed(() => {
  if (homeAnalytics.value.loading) return "正在统计";
  if (homeAnalytics.value.activeDaysCount > 0) {
    return homeAnalytics.value.totalCount > 0
      ? `${formatInteger(homeAnalytics.value.totalCount)} 题分布在 ${formatInteger(homeAnalytics.value.activeDaysCount)} 天里`
      : "按练习日期去重统计";
  }
  return "开始练习后自动累计";
});

const heroHighlightCards = computed(() => [
  {
    key: "active-days",
    icon: "📅",
    label: "累计练习天数",
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.activeDaysCount),
    caption: activeDaysCardCaption.value,
    className: "hero-streak--secondary",
    iconClass: "hero-streak__icon--secondary",
    valueClass: "hero-streak__value--secondary"
  },
  {
    key: "current-streak",
    icon: "🔥",
    label: "连续练习天数",
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.currentStreak),
    caption: streakCardCaption.value,
    className: "",
    iconClass: "",
    valueClass: ""
  }
]);

const heroStats = computed(() => [
  {
    key: "today",
    label: "今日题数",
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.todayCount),
    helper: homeAnalytics.value.todayCount > 0 ? "今天已经开练" : "从一题开始热身",
    helperClass: homeAnalytics.value.todayCount > 0 ? "hero-stat__hint--positive" : ""
  },
  {
    key: "week-minutes",
    label: "本周分钟",
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.weekMinutes),
    helper: homeAnalytics.value.durationTrackedCount
      ? "基于已有时长记录"
      : "部分题型暂无时长落库",
    helperClass: homeAnalytics.value.weekMinutes > 0 ? "hero-stat__hint--positive" : ""
  },
  {
    key: "avg-score",
    label: "平均评分",
    value: homeAnalytics.value.loading ? "--" : formatScore(homeAnalytics.value.averageScore),
    suffix: homeAnalytics.value.averageScore !== null ? "/90" : "",
    helper: homeAnalytics.value.scoredCount
      ? `已评分 ${formatInteger(homeAnalytics.value.scoredCount)} 条`
      : "有评分记录后自动更新",
    helperClass: ""
  },
  {
    key: "total",
    label: "累计题数",
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.totalCount),
    helper: homeAnalytics.value.activeDaysCount
      ? `${formatInteger(homeAnalytics.value.activeDaysCount)} 天有练习记录`
      : "开始练习后持续累计",
    helperClass: ""
  }
]);

const mobileHeroCards = computed(() => [
  ...heroHighlightCards.value.map((card) => ({
    key: card.key,
    icon: card.icon,
    value: card.value,
    suffix: "",
    label: card.label,
    helper: card.caption,
    className: card.className === "hero-streak--secondary" ? "hero-mobile-card--secondary" : "",
    valueClass: card.valueClass === "hero-streak__value--secondary" ? "hero-mobile-card__value--secondary" : "hero-mobile-card__value--accent",
    helperClass: ""
  })),
  ...heroStats.value.map((stat) => ({
    ...stat,
    icon: "",
    className: "",
    valueClass: "",
    helperClass: stat.helperClass === "hero-stat__hint--positive" ? "hero-mobile-card__hint--positive" : ""
  }))
]);

const heatmapTotal = computed(() =>
  homeAnalytics.value.recentDays.reduce((sum, item) => sum + Number(item.count || 0), 0)
);

const diFeatureChips = computed(() => {
  if (!diEnabled.value) return [];
  return ["5秒开口", "三连练", "提示降级"];
});

const otherTaskSelectPathMap = {
  rs: "/rs",
  rl: "/rl"
};

const otherTaskTertiaryMap = {
  rs: {
    label: "句型强化",
    to: "/rs"
  },
  rl: {
    label: "结构模板",
    to: "/rl"
  }
};

function createEmptyHomeAnalytics() {
  return {
    loading: true,
    totalCount: 0,
    todayCount: 0,
    weekMinutes: 0,
    averageScore: null,
    scoredCount: 0,
    durationTrackedCount: 0,
    currentStreak: 0,
    activeDaysCount: 0,
    recentDays: buildRecentDaysSnapshot(),
    taskWeekCounts: buildTaskCounterSeed(),
    lastPracticeAt: ""
  };
}

function buildTaskCounterSeed() {
  return TASK_TYPES.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function buildRecentDaysSnapshot(today = new Date()) {
  const todayKey = toDateKey(today);
  const weekStart = startOfWeekMonday(today);
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    const key = toDateKey(date);
    const isToday = isTodayDateKey(key, todayKey);
    return {
      key,
      label: isToday ? "今日" : WEEKDAY_LABELS[date.getDay()],
      dateLabel: formatMonthDay(date),
      count: 0,
      color: HEAT_COLORS[0],
      isToday
    };
  });
}

function startOfWeekMonday(value) {
  const date = startOfDay(value);
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function toDateKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTodayDateKey(dateKey, todayKey = toDateKey(new Date())) {
  return Boolean(dateKey) && dateKey === todayKey;
}

function formatMonthDay(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function resolveNextStreakGoal(streak) {
  const normalized = Math.max(0, Number(streak || 0));
  const checkpoints = [7, 14, 30, 60, 90];
  const next = checkpoints.find((item) => normalized < item);
  if (next) return next;
  return Math.ceil((normalized + 1) / 30) * 30;
}

function calculateCurrentStreak(practicedDaySet) {
  let streak = 0;
  let cursor = startOfDay(new Date());
  while (practicedDaySet.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function resolveHeatLevel(count, maxCount) {
  const normalizedCount = Number(count || 0);
  const normalizedMax = Number(maxCount || 0);
  if (!normalizedCount || !normalizedMax) return 0;
  const ratio = normalizedCount / normalizedMax;
  if (ratio >= 0.8) return 4;
  if (ratio >= 0.55) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

function resolveDurationSec(scoreJson) {
  const score = toObject(scoreJson) || {};
  const analyticsDuration = normalizeDurationSec(
    score?.analytics?.total_active_sec ?? score?.analytics?.totalActiveSec
  );
  if (analyticsDuration > 0) return analyticsDuration;

  const direct = normalizeDurationSec(score?.duration_sec ?? score?.durationSec);
  if (direct > 0) return direct;

  const metricsDuration = normalizeDurationSec(
    score?.metrics?.speech_duration_sec ?? score?.metrics?.speechDurationSec
  );
  if (metricsDuration > 0) return metricsDuration;

  const audioSignalsDuration = normalizeDurationSec(
    score?.audio_signals?.duration_sec ?? score?.audio_signals?.durationSec
  );
  if (audioSignalsDuration > 0) return audioSignalsDuration;

  const audioSignalsMs = Number(score?.audio_signals?.duration_ms ?? score?.audio_signals?.durationMs);
  if (Number.isFinite(audioSignalsMs) && audioSignalsMs > 0) {
    return normalizeDurationSec(audioSignalsMs / 1000);
  }

  return 0;
}

function resolveOverallScore(taskType, scoreJson) {
  const normalizedTaskType = normalizeTaskType(taskType);
  if (normalizedTaskType === "WFD") return null;

  const score = toObject(scoreJson) || {};
  const candidates = [
    score?.overall_estimated,
    score?.ai_review?.display_scores?.overall,
    score?.ai_review?.diagnostics?.display_scores?.overall,
    score?.ai_review?.product?.overall,
    score?.ai_review?.overall,
    score?.product?.overall,
    score?.diagnostics?.display_scores?.overall,
    score?.display_scores?.overall,
    score?.scores?.overall,
    score?.overall
  ];

  for (const candidate of candidates) {
    const normalized = normalizeOverallCandidate(candidate);
    if (normalized !== null) return normalized;
  }

  if (normalizedTaskType === "RS" || normalizedTaskType === "RL") {
    return resolveLegacySpeechOverall(score);
  }

  return null;
}

function normalizeTaskType(value) {
  return `${value || ""}`.trim().toUpperCase();
}

function toObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value;
}

function normalizeDurationSec(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(0, Math.min(HOME_ANALYTICS_MAX_DURATION_SEC, Math.round(numeric)));
}

function normalizeOverallCandidate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(Math.max(0, Math.min(HOME_ANALYTICS_MAX_SCORE, numeric)).toFixed(1));
}

function normalizePresentScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(Math.max(0, Math.min(HOME_ANALYTICS_MAX_SCORE, numeric)).toFixed(1));
}

function pickFirstPresentScore(...candidates) {
  for (const candidate of candidates) {
    const normalized = normalizePresentScore(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function resolveLegacySpeechOverall(scoreJson) {
  const score = toObject(scoreJson) || {};
  const nestedScores = toObject(score?.scores) || {};
  const pronunciation = pickFirstPresentScore(score?.pronunciation, nestedScores?.pronunciation);
  const fluency = pickFirstPresentScore(
    score?.fluency,
    score?.oral_fluency,
    score?.oralFluency,
    nestedScores?.fluency,
    nestedScores?.oral_fluency,
    nestedScores?.oralFluency
  );
  const content = pickFirstPresentScore(
    score?.content,
    score?.appropriacy,
    nestedScores?.content,
    nestedScores?.appropriacy
  );
  const validScores = [pronunciation, fluency, content].filter((item) => item !== null);
  if (validScores.length < 2) return null;

  const average = validScores.reduce((sum, item) => sum + Number(item || 0), 0) / validScores.length;
  return normalizeOverallCandidate(average);
}

function formatInteger(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 0
  }).format(Math.max(0, Math.round(number)));
}

function formatScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(number);
}

function formatModuleTitle(value) {
  return `${value || ""}`.replace(/\s*-\s*/g, " - ").trim();
}

function getModuleTheme(moduleId) {
  return MODULE_THEME_MAP[moduleId] || MODULE_THEME_MAP.ra;
}

function getModuleStyle(moduleId) {
  const theme = getModuleTheme(moduleId);
  return {
    "--module-accent": theme.accent,
    "--module-icon-bg": theme.iconBg,
    "--module-icon-color": theme.iconColor
  };
}

function getTaskWeekCount(taskType) {
  const key = normalizeTaskType(taskType);
  return Number(homeAnalytics.value.taskWeekCounts[key] || 0);
}

function getTaskWeekPercent(taskType) {
  const values = Object.values(homeAnalytics.value.taskWeekCounts || {});
  const maxValue = Math.max(...values, 0);
  const currentValue = getTaskWeekCount(taskType);
  if (!maxValue || !currentValue) return 0;
  return Math.max(18, Math.round((currentValue / maxValue) * 100));
}

function favoriteLocalStorageKey(userId, taskType = "DI") {
  const normalizedTaskType = `${taskType || "DI"}`.trim().toLowerCase();
  return `kai_kou_${normalizedTaskType}_favorites_${userId}`;
}

function readLocalFavorites(userId, taskType = "DI") {
  const key = favoriteLocalStorageKey(userId, taskType);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => `${item || ""}`.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeLocalFavorites(userId, ids, taskType = "DI") {
  const key = favoriteLocalStorageKey(userId, taskType);
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
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

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function fetchHomeAnalyticsRows(userId) {
  const normalizedUserId = `${userId || ""}`.trim();
  if (!normalizedUserId) return [];

  const rows = [];
  let from = 0;

  while (true) {
    const to = from + HOME_ANALYTICS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, created_at, score_json")
      .eq("user_id", normalizedUserId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);

    if (error) throw error;

    const chunk = Array.isArray(data) ? data : [];
    if (!chunk.length) break;

    rows.push(...chunk);

    if (chunk.length < HOME_ANALYTICS_PAGE_SIZE) break;
    from = to + 1;
  }

  return rows;
}

async function loadHomeAnalytics() {
  homeAnalytics.value = createEmptyHomeAnalytics();
  homeAnalytics.value = await loadHomeAnalyticsSnapshotForAuth(authStore);
}

async function loadDIFavorites() {
  if (!diEnabled.value || !authStore.canPractice) {
    diFavoriteQuestionIds.value = [];
    return;
  }

  loadingDIFavorites.value = true;
  try {
    const userId = await resolveCurrentUserId();
    if (!userId) {
      diFavoriteQuestionIds.value = [];
      return;
    }

    const localFavorites = readLocalFavorites(userId, "DI");
    let orderedIds = [...localFavorites];

    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("question_id, created_at")
        .eq("user_id", userId)
        .eq("task_type", "DI")
        .order("created_at", { ascending: false });

      if (error) {
        if (!isMissingFavoritesTableError(error)) throw error;
      } else {
        const remoteIds = (Array.isArray(data) ? data : [])
          .map((item) => `${item?.question_id || ""}`.trim())
          .filter(Boolean);
        const merged = [...remoteIds, ...localFavorites];
        orderedIds = [...new Set(merged)];
        writeLocalFavorites(userId, orderedIds, "DI");
      }
    } catch {
      // keep local fallback
    }

    diFavoriteQuestionIds.value = orderedIds;
  } finally {
    loadingDIFavorites.value = false;
  }
}

async function loadRTSFavorites() {
  if (!rtsTask.value) {
    rtsFavoriteQuestionIds.value = [];
    return;
  }

  loadingRTSFavorites.value = true;
  try {
    const userId = await resolveCurrentUserId();
    if (!userId) {
      rtsFavoriteQuestionIds.value = [];
      return;
    }

    const localFavorites = readLocalFavorites(userId, "RTS");
    let orderedIds = [...localFavorites];

    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("question_id, created_at")
        .eq("user_id", userId)
        .eq("task_type", "RTS")
        .order("created_at", { ascending: false });

      if (error) {
        if (!isMissingFavoritesTableError(error)) throw error;
      } else {
        const remoteIds = (Array.isArray(data) ? data : [])
          .map((item) => `${item?.question_id || ""}`.trim())
          .filter(Boolean);
        const merged = [...remoteIds, ...localFavorites];
        orderedIds = [...new Set(merged)];
        writeLocalFavorites(userId, orderedIds, "RTS");
      }
    } catch {
      // keep local fallback
    }

    rtsFavoriteQuestionIds.value = orderedIds;
  } finally {
    loadingRTSFavorites.value = false;
  }
}

function goLogin() {
  router.push("/auth");
}

function openProfile() {
  router.push("/profile");
}

function startDIRandomPractice() {
  router.push("/di");
}

function startRTSRandomPractice() {
  router.push("/rts/practice");
}

function openRTSSelectPractice() {
  router.push("/rts/list");
}

function openRTSTemplateLibrary() {
  router.push("/rts/templates");
}

function openRTSFavorites() {
  router.push("/rts/favorites");
}

function openDIFavoriteQuestion(questionId) {
  const id = `${questionId || ""}`.trim();
  if (!id) return;
  router.push({
    path: "/di",
    query: { qid: id }
  });
}

function openOtherTaskRandom(task) {
  const to = `${task?.to || ""}`.trim();
  if (!to) return;
  router.push(to);
}

function openOtherTaskSelect(task) {
  const taskId = `${task?.id || ""}`.trim();
  const to = `${otherTaskSelectPathMap[taskId] || task?.to || ""}`.trim();
  if (!to) return;
  router.push(to);
}

function otherTaskTertiaryLabel(task) {
  const taskId = `${task?.id || ""}`.trim();
  return otherTaskTertiaryMap[taskId]?.label || "";
}

function openOtherTaskTertiary(task) {
  const taskId = `${task?.id || ""}`.trim();
  const to = `${otherTaskTertiaryMap[taskId]?.to || task?.to || ""}`.trim();
  if (!to) return;
  router.push(to);
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }

  await Promise.all([
    loadHomeAnalytics(),
    loadDIFavorites(),
    loadRTSFavorites()
  ]);
});
</script>

<template>
  <div class="home-page">
    <header class="home-topbar">
      <div class="topbar-inner">
        <div class="brand">
          <div class="brand__mark">
            <svg viewBox="0 0 24 24" class="brand__icon" fill="none" stroke="currentColor" stroke-width="2.4">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="3.4" />
            </svg>
          </div>
          <div class="brand__copy">
            <p class="brand__title">开口</p>
          </div>
        </div>

        <div
          v-if="authStore.isLoggedIn"
          class="account-card account-card--clickable"
          role="button"
          tabindex="0"
          aria-label="打开个人中心"
          @click="openProfile"
          @keydown.enter.prevent="openProfile"
          @keydown.space.prevent="openProfile"
        >
          <span class="account-pill" :class="accountStatusMeta.className">{{ accountStatusMeta.label }}</span>
          <div class="account-card__badge-wrap">
            <div class="account-card__badge">
              <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" class="account-card__badge-image" />
              <span v-else>{{ userInitial }}</span>
            </div>
            <span class="account-card__crown" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="account-card__crown-icon" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 17h16l-1.4-8-4.8 3.5L12 5 10.2 12.5 5.4 9 4 17Z" fill="currentColor" stroke="none" />
                <path d="M6 19h12" stroke-linecap="round" />
              </svg>
            </span>
            <span class="account-card__spark" aria-hidden="true">
              <svg viewBox="0 0 16 16" class="account-card__spark-icon" fill="currentColor">
                <path d="M8 1.2 9.6 6.4 14.8 8l-5.2 1.6L8 14.8 6.4 9.6 1.2 8l5.2-1.6Z" />
              </svg>
            </span>
          </div>
          <div class="account-card__panel">
            <div class="account-card__panel-copy">
              <p class="account-card__title">个人中心</p>
              <p class="account-card__subtitle">点击进入</p>
            </div>
            <div class="account-card__arrow" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="account-card__arrow-icon" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="m9 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          </div>
        </div>

        <button v-else type="button" class="account-login" @click="goLogin">登录</button>
      </div>
    </header>

    <section class="home-hero">
      <div class="hero-inner">
        <div class="hero-grid">
          <div class="hero-copy">
            <p class="hero-copy__eyebrow">{{ greetingLabel }}, {{ userDisplayName }} 👋</p>
            <h1>今天要练点什么？</h1>
            <p class="hero-copy__support">{{ heroSupportText }}</p>
          </div>

          <div class="hero-highlight-grid">
            <article
              v-for="card in heroHighlightCards"
              :key="card.key"
              class="hero-streak"
              :class="card.className"
            >
              <div class="hero-streak__row">
                <div class="hero-streak__icon" :class="card.iconClass">{{ card.icon }}</div>
                <div>
                  <p class="hero-streak__value" :class="card.valueClass">{{ card.value }}</p>
                  <p class="hero-streak__label">{{ card.label }}</p>
                  <p class="hero-streak__caption">{{ card.caption }}</p>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div class="hero-stats-grid">
          <article v-for="stat in heroStats" :key="stat.key" class="hero-stat">
            <div>
              <p class="hero-stat__value">
                <span>{{ stat.value }}</span>
                <span v-if="stat.suffix" class="hero-stat__suffix">{{ stat.suffix }}</span>
              </p>
              <p class="hero-stat__label">{{ stat.label }}</p>
            </div>
            <p class="hero-stat__hint" :class="stat.helperClass">{{ stat.helper }}</p>
          </article>
        </div>

        <div class="hero-mobile-grid">
          <article
            v-for="card in mobileHeroCards"
            :key="card.key"
            class="hero-mobile-card"
            :class="card.className"
          >
            <p class="hero-mobile-card__value" :class="card.valueClass">
              <span>{{ card.value }}</span>
              <span v-if="card.suffix" class="hero-mobile-card__suffix">{{ card.suffix }}</span>
            </p>
            <p class="hero-mobile-card__label">
              <span v-if="card.icon" class="hero-mobile-card__emoji">{{ card.icon }}</span>
              <span>{{ card.label }}</span>
            </p>
            <p class="hero-mobile-card__hint" :class="card.helperClass">{{ card.helper }}</p>
          </article>
        </div>

      </div>
    </section>

    <main class="home-content">
      <div class="content-inner">
        <section class="surface-card heatmap-card">
          <div class="heatmap-card__inner">
            <div class="section-header">
              <div>
                <p class="section-header__title">🗓️ 本周练习热力图</p>
                <p class="section-header__subtle">本周真实练习次数 · 自动按你的练习记录更新</p>
              </div>
              <p class="section-header__summary">
                {{ homeAnalytics.loading ? "同步中..." : `本周共 ${formatInteger(heatmapTotal)} 题` }}
              </p>
            </div>

            <div class="heatmap-body">
              <div class="heatmap-week">
                <div
                  v-for="day in homeAnalytics.recentDays"
                  :key="day.key"
                  class="heatmap-day"
                  :class="{ 'heatmap-day--today': day.isToday }"
                >
                  <div
                    class="heatmap-cell"
                    :class="{ 'heatmap-cell--today': day.isToday }"
                    :style="{ backgroundColor: day.color }"
                    :title="`${day.dateLabel} · ${day.count} 题${day.isToday ? ' · 今日' : ''}`"
                  />
                  <span class="heatmap-day__label">
                    {{ day.label }}
                  </span>
                </div>
              </div>

              <div class="heatmap-legend">
                <span class="heatmap-legend__text">少</span>
                <span
                  v-for="(color, index) in HEAT_COLORS.slice(1)"
                  :key="`${color}-${index}`"
                  class="heatmap-legend__dot"
                  :style="{ backgroundColor: color }"
                />
                <span class="heatmap-legend__text">多</span>
              </div>
            </div>
          </div>
        </section>

        <section class="content-section">
          <div class="section-header section-header--plain">
            <div>
              <p class="section-header__title">口语练习</p>
              <p class="section-header__subtle">保留现有入口逻辑，只重排首页结构和视觉层级</p>
            </div>
          </div>

          <div class="module-grid">
            <article v-if="raTask" class="module-card" :style="getModuleStyle('ra')">
              <div class="module-card__head">
                <div class="module-card__info">
                  <div class="module-card__icon">
                    <svg viewBox="0 0 24 24" class="module-card__icon-svg" fill="none" stroke="currentColor" stroke-width="2.1">
                      <path d="M12 1v11" />
                      <path d="M8 6v5a4 4 0 0 0 8 0V6" />
                      <path d="M5 11a7 7 0 0 0 14 0" />
                      <path d="M12 18v5" />
                    </svg>
                  </div>
                  <div class="module-card__copy">
                    <h3 class="module-card__title">{{ formatModuleTitle(raTask.title) }}</h3>
                    <p class="module-card__subtitle">{{ raTask.subtitle }}</p>
                  </div>
                </div>
                <div class="module-card__metric">
                  <span class="module-card__metric-track">
                    <span :style="{ width: `${getTaskWeekPercent('RA')}%` }" />
                  </span>
                  <span class="module-card__metric-value">{{ getTaskWeekCount("RA") }}题</span>
                </div>
              </div>

              <div class="module-card__actions">
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--primary" @click="router.push('/ra')">随机练习</button>
                  <button type="button" class="module-btn module-btn--secondary" @click="router.push('/ra/list')">选题练习</button>
                </div>
              </div>
            </article>

            <article v-if="wfdTask" class="module-card" :style="getModuleStyle('wfd')">
              <div class="module-card__head">
                <div class="module-card__info">
                  <div class="module-card__icon">
                    <svg viewBox="0 0 24 24" class="module-card__icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 13v-2a8 8 0 1 1 16 0v2" />
                      <path d="M4 13v4a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2z" />
                      <path d="M20 13v4a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div class="module-card__copy">
                    <h3 class="module-card__title">{{ formatModuleTitle(wfdTask.title) }}</h3>
                    <p class="module-card__subtitle">{{ wfdTask.subtitle }}</p>
                  </div>
                </div>
                <div class="module-card__metric">
                  <span class="module-card__metric-track">
                    <span :style="{ width: `${getTaskWeekPercent('WFD')}%` }" />
                  </span>
                  <span class="module-card__metric-value">{{ getTaskWeekCount("WFD") }}题</span>
                </div>
              </div>

              <div class="module-card__actions">
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--primary" @click="router.push('/wfd')">随机练习</button>
                  <button type="button" class="module-btn module-btn--secondary" @click="router.push('/wfd/list')">选题练习</button>
                </div>
                <div class="module-card__actions-grid module-card__actions-grid--single">
                  <button type="button" class="module-btn module-btn--feature" @click="router.push('/wfd/listen')">磨耳朵模式</button>
                </div>
              </div>
            </article>

            <article v-if="rtsTask" class="module-card" :style="getModuleStyle('rts')">
              <div class="module-card__head">
                <div class="module-card__info">
                  <div class="module-card__icon">
                    <svg viewBox="0 0 24 24" class="module-card__icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M5 5h14v9H9l-4 4z" />
                      <path d="M12 9h4" />
                      <path d="M8 12h8" />
                    </svg>
                  </div>
                  <div class="module-card__copy">
                    <h3 class="module-card__title">{{ formatModuleTitle(rtsTask.title) }}</h3>
                    <p class="module-card__subtitle">{{ rtsTask.subtitle }}</p>
                  </div>
                </div>
                <div class="module-card__metric">
                  <span class="module-card__metric-track">
                    <span :style="{ width: `${getTaskWeekPercent('RTS')}%` }" />
                  </span>
                  <span class="module-card__metric-value">{{ getTaskWeekCount("RTS") }}题</span>
                </div>
              </div>

              <div class="module-card__actions">
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--primary" @click="startRTSRandomPractice">随机练习</button>
                  <button type="button" class="module-btn module-btn--secondary" @click="openRTSSelectPractice">选题练习</button>
                </div>
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--ghost" @click="openRTSTemplateLibrary">模板库</button>
                  <button type="button" class="module-btn module-btn--ghost" @click="openRTSFavorites">
                    <span class="module-btn__inline">
                      <span>{{ loadingRTSFavorites ? "收藏加载中..." : "RTS 收藏" }}</span>
                      <span class="module-badge">{{ rtsFavoriteCount }}</span>
                    </span>
                  </button>
                </div>
              </div>
            </article>

            <article v-if="diEnabled" class="module-card" :style="getModuleStyle('di')">
              <div class="module-card__head">
                <div class="module-card__info">
                  <div class="module-card__icon">
                    <svg viewBox="0 0 24 24" class="module-card__icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="5" y="4" width="14" height="16" rx="2" />
                      <path d="M9 8h6" />
                      <path d="M9 12h6" />
                    </svg>
                  </div>
                  <div class="module-card__copy">
                    <h3 class="module-card__title">DI - 图片描述</h3>
                    <p class="module-card__subtitle">口语起步器</p>
                    <div class="module-card__chips">
                      <span v-for="chip in diFeatureChips" :key="chip" class="module-chip">{{ chip }}</span>
                    </div>
                  </div>
                </div>
                <div class="module-card__metric">
                  <span class="module-card__metric-track">
                    <span :style="{ width: `${getTaskWeekPercent('DI')}%` }" />
                  </span>
                  <span class="module-card__metric-value">{{ getTaskWeekCount("DI") }}题</span>
                </div>
              </div>

              <div class="module-card__actions">
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--primary" @click="startDIRandomPractice">随机练习</button>
                  <button type="button" class="module-btn module-btn--secondary" @click="router.push('/di/select')">选题练习</button>
                </div>
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--ghost" @click="router.push('/di/templates')">模板库</button>
                  <button type="button" class="module-btn module-btn--ghost" @click="showDIFavorites = !showDIFavorites">
                    <span class="module-btn__inline">
                      <span>{{ showDIFavorites ? "收起收藏" : "DI 收藏" }}</span>
                      <span class="module-badge">{{ diFavoriteQuestions.length }}</span>
                    </span>
                  </button>
                </div>

                <div v-if="showDIFavorites" class="module-favorites">
                  <div class="module-favorites__head">
                    <p>DI 全部收藏</p>
                    <span>{{ diFavoriteQuestions.length }} 题</span>
                  </div>

                  <div v-if="loadingDIFavorites" class="module-favorites__empty">收藏加载中...</div>
                  <div v-else-if="diFavoriteQuestions.length" class="module-favorites__list">
                    <button
                      v-for="item in diFavoriteQuestions"
                      :key="item.id"
                      type="button"
                      class="module-favorites__item"
                      @click="openDIFavoriteQuestion(item.id)"
                    >
                      <span class="module-favorites__item-title">{{ item.sourceNumberLabel || item.id }} - {{ item.displayTitle || item.id }}</span>
                      <span class="module-favorites__item-tag">{{ item.imageType || "-" }}</span>
                    </button>
                  </div>
                  <p v-else class="module-favorites__empty">暂无 DI 收藏题目。</p>
                </div>
              </div>
            </article>

            <article v-if="rsTask" class="module-card" :style="getModuleStyle('rs')">
              <div class="module-card__head">
                <div class="module-card__info">
                  <div class="module-card__icon">
                    <svg viewBox="0 0 24 24" class="module-card__icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M5 6h14v9H9l-4 4z" />
                    </svg>
                  </div>
                  <div class="module-card__copy">
                    <h3 class="module-card__title">{{ formatModuleTitle(rsTask.title) }}</h3>
                    <p class="module-card__subtitle">{{ rsTask.subtitle }}</p>
                  </div>
                </div>
                <div class="module-card__metric">
                  <span class="module-card__metric-track">
                    <span :style="{ width: `${getTaskWeekPercent('RS')}%` }" />
                  </span>
                  <span class="module-card__metric-value">{{ getTaskWeekCount("RS") }}题</span>
                </div>
              </div>

              <div class="module-card__actions">
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--primary" @click="openOtherTaskRandom(rsTask)">随机练习</button>
                  <button type="button" class="module-btn module-btn--secondary" @click="openOtherTaskSelect(rsTask)">选题练习</button>
                </div>
                <div class="module-card__actions-grid module-card__actions-grid--single">
                  <button type="button" class="module-btn module-btn--feature" @click="openOtherTaskTertiary(rsTask)">
                    {{ otherTaskTertiaryLabel(rsTask) }}
                  </button>
                </div>
              </div>
            </article>

            <article v-if="rlTask" class="module-card" :style="getModuleStyle('rl')">
              <div class="module-card__head">
                <div class="module-card__info">
                  <div class="module-card__icon">
                    <svg viewBox="0 0 24 24" class="module-card__icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M6 5h8a4 4 0 0 1 4 4v10H10a4 4 0 0 0-4-4z" />
                      <path d="M6 5v10a4 4 0 0 1 4 4" />
                    </svg>
                  </div>
                  <div class="module-card__copy">
                    <h3 class="module-card__title">{{ formatModuleTitle(rlTask.title) }}</h3>
                    <p class="module-card__subtitle">{{ rlTask.subtitle }}</p>
                  </div>
                </div>
                <div class="module-card__metric">
                  <span class="module-card__metric-track">
                    <span :style="{ width: `${getTaskWeekPercent('RL')}%` }" />
                  </span>
                  <span class="module-card__metric-value">{{ getTaskWeekCount("RL") }}题</span>
                </div>
              </div>

              <div class="module-card__actions">
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--primary" @click="openOtherTaskRandom(rlTask)">随机练习</button>
                  <button type="button" class="module-btn module-btn--secondary" @click="openOtherTaskSelect(rlTask)">选题练习</button>
                </div>
                <div class="module-card__actions-grid module-card__actions-grid--single">
                  <button type="button" class="module-btn module-btn--feature" @click="openOtherTaskTertiary(rlTask)">
                    {{ otherTaskTertiaryLabel(rlTask) }}
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section class="content-section">
          <div class="section-header section-header--plain">
            <div>
              <p class="section-header__title">写作</p>
              <p class="section-header__subtle">写作入口保留原逻辑，视觉样式对齐首页新结构</p>
            </div>
          </div>

          <div class="module-grid">
            <article v-if="weTask" class="module-card" :style="getModuleStyle('we')">
              <div class="module-card__head">
                <div class="module-card__info">
                  <div class="module-card__icon">
                    <svg viewBox="0 0 24 24" class="module-card__icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M4 20h16" />
                      <path d="M7 16.5V6.5A2.5 2.5 0 0 1 9.5 4h7.9" />
                      <path d="m14 6 4-2v7" />
                    </svg>
                  </div>
                  <div class="module-card__copy">
                    <h3 class="module-card__title">{{ formatModuleTitle(weTask.title) }}</h3>
                    <p class="module-card__subtitle">{{ weTask.subtitle }}</p>
                  </div>
                </div>
                <div class="module-card__metric">
                  <span class="module-card__metric-track">
                    <span :style="{ width: `${getTaskWeekPercent('WE')}%` }" />
                  </span>
                  <span class="module-card__metric-value">{{ getTaskWeekCount("WE") }}题</span>
                </div>
              </div>

              <div class="module-card__actions">
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--primary" @click="router.push('/we')">随机练习</button>
                  <button type="button" class="module-btn module-btn--secondary" @click="router.push('/we/select')">选题练习</button>
                </div>
                <div class="module-card__actions-grid">
                  <button type="button" class="module-btn module-btn--ghost" @click="router.push('/we/templates')">看模板</button>
                  <button type="button" class="module-btn module-btn--ghost" @click="router.push('/we/opinions')">观点库</button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: #f4f6fb;
}

.topbar-inner,
.hero-inner,
.content-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding-left: 24px;
  padding-right: 24px;
}

.home-topbar {
  background: #ffffff;
  border-bottom: 1px solid #e6edf7;
}

.topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 18px;
  padding-bottom: 18px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: nowrap;
  flex: none;
}

.brand__mark {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: #1b315d;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  flex: none;
}

.brand__icon {
  width: 22px;
  height: 22px;
}

.brand__title {
  margin: 0;
  font-size: clamp(1.3rem, 4vw, 1.8rem);
  font-weight: 800;
  color: #13274b;
  letter-spacing: -0.03em;
  line-height: 1;
  white-space: nowrap;
  word-break: keep-all;
  flex: none;
}

.account-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px 8px 8px;
  border: 1px solid #dde7f4;
  border-radius: 22px;
  background: linear-gradient(180deg, #fbfdff 0%, #f4f8ff 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  min-width: 0;
  width: fit-content;
  max-width: min(100%, 360px);
  margin-left: auto;
  flex: 0 1 auto;
}

.account-card--clickable {
  cursor: pointer;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
}

.account-card--clickable:hover {
  border-color: #cfdcf0;
  box-shadow: 0 12px 24px rgba(19, 39, 75, 0.08);
}

.account-card--clickable:focus-visible {
  outline: 3px solid rgba(45, 99, 255, 0.2);
  outline-offset: 2px;
}

.account-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 18px;
  border-radius: 15px;
  font-size: 0.9rem;
  font-weight: 800;
  border: 1px solid transparent;
  white-space: nowrap;
  flex: none;
}

.account-pill--vip {
  background: #edf8ef;
  color: #1c8a4d;
  border-color: #d5ead7;
}

.account-pill--trial {
  background: #fff2eb;
  color: #df6f34;
  border-color: #f6c8b4;
}

.account-pill--neutral {
  background: #f3f5f9;
  color: #6f7c95;
  border-color: #dce4ef;
}

.account-card__badge-wrap {
  position: relative;
  width: 58px;
  height: 58px;
  flex: none;
}

.account-card__badge {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #5b79b3 0%, #344f80 34%, #1b315d 72%, #13274b 100%);
  border: 3px solid #dce6f8;
  color: #ffffff;
  font-size: 1.55rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 6px 12px rgba(19, 39, 75, 0.1);
  overflow: hidden;
}

.account-card__badge-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.account-card__crown {
  position: absolute;
  top: -8px;
  left: 11px;
  width: 20px;
  height: 20px;
  color: #f4b53f;
  filter: drop-shadow(0 2px 2px rgba(167, 109, 0, 0.18));
}

.account-card__spark {
  position: absolute;
  top: 6px;
  right: -1px;
  width: 12px;
  height: 12px;
  color: #7e96c9;
}

.account-card__crown-icon,
.account-card__spark-icon {
  width: 100%;
  height: 100%;
}

.account-card__panel {
  min-width: 0;
  min-height: 56px;
  padding: 0 12px;
  border-radius: 16px;
  background: #f5f8fe;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.account-card__panel-copy {
  min-width: 0;
}

.account-card__title {
  margin: 0;
  color: #15326a;
  font-size: 0.98rem;
  font-weight: 800;
  line-height: 1.15;
  white-space: nowrap;
}

.account-card__subtitle {
  margin: 4px 0 0;
  color: #8d98af;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.1;
  white-space: nowrap;
}

.account-card__arrow {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #18376d;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.account-card__arrow-icon {
  width: 16px;
  height: 16px;
}

.account-login {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid #d8e1ef;
  background: #ffffff;
  color: #16325d;
  font-size: 0.92rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  flex: none;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.account-login:hover {
  background: #f7f9fd;
  border-color: #bccbe1;
}

.home-hero {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #142d55 0%, #1a3b6b 55%, #10264a 100%);
}

.home-hero::before {
  content: "";
  position: absolute;
  top: -40px;
  right: -20px;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 0 0 54px rgba(255, 255, 255, 0.03);
}

.hero-inner {
  position: relative;
  z-index: 1;
  padding-top: 46px;
  padding-bottom: 40px;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 560px);
  gap: 28px;
  align-items: center;
}

.hero-copy__eyebrow {
  margin: 0 0 12px;
  font-size: 1.08rem;
  color: rgba(221, 234, 255, 0.82);
}

.hero-copy h1 {
  margin: 0;
  color: #ffffff;
  font-size: clamp(2.5rem, 5vw, 3.5rem);
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -0.04em;
}

.hero-copy__support {
  margin: 18px 0 0;
  font-size: 1.02rem;
  color: rgba(220, 233, 255, 0.76);
}

.hero-highlight-grid {
  justify-self: end;
  width: 100%;
  max-width: 560px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.hero-streak {
  width: 100%;
  border-radius: 28px;
  border: 1px solid rgba(239, 171, 136, 0.28);
  background: rgba(255, 255, 255, 0.08);
  padding: 22px 24px;
  backdrop-filter: blur(8px);
}

.hero-streak--secondary {
  border-color: rgba(161, 194, 255, 0.3);
  background: rgba(255, 255, 255, 0.06);
}

.hero-streak__row {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hero-streak__icon {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  background: rgba(234, 132, 86, 0.16);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.7rem;
  flex: none;
}

.hero-streak__icon--secondary {
  background: rgba(104, 159, 255, 0.16);
}

.hero-streak__value {
  margin: 0;
  font-size: 2.25rem;
  font-weight: 800;
  color: #ffb889;
  line-height: 1;
}

.hero-streak__value--secondary {
  color: #dbe7ff;
}

.hero-streak__label {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.96rem;
  font-weight: 700;
}

.hero-streak__caption {
  margin: 6px 0 0;
  font-size: 0.84rem;
  color: rgba(219, 231, 250, 0.72);
}

.hero-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-top: 30px;
}

.hero-mobile-grid {
  display: none;
}

.hero-stat {
  min-height: 124px;
  border-radius: 24px;
  border: 1px solid rgba(204, 221, 245, 0.16);
  background: rgba(255, 255, 255, 0.08);
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.hero-stat__value {
  margin: 0;
  color: #ffffff;
  font-size: 2.2rem;
  font-weight: 800;
  line-height: 1;
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

.hero-stat__suffix {
  font-size: 0.9rem;
  color: rgba(214, 227, 249, 0.86);
  margin-bottom: 4px;
}

.hero-stat__label {
  margin: 10px 0 0;
  font-size: 0.95rem;
  color: rgba(216, 228, 247, 0.78);
}

.hero-stat__hint {
  margin: 0;
  font-size: 0.92rem;
  color: rgba(201, 215, 238, 0.74);
}

.hero-stat__hint--positive {
  color: #6be69b;
}

.hero-mobile-card {
  border-radius: 24px;
  border: 1px solid rgba(204, 221, 245, 0.14);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.11) 0%, rgba(255, 255, 255, 0.08) 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(12px);
  padding: 18px 20px;
  min-height: 132px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
}

.hero-mobile-card--secondary {
  border-color: rgba(161, 194, 255, 0.3);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.06) 100%);
}

.hero-mobile-card__value {
  margin: 0;
  color: #ffffff;
  font-size: 2.05rem;
  font-weight: 800;
  line-height: 1;
  display: flex;
  align-items: flex-end;
  gap: 4px;
}

.hero-mobile-card__value--muted {
  color: rgba(147, 166, 194, 0.96);
}

.hero-mobile-card__value--secondary {
  color: #dbe7ff;
}

.hero-mobile-card__value--accent {
  color: #ffb889;
}

.hero-mobile-card__suffix {
  font-size: 0.92rem;
  color: rgba(201, 215, 238, 0.72);
  margin-bottom: 4px;
}

.hero-mobile-card__label {
  margin: 0;
  font-size: 0.95rem;
  color: rgba(216, 228, 247, 0.78);
  font-weight: 700;
  line-height: 1.3;
  display: flex;
  align-items: center;
  gap: 6px;
}

.hero-mobile-card__emoji {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.hero-mobile-card__hint {
  margin: 0;
  font-size: 0.86rem;
  color: rgba(201, 215, 238, 0.74);
  line-height: 1.35;
}

.hero-mobile-card__hint--positive {
  color: #6be69b;
}

.home-content {
  padding-bottom: 56px;
}

.content-inner {
  padding-top: 32px;
}

.surface-card {
  background: #ffffff;
  border: 1px solid #dbe4f0;
  border-radius: 30px;
  box-shadow: 0 22px 50px rgba(15, 23, 42, 0.06);
}

.heatmap-card {
  padding: 28px;
}

.heatmap-card__inner {
  width: min(100%, 980px);
  margin: 0 auto;
}

.content-section {
  margin-top: 26px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.section-header--plain {
  margin-bottom: 16px;
}

.section-header__title {
  margin: 0;
  font-size: 1.28rem;
  font-weight: 800;
  color: #11284d;
}

.section-header__subtle {
  margin: 7px 0 0;
  font-size: 0.92rem;
  color: #7a879f;
}

.section-header__summary {
  margin: 2px 0 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #203b68;
}

.heatmap-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.heatmap-week {
  display: grid;
  grid-template-columns: repeat(7, minmax(42px, 52px));
  gap: 12px;
}

.heatmap-day {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.heatmap-day--today {
  z-index: 1;
}

.heatmap-cell {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  border: 1.5px solid transparent;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.38);
  overflow: visible;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.heatmap-cell--today {
  border-color: rgba(128, 145, 171, 0.24);
  box-shadow:
    0 0 0 4px rgba(128, 145, 171, 0.08),
    0 8px 18px rgba(128, 145, 171, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.56);
}

.heatmap-cell--today::before {
  content: "";
  position: absolute;
  pointer-events: none;
}

.heatmap-cell--today::before {
  inset: -4px;
  border-radius: 16px;
  border: 1px solid rgba(128, 145, 171, 0.18);
}

.heatmap-day__label,
.heatmap-legend__text {
  font-size: 0.85rem;
  color: #8090aa;
}

.heatmap-day__label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 22px;
  line-height: 1.1;
  transition: color 180ms ease;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 8px;
}

.heatmap-legend__dot {
  width: 16px;
  height: 16px;
  border-radius: 5px;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
}

.module-card {
  background: #ffffff;
  border: 1px solid #d8e2ef;
  border-radius: 28px;
  padding: 24px;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.05);
}

.module-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.module-card__info {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
  flex: 1;
}

.module-card__icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: var(--module-icon-bg);
  color: var(--module-icon-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.module-card__icon-svg {
  width: 26px;
  height: 26px;
}

.module-card__copy {
  min-width: 0;
  flex: 1;
}

.module-card__title {
  margin: 0;
  color: #10284c;
  font-size: 1.55rem;
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.03em;
  word-break: keep-all;
}

.module-card__subtitle {
  margin: 8px 0 0;
  color: #e8793c;
  font-size: 0.96rem;
  font-weight: 700;
  word-break: keep-all;
}

.module-card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.module-chip {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #dae3ef;
  background: #f8fbff;
  color: #7283a0;
  font-size: 0.82rem;
  font-weight: 700;
}

.module-card__metric {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  min-width: 104px;
  justify-content: flex-end;
  flex: none;
}

.module-card__metric-track {
  width: 64px;
  height: 4px;
  border-radius: 999px;
  background: #dfe6f1;
  overflow: hidden;
}

.module-card__metric-track > span {
  display: block;
  height: 100%;
  background: var(--module-accent);
  border-radius: inherit;
}

.module-card__metric-value {
  font-size: 0.94rem;
  font-weight: 700;
  color: #6f7f97;
}

.module-card__actions {
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.module-card__actions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.module-card__actions-grid--single {
  grid-template-columns: 1fr;
}

.module-btn {
  min-height: 52px;
  padding: 0 16px;
  border-radius: 16px;
  border: 1px solid #d7e1ee;
  background: #ffffff;
  color: #17335f;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.module-btn:hover {
  transform: translateY(-1px);
}

.module-btn--primary {
  background: #162f59;
  border-color: #162f59;
  color: #ffffff;
}

.module-btn--primary:hover {
  background: #11294d;
  border-color: #11294d;
}

.module-btn--secondary:hover,
.module-btn--ghost:hover,
.module-btn--feature:hover {
  background: #f7f9fd;
  border-color: #bccce1;
}

.module-btn--feature {
  background: #f8fafc;
}

.module-btn__inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.module-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  border-radius: 999px;
  background: #eb8659;
  color: #ffffff;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1;
}

.module-favorites {
  margin-top: 4px;
  border: 1px solid #e6edf7;
  background: #f8fbff;
  border-radius: 22px;
  padding: 14px;
}

.module-favorites__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.module-favorites__head p {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 800;
  color: #11284d;
}

.module-favorites__head span,
.module-favorites__empty {
  font-size: 0.82rem;
  color: #7b8ba4;
}

.module-favorites__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 216px;
  overflow-y: auto;
}

.module-favorites__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  text-align: left;
  border: 1px solid #e1e9f4;
  background: #ffffff;
  border-radius: 14px;
  padding: 10px 12px;
  cursor: pointer;
}

.module-favorites__item:hover {
  background: #f5f8fd;
}

.module-favorites__item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #152d56;
  font-size: 0.83rem;
  font-weight: 700;
}

.module-favorites__item-tag {
  flex: none;
  padding: 4px 8px;
  border-radius: 999px;
  background: #edf3ff;
  color: #284fb1;
  font-size: 0.74rem;
  font-weight: 700;
}

@media (max-width: 768px) {
  .hero-grid {
    grid-template-columns: 1fr;
  }

  .hero-highlight-grid {
    justify-self: start;
    max-width: none;
  }

  .hero-stats-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .module-grid {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .topbar-inner {
    gap: 10px;
    padding-left: 16px;
    padding-right: 16px;
  }

  .hero-inner,
  .content-inner {
    padding-left: 16px;
    padding-right: 16px;
  }

  .brand {
    gap: 10px;
  }

  .brand__mark {
    width: 40px;
    height: 40px;
    border-radius: 12px;
  }

  .brand__icon {
    width: 20px;
    height: 20px;
  }

  .brand__title {
    font-size: clamp(1.08rem, 5vw, 1.35rem);
  }

  .account-card {
    gap: 8px;
    padding: 7px;
    max-width: min(100%, 308px);
  }

  .account-pill {
    min-height: 40px;
    padding: 0 14px;
    font-size: 0.8rem;
  }

  .account-card__badge-wrap {
    width: 52px;
    height: 52px;
  }

  .account-card__badge {
    font-size: 1.42rem;
  }

  .account-card__crown {
    top: -6px;
    left: 9px;
    width: 18px;
    height: 18px;
  }

  .account-card__spark {
    width: 11px;
    height: 11px;
  }

  .account-card__panel {
    min-height: 50px;
    padding: 0 10px;
    gap: 10px;
  }

  .account-card__title {
    font-size: 0.9rem;
  }

  .account-card__subtitle {
    font-size: 0.72rem;
  }

  .account-card__arrow {
    width: 31px;
    height: 31px;
  }

  .account-login {
    min-height: 34px;
    padding: 0 10px;
    font-size: 0.86rem;
  }

  .hero-inner {
    padding-top: 20px;
    padding-bottom: 24px;
  }

  .hero-copy__eyebrow {
    margin-bottom: 12px;
    font-size: 0.9rem;
  }

  .hero-copy h1 {
    font-size: clamp(2.35rem, 8vw, 3.15rem);
    line-height: 1.08;
  }

  .hero-copy__support {
    margin-top: 12px;
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .hero-grid {
    display: block;
  }

  .hero-copy {
    margin-bottom: 18px;
  }

  .hero-highlight-grid {
    display: none;
  }

  .hero-stats-grid {
    display: none;
  }

  .hero-mobile-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 18px;
  }

  .hero-mobile-card {
    min-height: 128px;
    border-radius: 20px;
    padding: 16px 14px 14px;
    gap: 8px;
  }

  .hero-mobile-card__value {
    font-size: 1.82rem;
  }

  .hero-mobile-card__label {
    font-size: 0.82rem;
    line-height: 1.28;
  }

  .hero-mobile-card__hint {
    font-size: 0.76rem;
    line-height: 1.32;
  }

  .heatmap-card,
  .module-card {
    padding: 20px;
  }

  .heatmap-week {
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
  }

  .heatmap-cell--today::before {
    inset: -2px;
  }

  .module-card__head {
    flex-direction: column;
  }

  .module-card__metric {
    min-width: 0;
    width: 100%;
    justify-content: flex-start;
    padding-top: 0;
  }
}

@media (max-width: 520px) {
  .hero-copy__eyebrow {
    font-size: 0.84rem;
  }

  .hero-copy h1 {
    font-size: clamp(1.95rem, 12vw, 2.75rem);
    line-height: 1.02;
  }

  .hero-copy__support {
    font-size: 0.82rem;
  }

  .hero-mobile-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .hero-mobile-card {
    min-height: 138px;
    padding: 16px 14px;
  }

  .hero-mobile-card__value {
    font-size: 1.9rem;
    gap: 2px;
  }

  .hero-mobile-card__suffix {
    font-size: 0.82rem;
    margin-bottom: 3px;
  }

  .hero-mobile-card__label {
    font-size: 0.88rem;
  }

  .hero-mobile-card__hint {
    font-size: 0.8rem;
  }
}

@media (max-width: 420px) {
  .topbar-inner {
    gap: 8px;
    padding-left: 12px;
    padding-right: 12px;
  }

  .brand {
    gap: 8px;
  }

  .brand__mark {
    width: 36px;
    height: 36px;
    border-radius: 11px;
  }

  .brand__icon {
    width: 18px;
    height: 18px;
  }

  .brand__title {
    font-size: 1rem;
  }

  .account-card {
    gap: 8px;
    padding: 6px;
    max-width: min(100%, 276px);
  }

  .account-pill {
    min-height: 36px;
    padding: 0 12px;
    font-size: 0.74rem;
  }

  .account-card__badge-wrap {
    width: 46px;
    height: 46px;
  }

  .account-card__badge {
    font-size: 1.24rem;
  }

  .account-card__crown {
    top: -6px;
    left: 8px;
    width: 17px;
    height: 17px;
  }

  .account-card__spark {
    top: 5px;
    width: 10px;
    height: 10px;
  }

  .account-card__title {
    font-size: 0.82rem;
  }

  .account-card__subtitle {
    font-size: 0.66rem;
  }

  .account-card__panel {
    min-height: 44px;
    padding: 0 8px;
    gap: 6px;
  }

  .account-card__arrow {
    width: 24px;
    height: 24px;
  }

  .account-card__arrow-icon {
    width: 13px;
    height: 13px;
  }

  .account-login {
    min-height: 30px;
    padding: 0 8px;
    font-size: 0.8rem;
  }
}
</style>




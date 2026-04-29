<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { isDIEnabled } from "@/lib/di-feature";
import { formatInteger, formatScore, loadHomeAnalyticsSnapshotForAuth } from "@/lib/home-analytics";
import {
  buildDesktopDashboardState,
  createEmptyDesktopDashboardState,
  fetchDashboardPracticeRowsForAuth,
  fetchDashboardScoreTrendRowsForAuth,
  fetchDashboardWeeklyPracticeRowsForAuth
} from "@/lib/home-desktop-dashboard";

const DESIGN_WIDTH = 2560;
const DESIGN_HEIGHT = 1399;
const MAX_DESKTOP_SCALE = 0.67;
const TREND_MIN_SCORE = 10;
const TREND_MAX_SCORE = 90;
const TREND_TICKS = [90, 70, 50, 30, 10];
const TREND_CHART = {
  left: 58,
  right: 472,
  top: 34,
  bottom: 176
};

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const { tasks } = storeToRefs(practiceStore);
const dashboard = ref(createEmptyDesktopDashboardState());
const replicaScale = ref(MAX_DESKTOP_SCALE);
const DASHBOARD_REFRESH_DEBOUNCE_MS = 1000;
let dashboardLoadPromise = null;
let lastPassiveDashboardRefreshAt = 0;

const fallbackNavItems = [
  { key: "home", label: "首页", icon: "◆", active: true },
  { key: "practice", label: "练习中心", icon: "▤" },
  { key: "coach", label: "AI 私教", icon: "◎" },
  { key: "plan", label: "学习计划", icon: "□" },
  { key: "report", label: "学习报告", icon: "▧" },
  { key: "library", label: "题库", icon: "▣" },
  { key: "profile", label: "个人中心", icon: "○" }
];

const fallbackFocusTasks = [
  { task_type: "RA", label: "完成 2 道 RA 练习", completed_count_today: 0, target_count: 2, progress: 0 },
  { task_type: "DI", label: "完成 2 道 DI 练习", completed_count_today: 0, target_count: 2, progress: 0 },
  { task_type: "WFD", label: "完成 5 道 WFD 练习", completed_count_today: 0, target_count: 5, progress: 0 }
];

const fallbackStatCards = [
  { label: "平均得分", value: "--", suffix: "", helper: "暂无上周对比", color: "#4e82ff", icon: "✓" },
  { label: "练习总量", value: "0", suffix: "题", helper: "今日完成 0 题", color: "#20c887", icon: "✓" },
  { label: "连续学习", value: "0", suffix: "天", helper: "今天开始建立节奏", color: "#ff7b21", icon: "●" }
];

const fallbackQuickModules = [
  { title: "RA", subtitle: "朗读句子\n流利表达", color: "#6d5df7", icon: "●" },
  { title: "WFD", subtitle: "写作填空\n语法拼写", color: "#20c887", icon: "◆" },
  { title: "RTS", subtitle: "复述句子\n逻辑连贯", color: "#ff8a24", icon: "▤" },
  { title: "DI", subtitle: "描述图表\n数据分析", color: "#7062f7", icon: "◔" },
  { title: "WE", subtitle: "写作议论文\n结构论证", color: "#3e7bff", icon: "▣" }
];

const fallbackHeatRows = [
  { label: "RA", cells: [2, 3, 2, 1, 2, 3, 1] },
  { label: "WFD", cells: [2, 4, 3, 2, 1, 2, 2] },
  { label: "RTS", cells: [1, 3, 4, 2, 2, 1, 2] },
  { label: "DI", cells: [3, 2, 3, 1, 2, 2, 1] },
  { label: "WE", cells: [1, 2, 1, 2, 3, 2, 1] }
];
const fallbackHeatDays = [
  { label: "一", isToday: false },
  { label: "二", isToday: false },
  { label: "三", isToday: false },
  { label: "四", isToday: false },
  { label: "五", isToday: false },
  { label: "六", isToday: false },
  { label: "日", isToday: false }
];
const heatLegendLevels = [1, 2, 3, 4];

const fallbackWeakItems = [
  { rank: 1, title: "DI 数据表描述", accuracy: "48%", delta: "较上周 ↓ 10%" },
  { rank: 2, title: "WE 论证充分性", accuracy: "59%", delta: "较上周 ↓ 6%" },
  { rank: 3, title: "RS 细节理解", accuracy: "56%", delta: "较上周 ↓ 4%" }
];

const fallbackRecentItems = [
  { type: "RA", title: "RA 练习 - 20题", score: "72/90", time: "05-16 10:32", color: "#7868ff" },
  { type: "DI", title: "DI 练习 - 数据图表题", score: "64/90", time: "05-16 09:41", color: "#8478ff" },
  { type: "WFD", title: "WFD 练习 - 20题", score: "70/90", time: "05-15 21:36", color: "#20c887" }
];

const taskVisuals = {
  RA: { title: "RA", subtitle: "朗读句子\n流利表达", color: "#6d5df7", icon: "●", path: "/ra" },
  WFD: { title: "WFD", subtitle: "写作填空\n语法拼写", color: "#20c887", icon: "◆", path: "/wfd" },
  RTS: { title: "RTS", subtitle: "复述句子\n逻辑连贯", color: "#ff8a24", icon: "▤", path: "/rts" },
  DI: { title: "DI", subtitle: "描述图表\n数据分析", color: "#7062f7", icon: "◔", path: "/di" },
  WE: { title: "WE", subtitle: "写作议论文\n结构论证", color: "#3e7bff", icon: "▣", path: "/we" }
};

const navItems = computed(() =>
  fallbackNavItems.map((item) => {
    const paths = {
      home: "/home",
      practice: "#quick",
      coach: "/agent",
      plan: "#goal",
      report: "#report",
      library: "#quick",
      profile: "/profile"
    };
    return { ...item, target: paths[item.key] || "" };
  })
);

const userDisplayName = computed(() => authStore.displayName || "小K");
const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim() || "/agent/user-avatar.png");
const homeAnalytics = computed(() => dashboard.value.homeAnalytics || {});
const heroSubtitle = computed(() => dashboard.value.heroTask?.subtitle || "根据真实练习记录自动生成今日任务");
const focusTitle = computed(() => dashboard.value.heroTask?.title || "今日重点");
const notificationCount = computed(() => {
  let count = 0;
  if (!homeAnalytics.value.todayCount) count += 1;
  if ((dashboard.value.weeklyGoal?.percent || 0) < 100) count += 1;
  return Math.max(1, count);
});

const scaledSlotStyle = computed(() => ({
  width: `${Math.ceil(DESIGN_WIDTH * replicaScale.value)}px`,
  height: `${Math.ceil(DESIGN_HEIGHT * replicaScale.value)}px`
}));

const canvasScaleStyle = computed(() => ({
  transform: `scale(${replicaScale.value})`
}));

const focusTasks = computed(() => {
  const realTasks = dashboard.value.heroTask?.checklist;
  const source = Array.isArray(realTasks) && realTasks.length ? realTasks : fallbackFocusTasks;
  return source.map((item) => {
    const current = Number(item.completed_count_today ?? item.current ?? 0);
    const total = Number(item.target_count ?? item.total ?? 0);
    const ratio = Number(item.progress ?? item.ratio ?? (total ? current / total : 0));
    return {
      label: item.label,
      count: item.count || `${formatInteger(current)}/${formatInteger(total)}`,
      width: Math.max(0, Math.min(100, Math.round(ratio * 100)))
    };
  });
});

const statCards = computed(() => {
  if (dashboard.value.loading) return fallbackStatCards;
  const averageScore = homeAnalytics.value.averageScore;
  const scoreComparisonText = homeAnalytics.value.scoreComparisonText || dashboard.value.trendMeta?.comparisonText || "暂无上周对比";
  const longestStreak = Number(homeAnalytics.value.longestStreak || homeAnalytics.value.currentStreak || 0);
  return [
    {
      label: "平均得分",
      value: averageScore === null || averageScore === undefined ? "--" : formatScore(averageScore),
      suffix: averageScore === null || averageScore === undefined ? "" : "/90",
      helper: homeAnalytics.value.scoredCount ? scoreComparisonText : "暂无上周对比",
      color: "#4e82ff",
      icon: "✓"
    },
    {
      label: "练习总量",
      value: formatInteger(homeAnalytics.value.totalCount || 0),
      suffix: "题",
      helper: `今日完成 ${formatInteger(homeAnalytics.value.todayCount || 0)} 题`,
      color: "#20c887",
      icon: "✓"
    },
    {
      label: "连续学习",
      value: formatInteger(homeAnalytics.value.currentStreak || 0),
      suffix: "天",
      helper: longestStreak ? `最长 ${formatInteger(longestStreak)} 天` : "今天开始建立节奏",
      color: "#ff7b21",
      icon: "●"
    }
  ];
});

const quickModules = computed(() => {
  const taskMap = new Map(tasks.value.map((task) => [`${task.id || ""}`.trim().toUpperCase(), task]));
  return ["RA", "WFD", "RTS", "DI", "WE"]
    .filter((taskType) => (taskType === "DI" ? isDIEnabled() : true))
    .map((taskType) => {
      const visual = taskVisuals[taskType];
      const task = taskMap.get(taskType);
      return {
        ...visual,
        path: task?.to || visual.path
      };
    });
});

const coachBanner = computed(() => dashboard.value.coach?.banner || "建议优先练习 RA 和 DI，提升整体得分效率");
const coachSummaries = computed(() => {
  const summaries = dashboard.value.coach?.summaries;
  const source = Array.isArray(summaries) && summaries.length
    ? summaries
    : [
      { text: "小K，今天我们重点突破 RA 流利度和 DI 数据解读能力，这样能更快提升你的整体分数。", time: "10:32" },
      { text: "从最近练习来看，DI 和 WE 的正确率偏低，建议安排针对性训练，2 天内可见提升哦。", time: "10:33" }
    ];
  return source.map((item) => (typeof item === "string" ? { text: item, time: "" } : item)).slice(0, 2);
});

const reminderTitle = computed(() => dashboard.value.reminder?.title || "今日有 3 个学习任务待完成");
const reminderDetail = computed(() => dashboard.value.reminder?.detail || "建议合理安排时间，保持连续学习");
const weeklyGoalPercent = computed(() => Math.max(0, Math.min(100, Math.round(Number(dashboard.value.weeklyGoal?.percent || 68)))));
const weeklyGoalCaption = computed(() => dashboard.value.weeklyGoal?.caption || "目标：平均分达到 70 分");

const heatDays = computed(() => {
  const weekDays = dashboard.value.weeklyStudy?.weekDays;
  if (Array.isArray(weekDays) && weekDays.length) {
    return weekDays.slice(0, 7).map((day) => ({
      label: day.isToday ? "今日" : day.label,
      dateLabel: day.dateLabel || "",
      isToday: Boolean(day.isToday)
    }));
  }
  return fallbackHeatDays;
});

const heatRows = computed(() => {
  const matrix = dashboard.value.heatmapMatrix;
  if (Array.isArray(matrix) && matrix.length) {
    return matrix.map((row) => ({
      label: row.label || row.taskType,
      cells: (row.cells || []).slice(0, 7).map((cell, index) => {
        const level = Number(cell.level || 0);
        const day = heatDays.value[index] || {};
        return {
          level: Number.isFinite(level) ? Math.max(0, Math.min(4, level)) : 0,
          count: Number(cell.count || 0),
          dateLabel: cell.dateLabel || day.dateLabel || "",
          isToday: Boolean(cell.isToday || day.isToday)
        };
      })
    }));
  }
  return fallbackHeatRows.map((row) => ({
    label: row.label,
    cells: row.cells.map((level, index) => ({
      level,
      count: level,
      dateLabel: heatDays.value[index]?.dateLabel || "",
      isToday: Boolean(heatDays.value[index]?.isToday)
    }))
  }));
});

const weeklyStudyFoot = computed(() => {
  const weeklyStudy = dashboard.value.weeklyStudy || {};
  const minutes = Number(weeklyStudy.estimatedWeekMinutes || 0);
  const hours = Number.isFinite(minutes) ? minutes / 60 : 0;
  const prefix = weeklyStudy.usesEstimatedDuration ? "本周学习约" : "本周学习";
  return `${prefix} ${formatScore(hours)} 小时`;
});

const trendLabels = computed(() => {
  const points = dashboard.value.scoreTrend;
  if (!Array.isArray(points) || !points.length) return ["05-10", "05-11", "05-12", "05-13", "05-14", "05-15", "05-16"];
  return points.map((point) => point.label);
});

const trendSourcePoints = computed(() => {
  const points = dashboard.value.scoreTrend;
  return Array.isArray(points) ? points.slice(0, 7) : [];
});

const trendYTicks = computed(() =>
  TREND_TICKS.map((value) => ({
    value,
    y: scoreToTrendY(value)
  }))
);

const trendPlotPoints = computed(() => {
  return trendLineSegments.value.flatMap((segment) => segment.points);
});

const trendLineSegments = computed(() => {
  const sourcePoints = trendSourcePoints.value;
  const segments = [];
  let current = [];

  sourcePoints.forEach((point, index) => {
    const plottedPoint = createTrendPlotPoint(point, index, sourcePoints.length);
    if (!plottedPoint) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }

    current.push(plottedPoint);
  });

  if (current.length) segments.push(current);

  return segments.map((points, index) => ({
    key: `trend-segment-${index}`,
    points,
    polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
    areaPath: points.length > 1
      ? `M${points[0].x} ${TREND_CHART.bottom} ${points.map((point) => `L${point.x} ${point.y}`).join(" ")} L${points[points.length - 1].x} ${TREND_CHART.bottom} Z`
      : ""
  }));
});

const trendDrawableSegments = computed(() => trendLineSegments.value.filter((segment) => segment.points.length > 1));

const trendHasData = computed(() => trendPlotPoints.value.length > 0);
const trendFootText = computed(() => {
  const meta = dashboard.value.trendMeta || {};
  if (!trendHasData.value) return "近 7 天暂无评分记录";
  if (trendPlotPoints.value.length === 1) return "近 7 天仅 1 天有评分记录";
  return meta.comparisonText || "暂无上周对比";
});

const trendScoreChip = computed(() => {
  const latestPoint = [...trendPlotPoints.value].reverse()[0];
  if (!latestPoint) {
    return {
      label: "近 7 天",
      value: "--"
    };
  }
  return {
    label: `${latestPoint.label} 平均分`,
    value: latestPoint.displayValue
  };
});

function scoreToTrendY(value) {
  const numeric = Number(value);
  const clamped = Math.max(TREND_MIN_SCORE, Math.min(TREND_MAX_SCORE, Number.isFinite(numeric) ? numeric : TREND_MIN_SCORE));
  const ratio = (clamped - TREND_MIN_SCORE) / (TREND_MAX_SCORE - TREND_MIN_SCORE);
  return TREND_CHART.bottom - ratio * (TREND_CHART.bottom - TREND_CHART.top);
}

function createTrendPlotPoint(point, index, total) {
  if (point?.value === null || point?.value === undefined || point?.value === "") return null;

  const value = Number(point?.value);
  if (!Number.isFinite(value)) return null;

  const xStep = (TREND_CHART.right - TREND_CHART.left) / Math.max(1, total - 1 || 6);
  const x = TREND_CHART.left + xStep * index;
  const y = scoreToTrendY(value);
  return {
    key: point.key || `${point.label}-${index}`,
    label: point.label || "",
    value,
    displayValue: formatScore(value),
    practiceCount: Number(point.practiceCount || point.scoredCount || 0),
    x: Number(x.toFixed(1)),
    y: Number(y.toFixed(1))
  };
}

function formatTrendPointTitle(point) {
  return `${point.label}，平均分 ${point.displayValue}，练习 ${formatInteger(point.practiceCount)} 次`;
}

const trendEmptyText = computed(() => {
  if (!trendHasData.value) return "近 7 天暂无评分记录";
  if (trendPlotPoints.value.length === 1) return "近 7 天仅 1 天有评分记录";
  return "";
});

const weakItems = computed(() => {
  const realItems = dashboard.value.weakPoints;
  const source = Array.isArray(realItems) && realItems.length ? realItems : fallbackWeakItems;
  return source.slice(0, 3).map((item, index) => ({
    rank: index + 1,
    title: item.title ? `${item.label || ""} ${item.title}`.trim() : item.title,
    accuracy: typeof item.accuracy === "number" ? `${formatInteger(item.accuracy)}%` : (item.accuracy || "--"),
    delta: item.deltaText || item.delta || "较上周 ↓ 4%"
  }));
});

const recentItems = computed(() => {
  const realItems = dashboard.value.recentPractices;
  const source = Array.isArray(realItems) && realItems.length ? realItems : fallbackRecentItems;
  return source.slice(0, 3).map((item) => ({
    type: item.taskType || item.type,
    title: item.title,
    score: item.scoreLabel || item.score || "--",
    time: item.timeLabel || item.time || "--",
    color: item.accent || item.color || "#7868ff"
  }));
});

async function loadDashboard(options = {}) {
  if (dashboardLoadPromise) return dashboardLoadPromise;

  const { showLoading = true } = options;
  const currentLoad = (async () => {
    if (showLoading) {
      dashboard.value = createEmptyDesktopDashboardState();
    }
    try {
      if (!authStore.loaded) {
        await authStore.loadStatus();
      }

      const analyticsSnapshot = await loadHomeAnalyticsSnapshotForAuth(authStore);
      let rows = [];
      let weeklyRows = [];
      let trendRows = { currentRows: [], previousRows: [] };

      try {
        rows = await fetchDashboardPracticeRowsForAuth(authStore);
      } catch (error) {
        console.warn("Replica dashboard rows load failed:", error);
      }

      try {
        weeklyRows = await fetchDashboardWeeklyPracticeRowsForAuth(authStore);
      } catch (error) {
        console.warn("Replica dashboard weekly rows load failed:", error);
      }

      try {
        trendRows = await fetchDashboardScoreTrendRowsForAuth(authStore);
      } catch (error) {
        console.warn("Replica dashboard trend rows load failed:", error);
      }

      dashboard.value = buildDesktopDashboardState(analyticsSnapshot, rows, {
        diEnabled: isDIEnabled(),
        weeklyRows,
        trendRows
      });
    } catch (error) {
      console.warn("Replica dashboard load failed:", error);
      dashboard.value = {
        ...createEmptyDesktopDashboardState(),
        loading: false
      };
    }
  })();

  dashboardLoadPromise = currentLoad;
  try {
    return await currentLoad;
  } finally {
    if (dashboardLoadPromise === currentLoad) {
      dashboardLoadPromise = null;
    }
  }
}

function updateReplicaScale() {
  if (typeof window === "undefined") return;
  const widthScale = window.innerWidth / DESIGN_WIDTH;
  const heightScale = window.innerHeight / DESIGN_HEIGHT;
  replicaScale.value = Number(Math.max(0.1, Math.min(widthScale, heightScale, MAX_DESKTOP_SCALE)).toFixed(4));
}

function handleNav(item) {
  if (!item?.target) return;
  if (item.target.startsWith("#")) {
    const id = item.target.slice(1);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  router.push(item.target);
}

function openPath(path) {
  if (path) router.push(path);
}

function formatHeatCellTitle(row, cell) {
  const date = cell.dateLabel ? `${cell.dateLabel} ` : "";
  return `${date}${row.label} 练习 ${formatInteger(cell.count || 0)} 次`;
}

function refreshDashboardOnFocus() {
  const now = Date.now();
  if (now - lastPassiveDashboardRefreshAt < DASHBOARD_REFRESH_DEBOUNCE_MS) return;

  lastPassiveDashboardRefreshAt = now;
  loadDashboard({ showLoading: false });
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    refreshDashboardOnFocus();
  }
}

onMounted(() => {
  updateReplicaScale();
  window.addEventListener("resize", updateReplicaScale);
  window.addEventListener("focus", refreshDashboardOnFocus);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  loadDashboard();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateReplicaScale);
  window.removeEventListener("focus", refreshDashboardOnFocus);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<template>
  <div class="home-replica-page">
    <div class="home-replica-scale-slot" :style="scaledSlotStyle">
      <div class="home-replica-canvas" :style="canvasScaleStyle">
      <aside class="replica-sidebar">
        <div class="replica-brand">
          <div class="replica-brand-mark" aria-hidden="true"></div>
          <div class="replica-brand-text">开口</div>
        </div>

        <nav class="replica-nav" aria-label="复刻页面导航">
          <button
            v-for="item in navItems"
            :key="item.key"
            class="replica-nav-item"
            :class="{ 'replica-nav-item--active': item.active }"
            type="button"
            @click="handleNav(item)"
          >
            <span class="replica-nav-icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </button>
        </nav>

        <section class="replica-resource-card">
          <p class="replica-resource-title">PTE 备考资料包</p>
          <p class="replica-resource-copy">真题 · 高频词汇 · 模板</p>
          <button class="replica-resource-button" type="button">免费领取</button>
          <div class="replica-gift" aria-hidden="true">
            <span class="replica-gift-box"></span>
            <span class="replica-gift-lid"></span>
            <span class="replica-gift-ribbon"></span>
          </div>
        </section>
      </aside>

      <main class="replica-main">
        <header class="replica-topbar">
          <div class="replica-greeting">
            <h1>你好，{{ userDisplayName }} <span>👋</span></h1>
            <p>坚持每天进步一点点，PTE 梦想更进一步！</p>
          </div>

          <div class="replica-top-actions">
            <label class="replica-search">
              <span class="replica-search-icon">⌕</span>
              <input type="text" value="" placeholder="搜索题目、技巧、课程..." readonly />
              <span class="replica-keycap">⌘ /</span>
            </label>
            <button class="replica-bell" type="button" aria-label="通知">
              <span>♧</span>
              <em>{{ notificationCount }}</em>
            </button>
            <button class="replica-profile" type="button" @click="openPath('/profile')">
              <img :src="userAvatarUrl" alt="小K" />
              <strong>{{ userDisplayName }}</strong>
              <span>⌄</span>
            </button>
          </div>
        </header>

        <section class="replica-content">
          <div class="replica-left-column">
            <section class="replica-hero">
              <div class="replica-hero-copy">
                <h2>你的 <span>PTE</span> 学习总控台</h2>
                <p>{{ heroSubtitle }}</p>

                <div class="replica-focus-card">
                  <h3><span>◎</span> {{ focusTitle }}</h3>
                  <div v-for="task in focusTasks" :key="task.label" class="replica-focus-row">
                    <span class="replica-check">✓</span>
                    <strong>{{ task.label }}</strong>
                    <i class="replica-progress">
                      <b :style="{ width: `${task.width}%` }"></b>
                    </i>
                    <em>{{ task.count }}</em>
                  </div>
                </div>
              </div>

              <div class="replica-stat-grid">
                <article v-for="stat in statCards" :key="stat.label" class="replica-stat-card">
                  <span class="replica-stat-icon" :style="{ backgroundColor: stat.color }">{{ stat.icon }}</span>
                  <div>
                    <p>{{ stat.label }}</p>
                    <strong>{{ stat.value }} <small>{{ stat.suffix }}</small></strong>
                    <em>{{ stat.helper }}</em>
                  </div>
                </article>
              </div>
            </section>

            <section id="quick" class="replica-card replica-quick-card">
              <h3>模块快捷入口</h3>
              <div class="replica-quick-grid">
                <article
                  v-for="item in quickModules"
                  :key="item.title"
                  class="replica-quick-item"
                  role="button"
                  tabindex="0"
                  :aria-label="`进入 ${item.title} 练习`"
                  @click="openPath(item.path)"
                  @keydown.enter="openPath(item.path)"
                  @keydown.space.prevent="openPath(item.path)"
                >
                  <span class="replica-quick-icon" :style="{ backgroundColor: item.color }">{{ item.icon }}</span>
                  <div>
                    <strong>{{ item.title }}</strong>
                    <p>{{ item.subtitle }}</p>
                  </div>
                  <em>›</em>
                </article>
              </div>
            </section>
          </div>

          <div class="replica-right-column">
            <section class="replica-card replica-ai-card">
              <div class="replica-section-head">
                <h3><span>✦</span> AI 私教 <small>· 为你量身建议</small></h3>
                <button type="button" @click="openPath('/agent')">与 AI 私教对话 →</button>
              </div>

              <div class="replica-suggestion">
                <span>♧</span>
                <strong>{{ coachBanner }}</strong>
              </div>

              <div class="replica-chat-list">
                <div v-for="summary in coachSummaries" :key="`${summary.text}-${summary.time}`" class="replica-chat-row">
                  <img src="/agent/assistant-avatar.png" alt="AI" />
                  <div class="replica-chat-bubble">
                    <p>{{ summary.text }}</p>
                    <time>{{ summary.time }}</time>
                  </div>
                </div>
              </div>

              <div class="replica-ai-actions">
                <button type="button" @click="openPath('/ra')"><span>▣</span> 生成今日计划</button>
                <button type="button" @click="handleNav({ target: '#weakness' })"><span>◎</span> 分析我的弱项</button>
                <button type="button" @click="handleNav({ target: '#trend' })"><span>↗</span> 查看 7 天趋势</button>
              </div>
            </section>

            <div class="replica-side-card-grid">
              <section class="replica-card replica-mini-card">
                <div class="replica-mini-title"><span>♧</span><strong>学习提醒</strong><em>›</em></div>
                <p class="replica-reminder-main">{{ reminderTitle }}</p>
                <p class="replica-reminder-copy">{{ reminderDetail }}</p>
                <button type="button" @click="handleNav({ target: '#quick' })">去查看任务</button>
              </section>

              <section id="goal" class="replica-card replica-mini-card">
                <div class="replica-mini-title"><span>◎</span><strong>本周目标进度</strong><em>›</em></div>
                <div class="replica-goal-percent">{{ weeklyGoalPercent }}%</div>
                <div class="replica-goal-track"><span :style="{ width: `${weeklyGoalPercent}%` }"></span></div>
                <p class="replica-reminder-copy">{{ weeklyGoalCaption }}</p>
                <button type="button">去调整目标</button>
              </section>
            </div>
          </div>

          <section id="report" class="replica-bottom-grid">
            <article class="replica-card replica-heatmap-card">
              <div class="replica-bottom-title">
                <h3>本周学习热力图 <span>◎</span></h3>
              </div>
              <div class="replica-heatmap">
                <div class="replica-heatmap-days">
                  <span></span>
                  <span
                    v-for="day in heatDays"
                    :key="`${day.label}-${day.dateLabel}`"
                    :class="{ 'is-today': day.isToday }"
                    :title="day.dateLabel"
                  >
                    {{ day.label }}
                  </span>
                </div>
                <div v-for="row in heatRows" :key="row.label" class="replica-heatmap-row">
                  <strong>{{ row.label }}</strong>
                  <i
                    v-for="(cell, index) in row.cells"
                    :key="`${row.label}-${index}`"
                    :class="[`heat-${cell.level}`, { 'is-today': cell.isToday }]"
                    :title="formatHeatCellTitle(row, cell)"
                  ></i>
                </div>
              </div>
              <div class="replica-heat-legend">
                <span>少</span>
                <i v-for="level in heatLegendLevels" :key="level" :class="`heat-${level}`"></i>
                <span>多</span>
              </div>
              <p class="replica-bottom-foot">{{ weeklyStudyFoot }}</p>
            </article>

            <article id="trend" class="replica-card replica-trend-card">
              <div class="replica-bottom-title">
                <h3>得分趋势（近 7 天）</h3>
                <span class="replica-score-chip">{{ trendScoreChip.label }}<br /><strong>{{ trendScoreChip.value }}</strong></span>
              </div>
              <svg class="replica-trend-chart" viewBox="0 0 500 210" role="img" aria-label="得分趋势">
                <defs>
                  <linearGradient id="replicaTrendFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="rgba(62, 107, 255, 0.22)" />
                    <stop offset="100%" stop-color="rgba(62, 107, 255, 0.02)" />
                  </linearGradient>
                </defs>
                <line
                  v-for="tick in trendYTicks"
                  :key="`grid-${tick.value}`"
                  :x1="TREND_CHART.left"
                  :x2="TREND_CHART.right"
                  :y1="tick.y"
                  :y2="tick.y"
                  class="trend-grid"
                />
                <text v-for="tick in trendYTicks" :key="`tick-${tick.value}`" x="8" :y="tick.y + 5">{{ tick.value }}</text>
                <path v-for="segment in trendDrawableSegments" :key="`${segment.key}-area`" :d="segment.areaPath" fill="url(#replicaTrendFill)" />
                <polyline v-for="segment in trendDrawableSegments" :key="`${segment.key}-line`" :points="segment.polyline" class="trend-line" />
                <text v-if="!trendHasData" class="trend-empty-state" x="265" y="108" text-anchor="middle">{{ trendEmptyText }}</text>
                <circle v-for="point in trendPlotPoints" :key="point.key" :cx="point.x" :cy="point.y" r="6">
                  <title>{{ formatTrendPointTitle(point) }}</title>
                </circle>
              </svg>
              <div class="replica-trend-labels"><span v-for="label in trendLabels" :key="label">{{ label }}</span></div>
              <p class="replica-bottom-foot">{{ trendFootText }}</p>
            </article>

            <article id="weakness" class="replica-card replica-weak-card">
              <div class="replica-bottom-title replica-bottom-title--link">
                <h3>我的弱项 Top 3</h3>
                <a href="#">查看全部 →</a>
              </div>
              <div class="replica-weak-list">
                <div v-for="item in weakItems" :key="item.rank" class="replica-weak-row">
                  <span>{{ item.rank }}</span>
                  <strong>{{ item.title }}</strong>
                  <em>正确率 {{ item.accuracy }}</em>
                  <i>{{ item.delta }}</i>
                </div>
              </div>
            </article>

            <article class="replica-card replica-recent-card">
              <div class="replica-bottom-title replica-bottom-title--link">
                <h3>最近练习</h3>
                <a href="#">查看全部 →</a>
              </div>
              <div class="replica-recent-list">
                <div v-for="item in recentItems" :key="item.title" class="replica-recent-row">
                  <span :style="{ backgroundColor: item.color }">{{ item.type }}</span>
                  <strong>{{ item.title }}</strong>
                  <em>得分 {{ item.score }}</em>
                  <time>{{ item.time }}</time>
                  <i>›</i>
                </div>
              </div>
            </article>
          </section>
        </section>
      </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-replica-page {
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  background: #f8faff;
}

.home-replica-scale-slot {
  position: relative;
  overflow: visible;
}

.home-replica-canvas,
.home-replica-canvas * {
  box-sizing: border-box;
}

.home-replica-canvas {
  position: relative;
  width: 2560px;
  height: 1399px;
  transform-origin: top left;
  overflow: hidden;
  display: grid;
  grid-template-columns: 360px 1fr;
  background:
    radial-gradient(circle at 70% -6%, rgba(225, 231, 255, 0.88), transparent 28%),
    linear-gradient(180deg, #f9fbff 0%, #f7faff 46%, #f8fbff 100%);
  color: #17213f;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
}

.replica-sidebar {
  position: relative;
  height: 1399px;
  padding: 32px 30px 0;
  border-right: 1px solid #e7edf8;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 249, 255, 0.96));
  box-shadow: 28px 0 58px rgba(59, 89, 150, 0.055);
}

.replica-brand {
  display: flex;
  align-items: center;
  gap: 22px;
  padding-left: 26px;
}

.replica-brand-mark {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1674ff 0%, #1662ee 100%);
  box-shadow: 0 18px 32px rgba(26, 105, 245, 0.2);
}

.replica-brand-mark::before {
  content: "";
  position: absolute;
  left: 15px;
  top: 13px;
  width: 21px;
  height: 27px;
  border: 11px solid #fff;
  border-right: 0;
  border-radius: 14px 0 0 14px;
}

.replica-brand-mark::after {
  content: "";
  position: absolute;
  right: 11px;
  bottom: 11px;
  width: 19px;
  height: 19px;
  border-radius: 6px;
  background: #fff;
}

.replica-brand-text {
  color: #111629;
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
}

.replica-nav {
  display: grid;
  gap: 24px;
  margin-top: 67px;
}

.replica-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px;
  height: 72px;
  width: 306px;
  border: 0;
  border-radius: 10px;
  padding: 0 28px;
  background: transparent;
  color: #6d7897;
  font: inherit;
  font-size: 25px;
  font-weight: 800;
}

.replica-nav-item--active {
  color: #176cff;
  background: linear-gradient(90deg, #e9efff 0%, rgba(242, 246, 255, 0.82) 100%);
}

.replica-nav-item--active::after {
  content: "";
  position: absolute;
  top: 0;
  right: -1px;
  width: 6px;
  height: 100%;
  border-radius: 10px 0 0 10px;
  background: #236cff;
}

.replica-nav-icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: currentColor;
  font-size: 24px;
  line-height: 1;
}

.replica-resource-card {
  position: absolute;
  left: 33px;
  bottom: 125px;
  width: 304px;
  height: 265px;
  overflow: hidden;
  padding: 26px 24px;
  border: 1px solid #edf2fb;
  border-radius: 16px;
  background: linear-gradient(180deg, #f4f7ff 0%, #eef2ff 100%);
}

.replica-resource-title {
  margin: 0;
  color: #2a365a;
  font-size: 23px;
  font-weight: 900;
}

.replica-resource-copy {
  margin: 18px 0 0;
  color: #7f8aaa;
  font-size: 17px;
  font-weight: 700;
}

.replica-resource-button {
  position: relative;
  z-index: 2;
  height: 47px;
  margin-top: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 25px;
  background: linear-gradient(135deg, #7363ff, #8b72ff);
  box-shadow: 0 18px 32px rgba(116, 101, 255, 0.24);
  color: #fff;
  font-size: 17px;
  font-weight: 800;
}

.replica-gift {
  position: absolute;
  right: 22px;
  bottom: 24px;
  width: 92px;
  height: 88px;
  transform: rotate(-12deg);
}

.replica-gift-box,
.replica-gift-lid {
  position: absolute;
  display: block;
  border-radius: 12px;
  background: linear-gradient(135deg, #5e88ff, #8a6bff);
  box-shadow: 0 16px 24px rgba(93, 117, 255, 0.2);
}

.replica-gift-box {
  left: 18px;
  bottom: 0;
  width: 56px;
  height: 54px;
}

.replica-gift-lid {
  left: 10px;
  top: 17px;
  width: 72px;
  height: 20px;
}

.replica-gift-ribbon {
  position: absolute;
  left: 40px;
  top: 14px;
  width: 13px;
  height: 70px;
  border-radius: 999px;
  background: #ff9d3b;
}

.replica-gift::before,
.replica-gift::after {
  content: "";
  position: absolute;
  top: 0;
  width: 28px;
  height: 22px;
  border: 7px solid #686cff;
  border-radius: 999px 999px 4px 999px;
}

.replica-gift::before {
  left: 23px;
  transform: rotate(28deg);
}

.replica-gift::after {
  right: 21px;
  transform: rotate(-28deg) scaleX(-1);
}

.replica-main {
  position: relative;
  height: 1399px;
}

.replica-topbar {
  position: absolute;
  inset: 0 0 auto 0;
  height: 130px;
  border-bottom: 1px solid #e8eef8;
  background: rgba(255, 255, 255, 0.42);
}

.replica-greeting {
  position: absolute;
  left: 58px;
  top: 29px;
}

.replica-greeting h1 {
  margin: 0;
  color: #16213f;
  font-size: 31px;
  line-height: 1.24;
  font-weight: 900;
  letter-spacing: 0;
}

.replica-greeting p {
  margin: 9px 0 0;
  color: #8a96b4;
  font-size: 18px;
  font-weight: 700;
}

.replica-top-actions {
  position: absolute;
  top: 29px;
  right: 78px;
  display: flex;
  align-items: center;
  gap: 24px;
}

.replica-search {
  display: flex;
  align-items: center;
  width: 568px;
  height: 62px;
  gap: 15px;
  padding: 0 17px 0 23px;
  border: 1px solid #dfe7f4;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.replica-search-icon {
  color: #7082ad;
  font-size: 30px;
  line-height: 1;
}

.replica-search input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #697798;
  font: inherit;
  font-size: 18px;
  font-weight: 800;
}

.replica-search input::placeholder {
  color: #7f8fac;
  opacity: 1;
}

.replica-keycap {
  display: grid;
  place-items: center;
  min-width: 62px;
  height: 37px;
  border-radius: 999px;
  background: #fbfcff;
  box-shadow: inset 0 0 0 1px #e4ebf6;
  color: #8b98b1;
  font-size: 18px;
  font-weight: 900;
}

.replica-bell {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 0;
  background: transparent;
  color: #7887a6;
  font-size: 31px;
}

.replica-bell em {
  position: absolute;
  top: 0;
  right: 2px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 3px solid #fff;
  border-radius: 999px;
  background: #ff333d;
  color: #fff;
  font-size: 13px;
  font-style: normal;
  font-weight: 900;
}

.replica-profile {
  display: flex;
  align-items: center;
  gap: 18px;
  border: 0;
  background: transparent;
  color: #16213f;
  font: inherit;
}

.replica-profile img {
  width: 56px;
  height: 56px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 0 0 4px #fff;
}

.replica-profile strong {
  font-size: 21px;
  font-weight: 900;
}

.replica-profile span {
  color: #6f7fa1;
  font-size: 22px;
}

.replica-content {
  position: absolute;
  left: 45px;
  top: 160px;
  width: 2107px;
  height: 1239px;
}

.replica-left-column {
  position: absolute;
  left: 0;
  top: 0;
  width: 1094px;
}

.replica-right-column {
  position: absolute;
  right: 0;
  top: 0;
  width: 977px;
}

.replica-card,
.replica-hero {
  border: 1px solid rgba(230, 236, 248, 0.96);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 12px 32px rgba(69, 94, 155, 0.055);
}

.replica-hero {
  position: relative;
  width: 1094px;
  height: 633px;
  overflow: hidden;
  border-radius: 22px;
  background: #eef1ff url("/home/desktop-hero-bg.png") center / 100% 100% no-repeat;
}

.replica-hero::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.06) 50%, transparent 70%);
  pointer-events: none;
}

.replica-hero-copy {
  position: absolute;
  left: 37px;
  top: 44px;
  width: 548px;
}

.replica-hero-copy h2 {
  margin: 0;
  color: #111b39;
  font-size: 52px;
  line-height: 1.12;
  font-weight: 950;
  letter-spacing: 0;
  white-space: nowrap;
}

.replica-hero-copy h2 span {
  color: #1971ff;
}

.replica-hero-copy > p {
  margin: 20px 0 0;
  color: #6f7e9d;
  font-size: 24px;
  font-weight: 800;
}

.replica-focus-card {
  width: 535px;
  height: 235px;
  margin-top: 17px;
  padding: 26px 40px 34px 30px;
  border: 1px solid rgba(240, 243, 251, 0.9);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 18px 42px rgba(94, 109, 177, 0.12);
  backdrop-filter: blur(6px);
}

.replica-focus-card h3 {
  display: flex;
  align-items: center;
  gap: 15px;
  margin: 0 0 21px;
  color: #202943;
  font-size: 22px;
  font-weight: 950;
}

.replica-focus-card h3 span {
  color: #ff3e48;
  font-size: 26px;
}

.replica-focus-row {
  display: grid;
  grid-template-columns: 22px 175px 170px 44px;
  align-items: center;
  gap: 13px;
  height: 39px;
  color: #33405d;
  font-size: 18px;
  font-weight: 800;
}

.replica-check {
  display: grid;
  place-items: center;
  width: 17px;
  height: 17px;
  border: 3px solid #a3afc5;
  border-radius: 999px;
  color: #7f8fab;
  font-size: 10px;
  line-height: 1;
}

.replica-progress {
  position: relative;
  display: block;
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8edf6;
}

.replica-progress b {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: inherit;
  background: linear-gradient(90deg, #3769ff, #6e80ff);
}

.replica-focus-row em {
  color: #73809e;
  font-style: normal;
  text-align: right;
}

.replica-stat-grid {
  position: absolute;
  left: 29px;
  right: 25px;
  bottom: 32px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.replica-stat-card {
  display: flex;
  align-items: flex-start;
  gap: 24px;
  height: 165px;
  padding: 26px 34px 31px;
  border: 1px solid rgba(239, 242, 250, 0.92);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 16px 34px rgba(74, 92, 151, 0.06);
}

.replica-stat-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 45px;
  height: 45px;
  margin-top: 22px;
  border-radius: 15px;
  color: #fff;
  font-size: 25px;
  font-weight: 900;
  box-shadow: 0 12px 20px rgba(67, 97, 190, 0.16);
}

.replica-stat-card > div {
  transform: translateY(-10px);
}

.replica-stat-card p {
  margin: 0;
  color: #667491;
  font-size: 18px;
  font-weight: 900;
}

.replica-stat-card strong {
  display: block;
  margin-top: 10px;
  color: #17203d;
  font-size: 38px;
  line-height: 1;
  font-weight: 950;
}

.replica-stat-card small {
  color: #697692;
  font-size: 18px;
  font-weight: 800;
}

.replica-stat-card em {
  display: block;
  margin-top: 16px;
  color: #667491;
  font-size: 17px;
  font-style: normal;
  font-weight: 800;
}

.replica-quick-card {
  width: 1094px;
  height: 240px;
  margin-top: 28px;
  padding: 25px 29px;
  border-radius: 18px;
}

.replica-quick-card h3 {
  margin: 0;
  color: #222b48;
  font-size: 20px;
  font-weight: 950;
}

.replica-quick-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 18px;
  margin-top: 25px;
}

.replica-quick-item {
  position: relative;
  display: grid;
  grid-template-columns: 45px minmax(70px, 1fr) 12px;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 144px;
  padding: 0 13px 0 14px;
  border: 1px solid #e4ebf6;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 12px 26px rgba(61, 88, 150, 0.04);
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.replica-quick-item:hover {
  border-color: #c7d2fe;
  background: #ffffff;
  box-shadow: 0 18px 34px rgba(61, 88, 150, 0.12);
  transform: translateY(-4px);
}

.replica-quick-item:focus-visible {
  border-color: #8da2ff;
  box-shadow: 0 0 0 4px rgba(91, 111, 255, 0.16), 0 18px 34px rgba(61, 88, 150, 0.12);
  outline: none;
  transform: translateY(-4px);
}

.replica-quick-icon {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  border-radius: 999px;
  color: #fff;
  font-size: 20px;
  font-weight: 900;
}

.replica-quick-item strong {
  display: block;
  color: #26304d;
  font-size: 23px;
  line-height: 1;
  font-weight: 950;
}

.replica-quick-item p {
  margin: 14px 0 0;
  color: #7785a2;
  white-space: pre;
  font-size: 15px;
  line-height: 1.45;
  font-weight: 800;
}

.replica-quick-item em {
  color: #6f7fa2;
  font-size: 34px;
  font-style: normal;
  line-height: 1;
}

.replica-ai-card {
  height: 555px;
  padding: 27px 25px 21px;
  border-radius: 20px;
}

.replica-section-head,
.replica-bottom-title,
.replica-mini-title {
  display: flex;
  align-items: center;
}

.replica-section-head {
  justify-content: space-between;
}

.replica-section-head h3,
.replica-bottom-title h3 {
  margin: 0;
  color: #222b49;
  font-size: 24px;
  line-height: 1.2;
  font-weight: 950;
}

.replica-section-head h3 span {
  color: #5e6dff;
  font-size: 37px;
  vertical-align: -4px;
}

.replica-section-head h3 small {
  color: #667492;
  font-size: 17px;
  font-weight: 800;
}

.replica-section-head button {
  height: 50px;
  border: 1px solid #dfe7fa;
  border-radius: 11px;
  padding: 0 25px;
  background: #fbfcff;
  color: #536dff;
  font-size: 17px;
  font-weight: 950;
}

.replica-suggestion {
  display: flex;
  align-items: center;
  gap: 18px;
  height: 70px;
  margin-top: 24px;
  padding: 0 25px;
  border: 1px solid #f2dfc8;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(255, 249, 240, 0.98), rgba(255, 253, 248, 0.94));
}

.replica-suggestion span {
  color: #ff982a;
  font-size: 27px;
}

.replica-suggestion strong {
  color: #303a55;
  font-size: 18px;
  font-weight: 900;
}

.replica-chat-list {
  display: grid;
  gap: 15px;
  margin-top: 22px;
}

.replica-chat-row {
  display: grid;
  grid-template-columns: 48px 1fr;
  align-items: start;
  gap: 18px;
}

.replica-chat-row img {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  object-fit: cover;
}

.replica-chat-bubble {
  width: 766px;
  min-height: 102px;
  padding: 16px 22px 10px;
  border: 1px solid #e8edf7;
  border-radius: 16px;
  background: #fff;
}

.replica-chat-bubble p {
  margin: 0;
  color: #65728d;
  font-size: 18px;
  line-height: 1.6;
  font-weight: 800;
}

.replica-chat-bubble time {
  display: block;
  margin-top: 3px;
  color: #8e9bb3;
  font-size: 13px;
  font-weight: 700;
  text-align: right;
}

.replica-ai-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 26px;
  margin-top: 41px;
}

.replica-ai-actions button {
  height: 83px;
  border: 1px solid #e4ebf7;
  border-radius: 13px;
  background: #fff;
  color: #536dff;
  font-size: 18px;
  font-weight: 950;
}

.replica-ai-actions span {
  margin-right: 10px;
  color: #536dff;
  font-size: 22px;
}

.replica-side-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 28px;
  margin-top: 28px;
}

.replica-mini-card {
  height: 284px;
  padding: 27px 27px;
  border-radius: 18px;
}

.replica-mini-title {
  gap: 16px;
}

.replica-mini-title span {
  color: #536dff;
  font-size: 27px;
}

.replica-mini-title strong {
  color: #24304d;
  font-size: 21px;
  font-weight: 950;
}

.replica-mini-title em {
  margin-left: auto;
  color: #8390ab;
  font-size: 35px;
  font-style: normal;
  line-height: 1;
}

.replica-reminder-main {
  margin: 28px 0 0;
  color: #24304d;
  font-size: 22px;
  line-height: 1.3;
  font-weight: 950;
}

.replica-reminder-copy {
  margin: 13px 0 0;
  color: #7a87a3;
  font-size: 17px;
  line-height: 1.5;
  font-weight: 750;
}

.replica-mini-card button {
  height: 45px;
  margin-top: 27px;
  border: 1px solid #e4eaf8;
  border-radius: 10px;
  padding: 0 25px;
  background: #f8faff;
  color: #536dff;
  font-size: 16px;
  font-weight: 950;
}

.replica-goal-percent {
  margin-top: 26px;
  color: #17213e;
  font-size: 43px;
  line-height: 1;
  font-weight: 950;
}

.replica-goal-track {
  height: 9px;
  margin-top: 18px;
  overflow: hidden;
  border-radius: 999px;
  background: #e7ecf6;
}

.replica-goal-track span {
  display: block;
  width: 68%;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4a6dff, #7984ff);
}

.replica-bottom-grid {
  position: absolute;
  left: 0;
  top: 925px;
  display: grid;
  grid-template-columns: 448px 515px 462px 598px;
  gap: 28px;
  width: 2107px;
}

.replica-bottom-grid .replica-card {
  height: 330px;
  padding: 21px 24px;
  border-radius: 17px;
}

.replica-bottom-title {
  justify-content: space-between;
}

.replica-bottom-title h3 {
  font-size: 19px;
}

.replica-bottom-title h3 span {
  color: #8996b2;
}

.replica-bottom-title--link a {
  color: #496aff;
  font-size: 14px;
  font-weight: 950;
  text-decoration: none;
}

.replica-heatmap {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}

.replica-heatmap-days,
.replica-heatmap-row {
  display: grid;
  grid-template-columns: 44px repeat(7, 1fr);
  align-items: center;
  gap: 10px;
}

.replica-heatmap-days span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 31px;
  height: 22px;
  border-radius: 999px;
  color: #627091;
  font-size: 14px;
  font-weight: 950;
  text-align: center;
}

.replica-heatmap-days span.is-today {
  border: 1px solid #cbd4ff;
  background: #eef2ff;
  color: #4f63ff;
}

.replica-heatmap-row strong {
  color: #4f5d7e;
  font-size: 15px;
  font-weight: 950;
}

.replica-heatmap-row i {
  display: block;
  justify-self: center;
  width: 32px;
  height: 25px;
  border-radius: 8px;
  border: 1px solid #dfe5ff;
  background: #f6f7ff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.replica-heatmap-row i.is-today {
  border-color: #8796ff;
  box-shadow: 0 0 0 2px rgba(108, 124, 255, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.replica-heatmap-row i:hover {
  transform: translateY(-1px);
  border-color: #9eaaff;
}

.heat-0 {
  background: #f6f7ff;
}

.heat-1 {
  border-color: #cdd6ff;
  background: #e9edff;
}

.heat-2 {
  border-color: #b9c4ff;
  background: #cfd8ff;
}

.heat-3 {
  border-color: #9ca8ff;
  background: #aebaff;
}

.heat-4 {
  border-color: #7d8aff;
  background: #7685ff;
}

.replica-heat-legend {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 17px;
  color: #8994ad;
  font-size: 13px;
  font-weight: 850;
}

.replica-heat-legend i {
  width: 24px;
  height: 10px;
  border-radius: 999px;
  border: 1px solid rgba(109, 124, 255, 0.28);
}

.replica-bottom-foot {
  display: inline-flex;
  align-items: center;
  height: 32px;
  margin: 17px 0 0;
  border-radius: 7px;
  border: 1px solid #dce5ff;
  padding: 0 17px;
  background: #eef2ff;
  color: #586a9c;
  font-size: 15px;
  font-weight: 900;
}

.replica-score-chip {
  display: grid;
  place-items: center;
  width: 88px;
  height: 54px;
  border: 1px solid #e7ecf8;
  border-radius: 14px;
  background: #fff;
  color: #7986a2;
  font-size: 11px;
  line-height: 1.25;
  font-weight: 850;
  text-align: center;
}

.replica-score-chip strong {
  color: #17213e;
  font-size: 20px;
  font-weight: 950;
}

.replica-trend-chart {
  width: 100%;
  height: 174px;
  margin-top: 8px;
  overflow: visible;
}

.replica-trend-chart text {
  fill: #74819f;
  font-size: 15px;
  font-weight: 800;
}

.trend-grid {
  stroke: #e9eef7;
  stroke-width: 2;
}

.trend-line {
  fill: none;
  stroke: #3869ff;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.replica-trend-chart circle {
  fill: #fff;
  stroke: #3869ff;
  stroke-width: 5;
}

.replica-trend-labels {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-left: 50px;
  margin-top: -11px;
  color: #7b88a3;
  font-size: 14px;
  font-weight: 850;
}

.replica-trend-card .replica-bottom-foot {
  margin-top: 9px;
}

.replica-weak-list,
.replica-recent-list {
  display: grid;
  gap: 14px;
  margin-top: 21px;
}

.replica-weak-row {
  display: grid;
  grid-template-columns: 41px minmax(0, 1fr) 92px 95px;
  align-items: center;
  height: 62px;
  padding: 0 13px;
  border: 1px solid #e9eef7;
  border-radius: 13px;
  background: #fff;
}

.replica-weak-row span {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border-radius: 10px;
  background: #fff2ec;
  color: #ff6d35;
  font-size: 22px;
  font-weight: 950;
}

.replica-weak-row strong {
  min-width: 0;
  overflow: hidden;
  color: #26304d;
  font-size: 16px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.replica-weak-row em,
.replica-weak-row i {
  color: #7b88a3;
  font-size: 13px;
  font-style: normal;
  font-weight: 900;
  white-space: nowrap;
}

.replica-weak-row i {
  color: #8a75ff;
}

.replica-recent-row {
  display: grid;
  grid-template-columns: 43px minmax(0, 1fr) 104px 108px 18px;
  align-items: center;
  gap: 13px;
  height: 63px;
  padding: 0 15px;
  border: 1px solid #e8edf7;
  border-radius: 13px;
  background: #fff;
}

.replica-recent-row span {
  display: grid;
  place-items: center;
  width: 35px;
  height: 35px;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 950;
}

.replica-recent-row strong {
  min-width: 0;
  overflow: hidden;
  color: #25304d;
  font-size: 16px;
  font-weight: 950;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.replica-recent-row em,
.replica-recent-row time,
.replica-recent-row i {
  color: #687693;
  font-size: 14px;
  font-style: normal;
  font-weight: 900;
  white-space: nowrap;
}

.replica-recent-row i {
  color: #72809c;
  font-size: 26px;
}
</style>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import {
  createEmptyHomeAnalytics,
  formatInteger,
  formatScore,
  loadHomeAnalyticsSnapshotForAuth
} from "@/lib/home-analytics";
import {
  createEmptyProfilePortrait,
  loadProfilePortraitSnapshotForAuth
} from "@/lib/profile-portrait";

const router = useRouter();
const authStore = useAuthStore();

const selectedPlanKey = ref("month");
const homeAnalytics = ref(createEmptyHomeAnalytics());
const profilePortrait = ref(createEmptyProfilePortrait());
const STREAK_MILESTONES = [
  { days: 1, reward: "✅" },
  { days: 3, reward: "⚡" },
  { days: 7, reward: "🏆" },
  { days: 14, reward: "🎯" },
  { days: 30, reward: "🎁" }
];

const plans = [
  {
    key: "week",
    name: "周卡",
    price: "6.9",
    unit: "7 天无限",
    per: "先试试看",
    featured: false,
    badge: ""
  },
  {
    key: "month",
    name: "月卡",
    price: "19.9",
    unit: "30 天无限",
    per: "≈ 每天 ¥0.66",
    featured: true,
    badge: "🔥 最划算"
  },
  {
    key: "lifetime",
    name: "永久卡",
    price: "49.9",
    unit: "永久无限",
    per: "一次搞定",
    featured: false,
    badge: ""
  }
];

const heroStats = computed(() => [
  {
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.totalCount),
    label: "累计题数"
  },
  {
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.activeDaysCount),
    label: "累计天数"
  },
  {
    value: homeAnalytics.value.loading ? "--" : `🔥 ${formatInteger(homeAnalytics.value.currentStreak)}`,
    label: "连续天数"
  },
  {
    value: homeAnalytics.value.loading ? "--" : formatScore(homeAnalytics.value.averageScore),
    label: "平均评分"
  }
]);

const progressItems = [
  {
    icon: "🎙",
    iconBg: "#EEF3FD",
    name: "RA · 朗读",
    width: "60%",
    fill: "#2563EB",
    count: "30/50",
    pct: "60%",
    pctColor: ""
  },
  {
    icon: "🎧",
    iconBg: "#ECFDF3",
    name: "WFD · 听写句子",
    width: "80%",
    fill: "#059669",
    count: "80/100",
    pct: "80%",
    pctColor: ""
  },
  {
    icon: "💬",
    iconBg: "#F4F3FF",
    name: "RTS · 情景回应",
    width: "4%",
    fill: "#6941C6",
    count: "2/48",
    pct: "4%",
    pctColor: ""
  },
  {
    icon: "🖼",
    iconBg: "var(--og-bg)",
    name: "DI · 图片描述",
    width: "30%",
    fill: "var(--orange)",
    count: "9/30",
    pct: "30%",
    pctColor: ""
  },
  {
    icon: "🔊",
    iconBg: "#EEF3FD",
    name: "RS · 复述句子",
    width: "0%",
    fill: "",
    count: "0/30",
    pct: "未开始",
    pctColor: "var(--hi)"
  }
];

const achievements = [
  { icon: "🔥", name: "连练 3 天", unlocked: true },
  { icon: "🎯", name: "首次满分", unlocked: true },
  { icon: "⚡", name: "速通 WFD", unlocked: true },
  { icon: "🏆", name: "连练 7 天", unlocked: false },
  { icon: "📚", name: "练习 50 题", unlocked: false },
  { icon: "🌟", name: "全题型解锁", unlocked: false },
  { icon: "❤️", name: "收藏 10 题", unlocked: false },
  { icon: "🎁", name: "分享好友", unlocked: false }
];

const settingsItems = [
  {
    icon: "🔔",
    iconBg: "#EEF3FD",
    label: "练习提醒",
    sub: "每天 20:00",
    value: "已开启",
    badge: ""
  },
  {
    icon: "🎯",
    iconBg: "#ECFDF3",
    label: "目标分数",
    sub: "当前设定目标",
    value: "58 分",
    badge: ""
  },
  {
    icon: "💬",
    iconBg: "var(--og-bg)",
    label: "意见反馈",
    sub: "告诉开发者你的想法",
    value: "",
    badge: "有礼品"
  },
  {
    icon: "🔒",
    iconBg: "#F0EEFE",
    label: "修改密码",
    sub: "",
    value: "",
    badge: ""
  },
  {
    icon: "ℹ️",
    iconBg: "var(--bg)",
    label: "关于开口",
    sub: "v1.0.0 · 由开发者用爱发电",
    value: "",
    badge: ""
  }
];

const userDisplayName = computed(() => authStore.displayName || "同学");

const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "K";
});

const userEmail = computed(() => {
  return `${authStore.user?.email || authStore.profile?.email || ""}`.trim();
});

const trialPillText = computed(() => {
  if (!authStore.loaded) return "状态同步中";
  if (authStore.isPremium) return "VIP · 已开通";
  if (authStore.isInTrial) return `试用中 · 剩余 ${authStore.trialDaysLeft} 天`;
  if (authStore.accessStatus === "trial_expired") return "试用已结束";
  return "当前暂无练习权限";
});

const selectedPlan = computed(
  () => plans.find((plan) => plan.key === selectedPlanKey.value) || plans[1]
);

const ctaLabel = computed(() => `立即升级${selectedPlan.value.name} · ¥${selectedPlan.value.price}`);

const portraitMetrics = computed(() =>
  profilePortrait.value.metrics.map((item) => ({
    ...item,
    displayScore: item.score > 0 ? formatInteger(item.score) : "--",
    barPercent: item.score > 0 ? Math.round((item.score / 90) * 100) : 0
  }))
);

const portraitSampleCount = computed(() => {
  const totalFromHome = Number(homeAnalytics.value.totalCount || 0);
  if (totalFromHome > 0) return totalFromHome;
  return Number(profilePortrait.value.sampleCount || 0);
});

const portraitSampleLabel = computed(() => {
  if (profilePortrait.value.loading) return "画像生成中...";
  return `基于 ${formatInteger(portraitSampleCount.value)} 条作答`;
});

const portraitAdvice = computed(() => profilePortrait.value.advice);

const radarChart = computed(() => buildRadarChart(portraitMetrics.value));
const currentStreak = computed(() => Math.max(0, Number(homeAnalytics.value.currentStreak || 0)));
const currentGoalDays = computed(() => {
  if (currentStreak.value < 7) return 7;
  if (currentStreak.value < 14) return 14;
  if (currentStreak.value < 30) return 30;
  return 30;
});
const streakGoalGap = computed(() => Math.max(0, currentGoalDays.value - currentStreak.value));
const streakRingProgress = computed(() => {
  if (homeAnalytics.value.loading) return 0;
  if (!currentGoalDays.value) return 0;
  return Math.max(0, Math.min(currentStreak.value / currentGoalDays.value, 1));
});
const streakRingDashoffset = computed(() => (276.5 * (1 - streakRingProgress.value)).toFixed(1));
const streakHeading = computed(() => `连续练习 ${formatInteger(currentStreak.value)} 天`);
const streakSummary = computed(() => {
  if (homeAnalytics.value.loading) return "正在根据真实练习记录同步状态...";

  if (currentStreak.value <= 0) {
    if (Number(homeAnalytics.value.totalCount || 0) > 0) {
      return "今天尚未练习，连续记录已中断";
    }
    return "完成第一题后即可开始累计连续记录";
  }

  if (currentStreak.value < 7) {
    return `距 7 天目标还差 ${formatInteger(7 - currentStreak.value)} 天 · 继续加油`;
  }

  if (currentStreak.value < 14) {
    return `7 天里程碑已解锁 · 距 14 天目标还差 ${formatInteger(14 - currentStreak.value)} 天`;
  }

  if (currentStreak.value < 30) {
    return `14 天里程碑已解锁 · 距 30 天目标还差 ${formatInteger(30 - currentStreak.value)} 天`;
  }

  return `30 天里程碑已解锁 · 当前已连续 ${formatInteger(currentStreak.value)} 天`;
});
const nextMilestoneIndex = computed(() =>
  STREAK_MILESTONES.findIndex((item) => currentStreak.value < item.days)
);
const milestoneSteps = computed(() =>
  STREAK_MILESTONES.map((item, index) => {
    const completed = currentStreak.value >= item.days;
    const active = !completed && index === nextMilestoneIndex.value;
    return {
      ...item,
      key: `milestone-${item.days}`,
      daysLabel: `${item.days}天`,
      circle: completed ? "✓" : active ? "🔥" : `${item.days}`,
      state: completed ? "done" : active ? "active" : ""
    };
  })
);
const milestoneSegments = computed(() =>
  STREAK_MILESTONES.slice(1).map((item, index) => ({
    key: `segment-${item.days}`,
    completed: currentStreak.value >= item.days,
    index
  }))
);
const streakTip = computed(() => {
  if (homeAnalytics.value.loading) {
    return {
      icon: "🎯",
      title: "正在根据真实练习记录计算里程碑状态",
      subtitle: "节点、链条和周练习题数会在数据同步后自动更新"
    };
  }

  if (Number(homeAnalytics.value.totalCount || 0) <= 0) {
    return {
      icon: "🎯",
      title: "完成今天的第一题即可开始累计 7 天里程碑奖励",
      subtitle: "连续打卡和本周练习统计会跟随真实练习记录自动更新"
    };
  }

  if (currentStreak.value < 7) {
    return {
      icon: "🎯",
      title: `再练 ${formatInteger(7 - currentStreak.value)} 天即可解锁 7 天里程碑奖励`,
      subtitle: currentStreak.value > 0
        ? `当前已连续练习 ${formatInteger(currentStreak.value)} 天`
        : "今天尚未练习，连续记录已中断"
    };
  }

  if (currentStreak.value < 14) {
    return {
      icon: "🏆",
      title: `7 天里程碑奖励已解锁，距离 14 天还差 ${formatInteger(14 - currentStreak.value)} 天`,
      subtitle: `当前已连续练习 ${formatInteger(currentStreak.value)} 天`
    };
  }

  if (currentStreak.value < 30) {
    return {
      icon: "🎯",
      title: `14 天里程碑奖励已解锁，距离 30 天还差 ${formatInteger(30 - currentStreak.value)} 天`,
      subtitle: `当前已连续练习 ${formatInteger(currentStreak.value)} 天`
    };
  }

  return {
    icon: "🎁",
    title: "30 天里程碑奖励已解锁",
    subtitle: `当前已连续练习 ${formatInteger(currentStreak.value)} 天，全部阶段已达成`
  };
});
const weekMaxCount = computed(() =>
  Math.max(...homeAnalytics.value.recentDays.map((item) => Number(item.count || 0)), 0)
);
const weeklyBars = computed(() =>
  homeAnalytics.value.recentDays.map((item) => {
    const count = Number(item.count || 0);
    const ratio = weekMaxCount.value > 0 ? count / weekMaxCount.value : 0;
    return {
      key: item.key,
      label: item.isToday ? "今" : `${item.label || ""}`.replace(/^周/, "").slice(-1),
      today: item.isToday,
      has: count > 0,
      count,
      height: count > 0 ? `${Math.max(14, Math.round(ratio * 100))}%` : "3px"
    };
  })
);
function selectPlan(planKey) {
  selectedPlanKey.value = planKey;
}

function goBack() {
  if (typeof window !== "undefined") {
    const fallbackPath = window.history.state?.back;
    if (typeof fallbackPath === "string" && fallbackPath.startsWith("/")) {
      router.back();
      return;
    }
  }
  router.push("/home");
}

function openUpgrade() {
  router.push({
    path: "/upgrade",
    query: {
      plan: selectedPlanKey.value
    }
  });
}

async function handleLogout() {
  await authStore.logout();
  router.replace("/auth");
}

onMounted(async () => {
  await authStore.init();
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }
  homeAnalytics.value = createEmptyHomeAnalytics();
  profilePortrait.value = createEmptyProfilePortrait();
  const [analyticsSnapshot, portraitSnapshot] = await Promise.all([
    loadHomeAnalyticsSnapshotForAuth(authStore),
    loadProfilePortraitSnapshotForAuth(authStore)
  ]);
  homeAnalytics.value = analyticsSnapshot;
  profilePortrait.value = portraitSnapshot;
});

function buildRadarChart(metrics) {
  const normalizedMetrics = Array.isArray(metrics) ? metrics : [];
  const count = normalizedMetrics.length;
  const center = 70;
  const radius = 44;
  const labelRadius = 58;
  const levels = [0.25, 0.5, 0.75, 1];

  if (!count) {
    return {
      gridPolygons: [],
      axes: [],
      labels: [],
      polygonPoints: "",
      dataPoints: []
    };
  }

  const pointAt = (index, scale = 1) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return {
      x: center + Math.cos(angle) * radius * scale,
      y: center + Math.sin(angle) * radius * scale
    };
  };

  const labelPointAt = (index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    return {
      x: center + Math.cos(angle) * labelRadius,
      y: center + Math.sin(angle) * labelRadius
    };
  };

  const gridPolygons = levels.map((level) =>
    normalizedMetrics.map((_, index) => {
      const point = pointAt(index, level);
      return `${point.x},${point.y}`;
    }).join(" ")
  );

  const axes = normalizedMetrics.map((_, index) => {
    const point = pointAt(index, 1);
    return {
      key: `axis-${index}`,
      x1: center,
      y1: center,
      x2: point.x,
      y2: point.y
    };
  });

  const labels = normalizedMetrics.map((metric, index) => {
    const point = labelPointAt(index);
    return {
      key: metric.key,
      label: metric.shortLabel,
      x: point.x,
      y: point.y,
      anchor: resolveRadarAnchor(point.x, center)
    };
  });

  const dataPoints = normalizedMetrics.map((metric, index) => {
    const point = pointAt(index, Math.max(0, Math.min(metric.score / 90, 1)));
    return {
      key: metric.key,
      color: metric.color,
      x: point.x,
      y: point.y
    };
  });

  return {
    gridPolygons,
    axes,
    labels,
    polygonPoints: dataPoints.map((point) => `${point.x},${point.y}`).join(" "),
    dataPoints
  };
}

function resolveRadarAnchor(x, center) {
  if (x > center + 6) return "start";
  if (x < center - 6) return "end";
  return "middle";
}
</script>

<template>
  <div class="profile-page">
    <div class="nav">
      <button type="button" class="nav-back" @click="goBack">← 返回首页</button>
      <div class="nav-title">个人中心</div>
      <div class="nav-spacer" />
    </div>

    <div class="wrap">
      <div class="hero">
        <div class="hero-glow" />
        <div class="hero-top">
          <div class="av">{{ userInitial }}</div>
          <div>
            <div class="hero-name">{{ userDisplayName }}</div>
            <div v-if="userEmail" class="hero-email">{{ userEmail }}</div>
            <div class="trial-pill">
              <div class="trial-pill__dot" />
              {{ trialPillText }}
            </div>
          </div>
        </div>

        <div class="hero-stats">
          <div v-for="stat in heroStats" :key="stat.label" class="hs">
            <div class="hs-n">{{ stat.value }}</div>
            <div class="hs-l">{{ stat.label }}</div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="vip-card">
          <div class="vip-top">
            <div class="vip-title">🚀 升级 VIP · 解锁无限练习</div>
            <div class="vip-sub">试用期结束后继续练习，选一个最适合你的方案</div>
          </div>
          <div class="vip-plans">
            <div
              v-for="plan in plans"
              :key="plan.key"
              class="plan"
              :class="{ featured: plan.featured, selected: selectedPlanKey === plan.key }"
              @click="selectPlan(plan.key)"
            >
              <div v-if="plan.badge" class="plan-badge">{{ plan.badge }}</div>
              <div class="plan-name">{{ plan.name }}</div>
              <div class="plan-price">¥{{ plan.price }}</div>
              <div class="plan-unit">{{ plan.unit }}</div>
              <div class="plan-per">{{ plan.per }}</div>
            </div>
          </div>
          <button id="cta-btn" type="button" class="vip-cta" @click="openUpgrade">{{ ctaLabel }}</button>
          <div class="vip-features">
            <div class="vf">
              <div class="vf-dot" />
              全题型无限练习
            </div>
            <div class="vf">
              <div class="vf-dot" />
              AI 评分不限次
            </div>
            <div class="vf">
              <div class="vf-dot" />
              随时退款
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-hdr">
            <div class="sec-title">📊 口语能力画像</div>
            <div class="sec-action">{{ portraitSampleLabel }}</div>
          </div>
          <div class="sec-body">
            <div class="radar-wrap">
              <svg
                class="portrait-radar"
                width="164"
                height="152"
                viewBox="-18 -10 176 160"
                style="flex-shrink: 0"
              >
                <defs>
                  <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color: #E8845A; stop-opacity: 0.3" />
                    <stop offset="100%" style="stop-color: #2563EB; stop-opacity: 0.12" />
                  </linearGradient>
                </defs>
                <polygon
                  v-for="(polygon, index) in radarChart.gridPolygons"
                  :key="`grid-${index}`"
                  :points="polygon"
                  fill="none"
                  stroke="#DDE3EE"
                  stroke-width="1"
                />
                <line
                  v-for="axis in radarChart.axes"
                  :key="axis.key"
                  :x1="axis.x1"
                  :y1="axis.y1"
                  :x2="axis.x2"
                  :y2="axis.y2"
                  stroke="#DDE3EE"
                  stroke-width="1"
                />
                <polygon
                  :points="radarChart.polygonPoints"
                  fill="url(#rg)"
                  stroke="#E8845A"
                  stroke-width="1.5"
                  opacity=".9"
                />
                <circle
                  v-for="point in radarChart.dataPoints"
                  :key="point.key"
                  :cx="point.x"
                  :cy="point.y"
                  r="3"
                  :fill="point.color"
                />
                <text
                  v-for="item in radarChart.labels"
                  :key="item.key"
                  :x="item.x"
                  :y="item.y"
                  :text-anchor="item.anchor"
                  font-size="9"
                  fill="#5A6B8A"
                  font-family="sans-serif"
                >
                  {{ item.label }}
                </text>
              </svg>

              <div style="flex: 1">
                <div v-for="item in portraitMetrics" :key="item.key" class="rl-item">
                  <div class="rl-dot" :style="{ background: item.color }" />
                  <div class="rl-name">{{ item.label }}</div>
                  <div class="rl-bar">
                    <div class="rl-fill" :style="{ width: `${item.barPercent}%`, background: item.color }" />
                  </div>
                  <div class="rl-score">{{ item.displayScore }}</div>
                </div>
              </div>
            </div>

            <div class="radar-note">
              {{ portraitAdvice }}
            </div>
          </div>
        </div>

        <div class="ms-card">
          <div class="ms-hdr">
            <div class="ms-hdr-title">🔥 连续打卡 · 本周练习</div>
          </div>
          <div class="ms-body">
            <div class="ms-ring-center">
              <div class="ms-ring-wrap">
                <svg width="110" height="110" viewBox="0 0 110 110">
                  <defs>
                    <linearGradient id="rg2" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" style="stop-color: rgba(5,150,105,0.85)" />
                      <stop offset="100%" style="stop-color: #E8845A" />
                    </linearGradient>
                  </defs>
                  <circle cx="55" cy="55" r="44" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9" />
                  <circle
                    cx="55"
                    cy="55"
                    r="44"
                    fill="none"
                    stroke="url(#rg2)"
                    stroke-width="9"
                    stroke-linecap="round"
                    stroke-dasharray="276.5"
                    :stroke-dashoffset="streakRingDashoffset"
                    transform="rotate(-90 55 55)"
                  />
                  <text x="55" y="50" text-anchor="middle" font-size="26" font-weight="700" fill="white" font-family="sans-serif">
                    {{ homeAnalytics.loading ? "--" : formatInteger(currentStreak) }}
                  </text>
                  <text x="55" y="64" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.32)" font-family="sans-serif">
                    / {{ currentGoalDays }} 天目标
                  </text>
                </svg>
              </div>
              <div class="ms-ring-n">{{ streakHeading }}</div>
              <div class="ms-ring-sub">{{ streakSummary }}</div>
            </div>

            <div class="ms-dots-wrap">
              <div class="ms-dots-row">
                <div
                  v-for="(item, index) in milestoneSteps"
                  :key="item.key"
                  class="ms-dot-wrap"
                >
                  <div
                    v-if="index > 0"
                    class="ms-dot-segment"
                    :class="{ 'ms-dot-segment--done': milestoneSegments[index - 1]?.completed }"
                  />
                  <div class="ms-dot-item">
                    <div class="ms-dot-circle" :class="item.state">{{ item.circle }}</div>
                    <div class="ms-dot-days" :class="item.state">{{ item.daysLabel }}</div>
                    <div class="ms-dot-reward">{{ item.reward }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="ms-tip">
              <div style="font-size: 18px; flex-shrink: 0">{{ streakTip.icon }}</div>
              <div>
                <div class="ms-tip-title">{{ streakTip.title }}</div>
                <div class="ms-tip-sub">{{ streakTip.subtitle }}</div>
              </div>
            </div>

            <div class="ms-week-title">本周每日题数</div>
            <div class="ms-sparkline">
              <div v-for="item in weeklyBars" :key="item.key" class="ms-spark-col">
                <div
                  class="ms-spark-bar"
                  :class="{ has: item.has, 'today-bar': item.today }"
                  :style="{ height: item.height }"
                  :title="`${item.label} · ${item.count} 题${item.today ? ' · 今日' : ''}`"
                />
                <div class="ms-spark-label" :class="{ today: item.today }">{{ item.label }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-hdr">
            <div class="sec-title">📈 各题型进度</div>
          </div>
          <div class="sec-body" style="padding: 4px 18px">
            <div class="prog-list">
              <div v-for="item in progressItems" :key="item.name" class="prog-row">
                <div class="prog-icon" :style="{ background: item.iconBg }">{{ item.icon }}</div>
                <div class="prog-meta">
                  <div class="prog-name">{{ item.name }}</div>
                  <div class="prog-bar">
                    <div class="prog-fill" :style="{ width: item.width, background: item.fill }" />
                  </div>
                </div>
                <div class="prog-right">
                  <div class="prog-count">{{ item.count }}</div>
                  <div class="prog-pct" :style="{ color: item.pctColor || undefined }">{{ item.pct }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-hdr">
            <div class="sec-title">🏅 练习成就</div>
            <div class="sec-action">3 / 8 已解锁</div>
          </div>
          <div class="sec-body">
            <div class="ach-grid">
              <div v-for="item in achievements" :key="item.name" class="ach-item">
                <div class="ach-box" :class="item.unlocked ? 'on' : 'off'">{{ item.icon }}</div>
                <div class="ach-name">{{ item.name }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="sec">
          <div class="sec-hdr">
            <div class="sec-title">⚙️ 设置</div>
          </div>
          <div class="sec-body" style="padding: 0 18px">
            <div v-for="item in settingsItems" :key="item.label" class="menu-item">
              <div class="mi-icon" :style="{ background: item.iconBg }">{{ item.icon }}</div>
              <div class="mi-body">
                <div class="menu-label">{{ item.label }}</div>
                <div v-if="item.sub" class="menu-sub">{{ item.sub }}</div>
              </div>
              <div style="display: flex; align-items: center">
                <div v-if="item.value" class="menu-val">{{ item.value }}</div>
                <div v-if="item.badge" class="menu-badge">{{ item.badge }}</div>
                <div class="menu-arr">›</div>
              </div>
            </div>
          </div>
        </div>

        <button type="button" class="logout-btn" @click="handleLogout">退出登录</button>
        <div class="pb" />
      </div>
    </div>
  </div>
</template>

<style scoped>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

.profile-page {
  --navy: #0F2444;
  --navy2: #1A3A6E;
  --navy3: #243F75;
  --orange: #E8845A;
  --og-bg: #FEF3ED;
  --og-mid: #F5C4A8;
  --bg: #EEF1F7;
  --card: #FFFFFF;
  --bd: #DDE3EE;
  --tx: #0A1628;
  --mu: #5A6B8A;
  --hi: #A8B5CB;
  --navy-soft: #EDF1F8;
  --green: #059669;
  --blue: #2563EB;
  --purple: #6941C6;
  --r: 16px;
  min-height: 100vh;
  font-family: -apple-system, "SF Pro Text", "DM Sans", "PingFang SC", sans-serif;
  background: var(--navy);
  -webkit-font-smoothing: antialiased;
  color: var(--tx);
}

.nav {
  background: var(--navy);
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.nav-back {
  padding: 0;
  border: none;
  background: none;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  cursor: pointer;
}

.nav-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.nav-spacer {
  width: 60px;
}

.wrap {
  max-width: 660px;
  margin: 0 auto;
}

.hero {
  background: linear-gradient(180deg, var(--navy) 0%, var(--navy2) 100%);
  padding: 24px 16px 36px;
  position: relative;
  overflow: hidden;
}

.hero-glow {
  position: absolute;
  right: -40px;
  top: -40px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: rgba(232, 132, 90, 0.07);
  pointer-events: none;
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
  position: relative;
}

.av {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--orange), #C4622A);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  border: 3px solid rgba(255, 255, 255, 0.15);
}

.hero-name {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  letter-spacing: -0.3px;
}

.hero-email {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.38);
  margin-top: 2px;
}

.trial-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  background: rgba(232, 132, 90, 0.15);
  border: 1px solid rgba(232, 132, 90, 0.28);
  border-radius: 20px;
  padding: 3px 10px;
  font-size: 11px;
  color: #E8845A;
  font-weight: 500;
}

.trial-pill__dot {
  width: 5px;
  height: 5px;
  background: var(--orange);
  border-radius: 50%;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.hs {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 11px 0;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.hs-n {
  font-size: 19px;
  font-weight: 600;
  color: #fff;
  letter-spacing: -0.3px;
}

.hs-l {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 3px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.content {
  background: var(--bg);
  border-radius: 24px 24px 0 0;
  padding: 20px 16px 0;
  margin-top: -20px;
  position: relative;
  z-index: 2;
}

.vip-card {
  background: linear-gradient(135deg, var(--navy2) 0%, var(--navy) 100%);
  border-radius: var(--r);
  margin-bottom: 14px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.vip-top {
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.vip-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 3px;
}

.vip-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.vip-plans {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  padding: 14px 14px 16px;
}

.plan {
  border-radius: 12px;
  padding: 14px 10px;
  text-align: center;
  cursor: pointer;
  border: 1.5px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  position: relative;
  transition: 0.15s;
}

.plan:hover {
  border-color: rgba(255, 255, 255, 0.25);
}

.plan.featured {
  background: var(--orange);
  border-color: var(--orange);
  box-shadow: 0 4px 18px rgba(232, 132, 90, 0.35);
}

.plan-badge {
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%);
  background: #FFD166;
  color: #7A3F00;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 20px;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

.plan-name {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 8px;
}

.plan.featured .plan-name {
  color: rgba(255, 255, 255, 0.8);
}

.plan-price {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
  line-height: 1;
}

.plan-unit {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 4px;
}

.plan.featured .plan-unit {
  color: rgba(255, 255, 255, 0.7);
}

.plan-per {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 3px;
}

.plan.featured .plan-per {
  color: rgba(255, 255, 255, 0.65);
}

.vip-cta {
  margin: 0 14px 16px;
  padding: 13px;
  background: var(--orange);
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  width: calc(100% - 28px);
  display: block;
  transition: 0.15s;
}

.vip-cta:hover {
  background: #D4754E;
}

.vip-features {
  display: flex;
  justify-content: center;
  gap: 16px;
  padding: 0 14px 16px;
  flex-wrap: wrap;
}

.vf {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.vf-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--orange);
}

.sec {
  background: var(--card);
  border: 1px solid var(--bd);
  border-radius: var(--r);
  margin-bottom: 12px;
  overflow: hidden;
}

.sec-hdr {
  padding: 14px 18px 10px;
  border-bottom: 1px solid var(--bd);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.sec-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx);
}

.sec-action {
  font-size: 11px;
  color: var(--navy2);
  cursor: pointer;
  font-weight: 500;
}

.sec-body {
  padding: 16px 18px;
}

.radar-wrap {
  display: flex;
  align-items: center;
  gap: 20px;
}

.portrait-radar {
  overflow: visible;
}

.rl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.rl-item:last-child {
  margin-bottom: 0;
}

.rl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.rl-name {
  font-size: 12px;
  color: var(--tx);
  font-weight: 500;
  width: 76px;
  flex-shrink: 0;
  white-space: nowrap;
}

.rl-bar {
  flex: 1;
  height: 4px;
  background: var(--bd);
  border-radius: 4px;
  overflow: hidden;
}

.rl-fill {
  height: 100%;
  border-radius: 4px;
}

.rl-score {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx);
  min-width: 32px;
  text-align: right;
}

.radar-note {
  font-size: 11px;
  color: var(--mu);
  margin-top: 12px;
  padding: 10px 12px;
  background: var(--navy-soft);
  border-radius: 9px;
  line-height: 1.6;
  border: 1px solid var(--bd);
}

.ms-card {
  background: linear-gradient(160deg, var(--navy2), var(--navy3));
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--r);
  margin-bottom: 12px;
  overflow: hidden;
}

.ms-hdr {
  padding: 14px 18px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ms-hdr-title {
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.ms-body {
  padding: 18px;
}

.ms-ring-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 18px;
}

.ms-ring-wrap {
  width: 110px;
  height: 110px;
  margin-bottom: 10px;
}

.ms-ring-n {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  text-align: center;
  margin-bottom: 3px;
}

.ms-ring-sub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  text-align: center;
}

.ms-dots-wrap {
  position: relative;
  margin-bottom: 16px;
  padding: 0 4px;
}

.ms-dots-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  position: relative;
  z-index: 1;
  column-gap: 8px;
}

.ms-dot-wrap {
  position: relative;
}

.ms-dot-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.ms-dot-segment {
  position: absolute;
  top: 12px;
  left: calc(-50% + 13px);
  right: calc(50% - 13px);
  height: 2px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.ms-dot-segment--done {
  background: rgba(52, 211, 153, 0.92);
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.28);
}

.ms-dot-circle {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  border: 2px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.25);
}

.ms-dot-circle.done {
  background: var(--green);
  border-color: var(--green);
  color: #fff;
}

.ms-dot-circle.active {
  background: var(--orange);
  border-color: var(--orange);
  color: #fff;
  box-shadow: 0 0 10px rgba(232, 132, 90, 0.4);
}

.ms-dot-days {
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.25);
}

.ms-dot-days.done {
  color: rgba(52, 211, 153, 0.9);
}

.ms-dot-days.active {
  color: var(--orange);
}

.ms-dot-reward {
  font-size: 13px;
}

.ms-tip {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 11px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.ms-tip-title {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.82);
  margin-bottom: 2px;
}

.ms-tip-sub {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.32);
}

.ms-week-title {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.25);
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.ms-sparkline {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  height: 60px;
  margin-bottom: 0;
}

.ms-spark-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
  justify-content: flex-end;
}

.ms-spark-bar {
  width: 100%;
  border-radius: 4px 4px 0 0;
  min-height: 3px;
  background: rgba(255, 255, 255, 0.08);
}

.ms-spark-bar.has {
  background: rgba(232, 132, 90, 0.4);
}

.ms-spark-bar.today-bar {
  background: linear-gradient(180deg, var(--orange), #C4622A);
  box-shadow: 0 0 8px rgba(232, 132, 90, 0.35);
}

.ms-spark-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.2);
}

.ms-spark-label.today {
  color: var(--orange);
  font-weight: 600;
}

.prog-list {
  display: flex;
  flex-direction: column;
}

.prog-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--bd);
}

.prog-row:last-child {
  border-bottom: none;
}

.prog-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 14px;
}

.prog-meta {
  flex: 1;
}

.prog-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx);
  margin-bottom: 5px;
}

.prog-bar {
  height: 4px;
  background: var(--bd);
  border-radius: 4px;
  overflow: hidden;
}

.prog-fill {
  height: 100%;
  border-radius: 4px;
}

.prog-right {
  text-align: right;
}

.prog-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx);
}

.prog-pct {
  font-size: 10px;
  color: var(--mu);
  margin-top: 2px;
}

.ach-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.ach-item {
  text-align: center;
}

.ach-box {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 6px;
  font-size: 20px;
}

.ach-box.on {
  background: var(--og-bg);
}

.ach-box.off {
  background: #EEF1F7;
  filter: grayscale(1);
  opacity: 0.35;
}

.ach-name {
  font-size: 10px;
  color: var(--mu);
  font-weight: 500;
  line-height: 1.3;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--bd);
  cursor: pointer;
}

.menu-item:last-child {
  border-bottom: none;
}

.mi-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.mi-body {
  flex: 1;
}

.menu-label {
  font-size: 13px;
  color: var(--tx);
}

.menu-sub {
  font-size: 11px;
  color: var(--mu);
  margin-top: 1px;
}

.menu-val {
  font-size: 12px;
  color: var(--mu);
}

.menu-arr {
  color: var(--hi);
  font-size: 16px;
  margin-left: 4px;
}

.menu-badge {
  font-size: 10px;
  background: var(--og-bg);
  color: #C4622A;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 500;
  border: 1px solid var(--og-mid);
}

.logout-btn {
  width: 100%;
  padding: 13px;
  background: var(--card);
  border: 1.5px solid #FECACA;
  border-radius: var(--r);
  color: #D92D20;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 12px;
}

.pb {
  padding-bottom: 40px;
}

.plan.selected {
  border-color: rgba(255, 255, 255, 0.5);
}
</style>

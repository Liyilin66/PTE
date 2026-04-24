<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
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
import {
  createEmptyProfileProgress,
  loadProfileProgressSnapshotForAuth
} from "@/lib/profile-progress";

const router = useRouter();
const authStore = useAuthStore();

const selectedPlanKey = ref("month");
const homeAnalytics = ref(createEmptyHomeAnalytics());
const profilePortrait = ref(createEmptyProfilePortrait());
const profileProgress = ref(createEmptyProfileProgress());
let profileRefreshPromise = null;
const STREAK_MILESTONES = [
  { days: 1, reward: "✅" },
  { days: 3, reward: "⚡" },
  { days: 7, reward: "🏆" },
  { days: 14, reward: "🎯" },
  { days: 30, reward: "🎁" }
];
const WEEKDAY_SHORT_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const plans = [
  {
    key: "week",
    name: "周卡",
    price: "6.9",
    unit: "7 天无限",
    per: "无试用期",
    featured: false,
    badge: ""
  },
  {
    key: "month",
    name: "月卡",
    price: "19.9",
    unit: "30 天无限",
    per: "含 每天 ¥0.66",
    featured: true,
    badge: "🔥 最划算"
  },
  {
    key: "lifetime",
    name: "永久卡",
    price: "49.9",
    unit: "永久无限",
    per: "一次购罄",
    featured: false,
    badge: ""
  }
];

const heroStats = computed(() => [
  {
    key: "total",
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.totalCount),
    label: "累计题数"
  },
  {
    key: "days",
    value: homeAnalytics.value.loading ? "--" : formatInteger(homeAnalytics.value.activeDaysCount),
    label: "累计天数"
  },
  {
    key: "streak",
    value: homeAnalytics.value.loading ? "--" : `🔥 ${formatInteger(homeAnalytics.value.currentStreak)}`,
    label: "连续天数"
  },
  {
    key: "score",
    value: homeAnalytics.value.loading ? "--" : formatScore(homeAnalytics.value.averageScore),
    label: "平均评分"
  }
]);

const heroStatIcons = ["", "", "🔥", ""];

function formatHeroStatValue(value) {
  const text = `${value ?? ""}`.trim();
  if (!text) return "--";
  if (/^[^\d-]/.test(text) && /\d/.test(text)) {
    return text.replace(/^[^\d-]+\s*/, "");
  }
  return text;
}
const progressItemMeta = [
  {
    taskType: "RA",
    icon: "🎙",
    iconBg: "#EEF3FD",
    name: "RA · 朗读",
    fill: "#2563EB"
  },
  {
    taskType: "WFD",
    icon: "🎧",
    iconBg: "#ECFDF3",
    name: "WFD · 听写句子",
    fill: "#059669"
  },
  {
    taskType: "RTS",
    icon: "💬",
    iconBg: "#F4F3FF",
    name: "RTS · 情景回应",
    fill: "#6941C6"
  },
  {
    taskType: "DI",
    icon: "🖼",
    iconBg: "var(--og-bg)",
    name: "DI · 图片描述",
    fill: "var(--orange)"
  },
  {
    taskType: "RS",
    icon: "🔊",
    iconBg: "#EEF3FD",
    name: "RS · 复述句子",
    fill: "#4F7BEE"
  },
  {
    taskType: "WE",
    icon: "✍️",
    iconBg: "#FFF2EA",
    name: "WE · 写作",
    fill: "#E36F35"
  }
];

const liveProgressItems = computed(() =>
  progressItemMeta.map((item) => {
    const completedCountRaw = Number(profileProgress.value.completedCounts?.[item.taskType] || 0);
    const totalCount = Number(profileProgress.value.totalCounts?.[item.taskType] || 0);
    const completedCount = totalCount > 0
      ? Math.min(completedCountRaw, totalCount)
      : completedCountRaw;
    const hasStarted = completedCount > 0;
    const percent = totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;

    let pct = "同步中...";
    let pctColor = "";
    if (!profileProgress.value.loading) {
      if (totalCount <= 0) {
        pct = hasStarted ? "已练习" : "题库待同步";
        pctColor = "var(--hi)";
      } else if (hasStarted) {
        pct = `${percent}%`;
      } else {
        pct = "未开始";
        pctColor = "var(--hi)";
      }
    }

    return {
      ...item,
      width: profileProgress.value.loading || !totalCount || !hasStarted
        ? "0%"
        : `${Math.max(percent, 4)}%`,
      count: profileProgress.value.loading
        ? "--/--"
        : `${formatInteger(completedCount)}/${totalCount > 0 ? formatInteger(totalCount) : "--"}`,
      pct,
      pctColor
    };
  })
);

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
    icon: "🔐",
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

const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim());
const avatarInputRef = ref(null);
const avatarUploading = ref(false);
const avatarUploadError = ref("");

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
      key: `milestone-${item.days}` ,
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
const heroStudyRingProgress = computed(() => {
  const score = Number(homeAnalytics.value.averageScore ?? 0);
  if (homeAnalytics.value.loading || !Number.isFinite(score) || score <= 0) return 0;
  return Math.max(0, Math.min(score / 90, 1));
});
const heroStudyRingDegree = computed(() => `${(heroStudyRingProgress.value * 360).toFixed(1)}deg`);
const heroStudyScore = computed(() =>
  homeAnalytics.value.loading ? "--" : formatScore(homeAnalytics.value.averageScore)
);
const heroStudyStatus = computed(() => {
  if (homeAnalytics.value.loading) return "正在同步你的学习状态...";

  const totalCount = Number(homeAnalytics.value.totalCount || 0);
  const averageScore = Number(homeAnalytics.value.averageScore || 0);

  if (totalCount <= 0) return "开始第一题后，这里会自动点亮。";
  if (averageScore >= 60) return "状态在线，继续保持冲分节奏！";
  if (averageScore >= 45) return "继续保持，稳步提升中！";
  return "基础在累积，坚持练习会更稳。";
});
const heroStudyFacts = computed(() => [
  `累计练习 ${formatInteger(homeAnalytics.value.totalCount)} 题`,
  `已坚持 ${formatInteger(homeAnalytics.value.activeDaysCount)} 天`
]);
const heroWeekSummary = computed(() => {
  if (homeAnalytics.value.loading) return "正在同步本周练习频率";
  return `已练习 ${formatInteger(homeAnalytics.value.activeDaysCount)} 天 · 当前连续 ${formatInteger(currentStreak.value)} 天`;
});
const heroWeekDots = computed(() =>
  homeAnalytics.value.recentDays.map((item, index) => ({
    key: item.key,
    label: WEEKDAY_SHORT_LABELS[index] || `${index + 1}`,
    active: Number(item.count || 0) > 0,
    today: Boolean(item.isToday)
  }))
);
const heroQuoteLines = ["每一次练习，", "都是通往更好的自己。"];

function selectPlan(planKey) {
  selectedPlanKey.value = planKey;
}

function goBack() {
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

function triggerAvatarPicker() {
  if (avatarUploading.value) return;
  avatarInputRef.value?.click?.();
}

async function handleAvatarFileChange(event) {
  const input = event?.target;
  const file = input?.files?.[0] || null;
  if (input) {
    input.value = "";
  }
  if (!file) return;

  avatarUploadError.value = "请选择图片文件";

  if (!String(file.type || "").startsWith("image/")) {
    avatarUploadError.value = "请选择图片文件";
    return;
  }

  if (Number(file.size || 0) > 8 * 1024 * 1024) {
    avatarUploadError.value = "请选择图片文件";
    return;
  }

  avatarUploading.value = true;
  try {
    const avatarDataUrl = await createAvatarDataUrl(file);
    await authStore.updateAvatarDataUrl(avatarDataUrl);
  } catch (error) {
    console.error("Avatar upload failed:", error);
    avatarUploadError.value = error?.message || "头像上传失败，请稍后重试";
  } finally {
    avatarUploading.value = false;
  }
}

async function createAvatarDataUrl(file) {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) {
      throw new Error("当前浏览器不支持头像处理");
  }

  const sourceWidth = Number(image.naturalWidth || image.width || 0);
  const sourceHeight = Number(image.naturalHeight || image.height || 0);
  if (!sourceWidth || !sourceHeight) {
    throw new Error("图片读取失败，请重新选择");
  }

  const sourceSize = Math.min(sourceWidth, sourceHeight);
  const sourceX = Math.max(0, (sourceWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (sourceHeight - sourceSize) / 2);

  context.clearRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.86);
  return blobToDataUrl(blob);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("图片读取失败，请重新选择"));
    };
    image.src = objectUrl;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("头像处理失败，请重试"));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("头像编码失败，请重试"));
    reader.readAsDataURL(blob);
  });
}

async function loadProfileSnapshots({ reset = false } = {}) {
  if (profileRefreshPromise) {
    return profileRefreshPromise;
  }

  if (reset) {
    homeAnalytics.value = createEmptyHomeAnalytics();
    profilePortrait.value = createEmptyProfilePortrait();
    profileProgress.value = createEmptyProfileProgress();
  }

  profileRefreshPromise = (async () => {
    await authStore.init();
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    const [analyticsSnapshot, portraitSnapshot, progressSnapshot] = await Promise.all([
      loadHomeAnalyticsSnapshotForAuth(authStore),
      loadProfilePortraitSnapshotForAuth(authStore),
      loadProfileProgressSnapshotForAuth(authStore)
    ]);

    homeAnalytics.value = analyticsSnapshot;
    profilePortrait.value = portraitSnapshot;
    profileProgress.value = progressSnapshot;
  })();

  try {
    await profileRefreshPromise;
  } finally {
    profileRefreshPromise = null;
  }
}

function handleProfileFocusRefresh() {
  void loadProfileSnapshots({ reset: false });
}

function handleProfileVisibilityChange() {
  if (typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;
  void loadProfileSnapshots({ reset: false });
}

onMounted(async () => {
  await loadProfileSnapshots({ reset: true });

  if (typeof window !== "undefined") {
    window.addEventListener("focus", handleProfileFocusRefresh);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleProfileVisibilityChange);
  }
});

onUnmounted(() => {
  if (typeof window !== "undefined") {
    window.removeEventListener("focus", handleProfileFocusRefresh);
  }
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", handleProfileVisibilityChange);
  }
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
          <div class="av-wrap">
            <button
              type="button"
              class="av"
              :disabled="avatarUploading"
              title="点击更换头像"
              aria-label="点击更换头像"
              @click="triggerAvatarPicker"
            >
              <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" class="av__img" />
              <span v-else>{{ userInitial }}</span>
            </button>
            <span class="av-crown" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="av-crown__icon" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 17h16l-1.4-8-4.8 3.5L12 5 10.2 12.5 5.4 9 4 17Z" fill="currentColor" stroke="none" />
                <path d="M6 19h12" stroke-linecap="round" />
              </svg>
            </span>
            <span class="av-spark" aria-hidden="true">
              <svg viewBox="0 0 16 16" class="av-spark__icon" fill="currentColor">
                <path d="M8 1.2 9.6 6.4 14.8 8l-5.2 1.6L8 14.8 6.4 9.6 1.2 8l5.2-1.6Z" />
              </svg>
            </span>
          </div>
          <input
            ref="avatarInputRef"
            type="file"
            accept="image/*"
            class="avatar-input"
            @change="handleAvatarFileChange"
          />
          <div>
            <div class="hero-name">{{ userDisplayName }}</div>
            <div v-if="userEmail" class="hero-email">{{ userEmail }}</div>
            <div class="trial-pill">
              <div class="trial-pill__dot" />
              {{ trialPillText }}
            </div>
            <div v-if="avatarUploadError" class="hero-avatar-error">{{ avatarUploadError }}</div>
          </div>
        </div>

        <div class="hero-stats">
          <div v-for="(stat, index) in heroStats" :key="stat.label" class="hs">
            <div v-if="heroStatIcons[index]" class="hs-icon" aria-hidden="true">{{ heroStatIcons[index] }}</div>
            <div class="hs-copy">
              <div class="hs-n">{{ formatHeroStatValue(stat.value) }}</div>
              <div class="hs-l">{{ stat.label }}</div>
            </div>
          </div>
        </div>

        <div class="hero-study-rail">
          <section class="hero-study-card">
            <div class="hero-study-card__title">学习状态</div>
            <div class="hero-study-card__ring" :style="{ '--hero-study-progress': heroStudyRingDegree }">
              <div class="hero-study-card__ring-inner">
                <div class="hero-study-card__ring-value">{{ heroStudyScore }}</div>
                <div class="hero-study-card__ring-label">平均分</div>
              </div>
            </div>
            <p class="hero-study-card__message">{{ heroStudyStatus }}</p>
            <ul class="hero-study-card__facts">
              <li v-for="item in heroStudyFacts" :key="item">{{ item }}</li>
            </ul>
          </section>

          <section class="hero-week-card">
            <div class="hero-week-card__title">本周练习频率</div>
            <p class="hero-week-card__summary">{{ heroWeekSummary }}</p>
            <div class="hero-week-card__days">
              <div v-for="item in heroWeekDots" :key="item.key" class="hero-week-card__day">
                <span class="hero-week-card__label">{{ item.label }}</span>
                <span
                  class="hero-week-card__dot"
                  :class="{
                    'hero-week-card__dot--active': item.active,
                    'hero-week-card__dot--today': item.today
                  }"
                >
                  <span
                    v-if="item.active"
                    class="hero-week-card__dot-core"
                    :class="{ 'hero-week-card__dot-core--today': item.today }"
                  >
                    {{ item.today ? "🔥" : "" }}
                  </span>
                </span>
              </div>
            </div>
            <div class="hero-week-card__legend">
              <span class="hero-week-card__legend-item">
                <span class="hero-week-card__legend-dot hero-week-card__legend-dot--active" />
                练习日
              </span>
              <span class="hero-week-card__legend-item">
                <span class="hero-week-card__legend-dot" />
                未练习
              </span>
            </div>
          </section>

          <section class="hero-atmosphere">
            <div class="hero-atmosphere__copy">
              <p v-for="line in heroQuoteLines" :key="line" class="hero-atmosphere__line">{{ line }}</p>
            </div>

            <div class="hero-atmosphere__scene" aria-hidden="true">
              <svg viewBox="0 0 320 360" class="hero-atmosphere__svg" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <radialGradient id="profileSceneGlow" cx="72%" cy="82%" r="48%">
                  <stop offset="0%" stop-color="rgba(255,226,174,0.92)" />
                  <stop offset="35%" stop-color="rgba(255,226,174,0.34)" />
                  <stop offset="100%" stop-color="rgba(255,226,174,0)" />
                </radialGradient>
                <linearGradient id="profileScenePath" x1="18%" y1="100%" x2="80%" y2="0%">
                  <stop offset="0%" stop-color="#FFF3B1" />
                  <stop offset="42%" stop-color="#FFE08A" />
                  <stop offset="100%" stop-color="#FFF8DE" />
                </linearGradient>
                <linearGradient id="profileSceneHillBack" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#18396E" />
                  <stop offset="100%" stop-color="#0E2751" />
                </linearGradient>
                <linearGradient id="profileSceneHillFront" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#10284F" />
                  <stop offset="100%" stop-color="#091731" />
                </linearGradient>
                <filter id="profileSceneBlur" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="7" />
                </filter>
                <linearGradient id="profileSceneNebula" x1="16%" y1="0%" x2="84%" y2="100%">
                  <stop offset="0%" stop-color="rgba(255,255,255,0)" />
                  <stop offset="30%" stop-color="rgba(195,224,255,0.12)" />
                  <stop offset="52%" stop-color="rgba(164,204,255,0.3)" />
                  <stop offset="72%" stop-color="rgba(255,255,255,0.14)" />
                  <stop offset="100%" stop-color="rgba(255,255,255,0)" />
                </linearGradient>
                <linearGradient id="profileSceneMist" x1="8%" y1="16%" x2="88%" y2="78%">
                  <stop offset="0%" stop-color="rgba(125,164,245,0.03)" />
                  <stop offset="46%" stop-color="rgba(125,164,245,0.18)" />
                  <stop offset="100%" stop-color="rgba(125,164,245,0.02)" />
                </linearGradient>
              </defs>

              <ellipse cx="236" cy="112" rx="126" ry="80" fill="#87AFFF" opacity="0.11" filter="url(#profileSceneBlur)" />
              <ellipse cx="210" cy="176" rx="126" ry="88" fill="url(#profileSceneMist)" opacity="0.95" />
              <ellipse cx="258" cy="314" rx="104" ry="36" fill="url(#profileSceneGlow)" opacity="0.75" />
              <path d="M24 96C78 64 156 80 218 110C256 127 280 130 320 112" fill="none" stroke="url(#profileSceneNebula)" stroke-width="22" stroke-linecap="round" opacity="0.62" />
              <path d="M42 150C96 122 150 126 192 146C228 162 264 168 320 152" fill="none" stroke="rgba(146,186,255,0.06)" stroke-width="16" stroke-linecap="round" opacity="0.7" />
              <g fill="#FFFFFF" opacity="0.9">
                <circle cx="34" cy="28" r="1.4" />
                <circle cx="64" cy="42" r="1.2" />
                <circle cx="102" cy="24" r="1.6" />
                <circle cx="146" cy="48" r="1.2" />
                <circle cx="188" cy="26" r="1.4" />
                <circle cx="236" cy="38" r="1.3" />
                <circle cx="276" cy="22" r="1.5" />
                <circle cx="292" cy="54" r="1.1" />
                <circle cx="52" cy="90" r="1" />
                <circle cx="92" cy="74" r="1.1" />
                <circle cx="254" cy="78" r="1" />
                <circle cx="126" cy="82" r="1" />
                <circle cx="284" cy="96" r="1.2" />
                <circle cx="26" cy="142" r="1" />
                <circle cx="298" cy="136" r="1" />
              </g>

              <path d="M0 240C36 216 78 206 126 214C164 220 199 214 236 186C264 166 291 164 320 174V360H0Z" fill="url(#profileSceneHillBack)" opacity="0.92" />
              <path d="M0 282C40 258 78 256 118 268C156 280 190 273 227 244C260 220 288 218 320 230V360H0Z" fill="url(#profileSceneHillFront)" />

              <path
                d="M104 360C118 337 136 318 158 300C181 281 198 268 214 245C228 225 237 205 255 188C262 181 267 177 271 174"
                fill="none"
                stroke="url(#profileScenePath)"
                stroke-width="10"
                stroke-linecap="round"
                opacity="0.96"
              />
              <path
                d="M104 360C118 337 136 318 158 300C181 281 198 268 214 245C228 225 237 205 255 188C262 181 267 177 271 174"
                fill="none"
                stroke="#FFFFFF"
                stroke-width="2.8"
                stroke-linecap="round"
                opacity="0.82"
              />
              <path
                d="M104 360C116 343 132 328 151 312C173 293 188 282 205 258C218 239 225 220 244 201C255 190 262 183 271 177"
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                stroke-width="18"
                stroke-linecap="round"
                opacity="0.38"
              />

              <circle cx="266" cy="168" r="18" fill="#FFE8A8" opacity="0.2" />
              <rect x="261" y="144" width="10" height="36" rx="3" fill="#F8F4EA" />
              <rect x="256.5" y="158" width="19" height="10" rx="3" fill="#EAD49B" />
              <rect x="263.4" y="137" width="5.2" height="12" rx="2.4" fill="#FFF3C8" />
              <circle cx="266" cy="139" r="6" fill="#FFE59C" />

              <path d="M30 318C40 292 51 280 64 271C82 258 100 258 118 268C104 282 93 299 86 318Z" fill="#08162F" />
              <circle cx="84" cy="264" r="13" fill="#08162F" />
              <path d="M72 270C81 278 89 288 95 302" fill="none" stroke="#15305F" stroke-width="4.5" stroke-linecap="round" />
              <path d="M83 289C91 293 98 301 104 314" fill="none" stroke="#1C3D7A" stroke-width="3.6" stroke-linecap="round" />
              </svg>
            </div>
          </section>
        </div>
      </div>

      <div class="content">
        <div class="vip-card profile-section profile-section--vip">
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

        <div class="content-column content-column--primary">
        <div class="sec profile-section profile-section--portrait">
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

        <div class="ms-card profile-section profile-section--streak">
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
                  <circle cx="55" cy="55" r="44" fill="none" stroke="#DDE3EE" stroke-width="9" />
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
                  <text x="55" y="50" text-anchor="middle" font-size="26" font-weight="700" fill="#143164" font-family="sans-serif">
                    {{ homeAnalytics.loading ? "--" : formatInteger(currentStreak) }}
                  </text>
                  <text x="55" y="64" text-anchor="middle" font-size="10" fill="#8CA0C0" font-family="sans-serif">
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

        </div>

        <div class="content-column content-column--secondary">
        <div class="sec profile-section profile-section--progress">
          <div class="sec-hdr">
            <div class="sec-title">📈 各题型进度</div>
          </div>
          <div class="sec-body" style="padding: 4px 18px">
            <div class="prog-list">
              <div v-for="item in liveProgressItems" :key="item.name" class="prog-row">
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

        <div class="sec profile-section profile-section--settings">
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

        <button type="button" class="logout-btn profile-section profile-section--logout" @click="handleLogout">退出登录</button>
        </div>
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
  background:
    radial-gradient(circle at 12% 10%, rgba(255, 255, 255, 0.9) 0, rgba(255, 255, 255, 0) 22%),
    linear-gradient(180deg, #eef4fb 0, #f6f8fc 220px, #f7f9fc 100%);
  -webkit-font-smoothing: antialiased;
  color: var(--tx);
}

.nav {
  background: rgba(255, 255, 255, 0.92);
  height: 52px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 30;
  border-bottom: 1px solid #dbe4f0;
  backdrop-filter: blur(10px);
}

.nav-back {
  padding: 0;
  border: none;
  background: none;
  font-size: 13px;
  color: #6c7a93;
  cursor: pointer;
}

.nav-title {
  font-size: 14px;
  font-weight: 600;
  color: #143164;
}

.nav-spacer {
  width: 60px;
}

.wrap {
  width: min(100%, 1240px);
  margin: 0 auto;
  padding: 24px 20px 56px;
}

.hero {
  background: linear-gradient(180deg, var(--navy) 0%, var(--navy2) 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  box-shadow: 0 18px 40px rgba(15, 36, 68, 0.12);
  padding: 28px 24px 30px;
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
  background: rgba(232, 132, 90, 0.08);
  pointer-events: none;
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 24px;
  position: relative;
}

.av-wrap {
  width: 58px;
  height: 58px;
  position: relative;
  flex-shrink: 0;
}

.av {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #5b79b3 0%, #344f80 34%, #1b315d 72%, #13274b 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.55rem;
  font-weight: 800;
  color: #fff;
  border: 3px solid #dce6f8;
  cursor: pointer;
  transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
  padding: 0;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 6px 12px rgba(19, 39, 75, 0.1);
  overflow: hidden;
}

.av:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(8, 20, 38, 0.2);
}

.av:disabled {
  cursor: progress;
  opacity: 0.88;
}

.av__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.av-crown {
  position: absolute;
  top: -8px;
  left: 11px;
  width: 20px;
  height: 20px;
  color: #f4b53f;
  filter: drop-shadow(0 2px 2px rgba(167, 109, 0, 0.18));
  pointer-events: none;
}

.av-spark {
  position: absolute;
  top: 6px;
  right: -1px;
  width: 12px;
  height: 12px;
  color: #7e96c9;
  pointer-events: none;
}

.av-crown__icon,
.av-spark__icon {
  width: 100%;
  height: 100%;
}

.avatar-input {
  display: none;
}

.hero-avatar-error {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(255, 211, 201, 0.95);
  font-weight: 600;
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
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.hero-study-rail {
  display: none;
}

.hs {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px 12px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.hs-icon {
  display: none;
}

.hs-copy {
  min-width: 0;
}

.hs-n {
  font-size: 24px;
  font-weight: 600;
  color: #fff;
  letter-spacing: -0.3px;
}

.hs-l {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 5px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.hero-study-card,
.hero-week-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 16px 15px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}

.hero-study-card__title,
.hero-week-card__title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}

.hero-study-card__ring {
  --hero-study-progress: 0deg;
  width: 132px;
  height: 132px;
  margin: 14px auto 12px;
  border-radius: 50%;
  padding: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    conic-gradient(from -90deg, #3C82FF 0deg var(--hero-study-progress), rgba(226, 234, 246, 0.26) var(--hero-study-progress) 360deg);
}

.hero-study-card__ring-inner {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: linear-gradient(180deg, rgba(19, 40, 77, 0.98) 0%, rgba(16, 32, 65, 0.98) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.hero-study-card__ring-value {
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  letter-spacing: -0.04em;
}

.hero-study-card__ring-label {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(222, 233, 247, 0.6);
}

.hero-study-card__message {
  margin: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}

.hero-study-card__facts {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-study-card__facts li {
  position: relative;
  padding-left: 14px;
  font-size: 12px;
  color: rgba(219, 229, 245, 0.72);
}

.hero-study-card__facts li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(94, 186, 255, 0.9);
  transform: translateY(-50%);
}

.hero-week-card__summary {
  margin: 7px 0 0;
  font-size: 12px;
  color: rgba(219, 229, 245, 0.56);
}

.hero-week-card__days {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.hero-week-card__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.hero-week-card__label {
  font-size: 12px;
  color: rgba(219, 229, 245, 0.64);
}

.hero-week-card__dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1.5px solid rgba(219, 229, 245, 0.28);
  background: rgba(9, 23, 49, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.hero-week-card__dot--active {
  background: linear-gradient(180deg, #51D38D 0%, #1DAA6A 100%);
  border-color: rgba(146, 255, 199, 0.72);
  box-shadow: 0 10px 20px rgba(29, 170, 106, 0.2);
}

.hero-week-card__dot-core {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  display: block;
}

.hero-week-card__dot-core--today {
  width: auto;
  height: auto;
  background: transparent;
  font-size: 11px;
  line-height: 1;
}

.hero-week-card__legend {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.hero-week-card__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(219, 229, 245, 0.62);
}

.hero-week-card__legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid rgba(219, 229, 245, 0.28);
  background: rgba(9, 23, 49, 0.35);
}

.hero-week-card__legend-dot--active {
  background: linear-gradient(180deg, #51D38D 0%, #1DAA6A 100%);
  border-color: rgba(146, 255, 199, 0.72);
}

.hero-atmosphere {
  display: none;
}

.hero-atmosphere__svg {
  width: 100%;
  height: 100%;
  display: block;
}

.content {
  margin-top: 18px;
  padding: 0;
  background: transparent;
  border-radius: 0;
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.profile-section {
  min-width: 0;
}

.content-column {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.vip-card {
  background: linear-gradient(135deg, var(--navy2) 0%, var(--navy) 100%);
  border-radius: var(--r);
  margin-bottom: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 16px 32px rgba(15, 36, 68, 0.12);
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
  color: rgba(255, 255, 255, 0.88);
}

.plan-price {
  font-size: 26px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
  line-height: 1;
}

.plan.featured .plan-price {
  color: #fff;
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
  background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
  border: 1px solid var(--bd);
  border-radius: var(--r);
  margin-bottom: 0;
  overflow: hidden;
  box-shadow: 0 16px 32px rgba(15, 36, 68, 0.05);
}

.ms-hdr {
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--bd);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ms-hdr-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx);
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
  color: var(--tx);
  text-align: center;
  margin-bottom: 3px;
}

.ms-ring-sub {
  font-size: 11px;
  color: var(--mu);
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
  background: #E3EAF4;
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
  border: 2px solid #DBE4F0;
  background: #F6F9FD;
  color: #9AACBF;
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
  color: var(--hi);
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
  background: var(--navy-soft);
  border: 1px solid var(--bd);
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
  color: var(--tx);
  margin-bottom: 2px;
}

.ms-tip-sub {
  font-size: 10px;
  color: var(--mu);
}

.ms-week-title {
  font-size: 10px;
  color: var(--mu);
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
  background: #E2E9F2;
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
  color: #9AA7BB;
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

@media (max-width: 620px) {
  .wrap {
    padding: 20px 16px 40px;
  }

  .hero {
    padding: 24px 18px 26px;
  }

  .hero-top {
    gap: 14px;
    margin-bottom: 22px;
  }

  .hero-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .hs {
    padding: 12px 8px;
  }

  .hs-n {
    font-size: 20px;
  }

  .hs-l {
    font-size: 8px;
    margin-top: 3px;
  }
}

@media (max-width: 520px) {
  .hero-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .hs {
    padding: 10px 6px;
  }

  .hs-n {
    font-size: 17px;
  }

  .hs-l {
    font-size: 7px;
    margin-top: 2px;
  }
}

@media (max-width: 430px) {
  .hero-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
  }

  .hs {
    padding: 9px 5px;
  }

  .hs-n {
    font-size: 15px;
  }

  .hs-l {
    font-size: 6px;
    margin-top: 2px;
  }
}

@media (max-width: 360px) {
  .hero-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .hs {
    padding: 14px 12px;
  }

  .hs-n {
    font-size: 19px;
  }

  .hs-l {
    font-size: 9px;
    margin-top: 3px;
  }
}

@media (min-width: 960px) {
  .profile-page {
    background:
      radial-gradient(circle at 12% 14%, rgba(255, 255, 255, 0.72) 0, rgba(255, 255, 255, 0) 22%),
      radial-gradient(circle at 82% 8%, rgba(232, 132, 90, 0.12) 0, rgba(232, 132, 90, 0) 18%),
      linear-gradient(180deg, #edf3fb 0, #eaf0f9 220px, #f6f8fc 220px, #f6f8fc 100%);
  }

  .nav {
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 10px 30px rgba(10, 22, 40, 0.08);
  }

  .wrap {
    max-width: 1320px;
    padding: 28px 24px 72px;
  }

  .content {
    margin-top: 26px;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
    gap: 24px;
    align-items: start;
  }

  .content-column {
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-width: 0;
  }

  .profile-section--vip {
    grid-column: 1 / -1;
    margin-bottom: 0;
  }

  .content-column > .profile-section {
    margin-bottom: 0;
  }

  .vip-card,
  .sec,
  .ms-card,
  .logout-btn {
    box-shadow: 0 18px 42px rgba(15, 36, 68, 0.08);
  }

  .profile-section--portrait .sec-body,
  .profile-section--progress .sec-body {
    padding-top: 18px;
    padding-bottom: 18px;
  }

  .radar-wrap {
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
  }

  .portrait-radar {
    align-self: center;
    width: 272px;
    height: 248px;
  }

  .sec-body {
    padding: 18px 20px;
  }

  .ms-body {
    padding: 22px 24px;
  }

  .ms-sparkline {
    height: 72px;
  }

  .logout-btn {
    margin-top: 0;
  }
}

@media (min-width: 1080px) {
  .nav {
    background: rgba(15, 36, 68, 0.96);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow: none;
  }

  .nav-back {
    color: rgba(255, 255, 255, 0.72);
  }

  .nav-title {
    color: #fff;
  }

  .wrap {
    width: min(calc(100vw - 48px), 1720px);
    max-width: 1720px;
    padding: 28px 16px 72px;
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    gap: 28px;
    align-items: stretch;
  }

  .hero {
    height: 100%;
    min-height: 100%;
    padding: 22px 18px 22px;
    border-radius: 28px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .hero-top {
    gap: 14px;
    align-items: center;
    margin-bottom: 0;
  }

  .hero-stats {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .hero-study-rail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }

  .hs {
    display: flex;
    align-items: center;
    gap: 14px;
    text-align: left;
    padding: 16px 16px;
    border-radius: 18px;
  }

  .hs-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    font-size: 18px;
    flex: none;
  }

  .hs-copy {
    flex: 1;
  }

  .hs-n {
    font-size: 28px;
    line-height: 1;
  }

  .hs-l {
    font-size: 12px;
    margin-top: 8px;
    text-transform: none;
    letter-spacing: 0;
  }

  .hero-study-card,
  .hero-week-card {
    padding: 18px 16px;
    border-radius: 22px;
  }

  .hero-atmosphere {
    position: relative;
    display: flex;
    flex: 1;
    align-items: flex-start;
    min-height: 338px;
    margin: 6px -18px -22px;
    padding: 26px 28px 0;
    overflow: hidden;
  }

  .hero-atmosphere::before {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 72% 26%, rgba(125, 167, 255, 0.12) 0, rgba(125, 167, 255, 0) 26%),
      linear-gradient(180deg, rgba(33, 70, 131, 0.02) 0%, rgba(19, 45, 89, 0.08) 22%, rgba(12, 31, 64, 0.18) 100%);
    z-index: 0;
  }

  .hero-atmosphere::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(18, 41, 80, 0) 0%, rgba(18, 41, 80, 0.12) 12%, rgba(8, 24, 50, 0.42) 100%);
    z-index: 0;
  }

  .hero-atmosphere__copy {
    position: relative;
    z-index: 2;
    width: min(69%, 194px);
    padding-left: 2px;
    padding-top: 8px;
  }

  .hero-atmosphere__line {
    margin: 0;
    font-size: 18px;
    line-height: 1.62;
    font-weight: 670;
    color: rgba(255, 255, 255, 0.95);
    letter-spacing: 0.012em;
    text-shadow: 0 3px 10px rgba(4, 14, 29, 0.22);
  }

  .hero-atmosphere__scene {
    position: absolute;
    inset: 0;
    z-index: 1;
    opacity: 0.98;
  }

  .content {
    margin-top: 0;
  }

  .vip-card {
    box-shadow: 0 18px 42px rgba(15, 36, 68, 0.08);
  }

  .ms-card {
    background: linear-gradient(180deg, #ffffff 0%, #f9fbff 100%);
    border: 1px solid var(--bd);
    box-shadow: 0 18px 42px rgba(15, 36, 68, 0.08);
  }

  .ms-hdr {
    border-bottom: 1px solid var(--bd);
  }

  .ms-hdr-title,
  .ms-ring-n {
    color: var(--tx);
  }

  .ms-ring-sub {
    color: var(--mu);
  }

  .ms-dot-segment {
    background: #E3EAF4;
  }

  .ms-dot-circle {
    border: 2px solid #DBE4F0;
    background: #F6F9FD;
    color: #9AACBF;
  }

  .ms-dot-days {
    color: var(--hi);
  }

  .ms-tip {
    background: var(--navy-soft);
    border: 1px solid var(--bd);
  }

  .ms-tip-title {
    color: var(--tx);
  }

  .ms-tip-sub,
  .ms-week-title,
  .ms-spark-label {
    color: var(--mu);
  }

  .ms-spark-bar {
    background: #E2E9F2;
  }
}
</style>






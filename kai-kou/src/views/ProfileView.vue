<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { BILLING_PAUSED, BILLING_PAUSED_MESSAGE } from "@/lib/billing";
import {
  createEmptyHomeAnalytics,
  formatInteger,
  loadHomeAnalyticsSnapshotForAuth
} from "@/lib/home-analytics";
import {
  createEmptyProfileProgress,
  loadProfileProgressSnapshotForAuth
} from "@/lib/profile-progress";
import { supabase } from "@/lib/supabase";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUIStore();

const selectedPlanKey = ref("month");
const homeAnalytics = ref(createEmptyHomeAnalytics());
const profileProgress = ref(createEmptyProfileProgress());
const favoritesSnapshot = ref(createEmptyFavoritesSnapshot());
const planSnapshot = ref(createEmptyPlanSnapshot());
const avatarInputRef = ref(null);
const avatarUploading = ref(false);
const avatarUploadError = ref("");
let profileRefreshPromise = null;

const navIconMap = {
  home: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/><rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" stroke-width="1.2"/></svg>',
  list: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/><path d="M7 4v3.5l2 1.2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  spark: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M7 1.5C4.24 1.5 2 3.74 2 6.5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5z" stroke="currentColor" stroke-width="1.2"/><path d="M5 6.5h4M7 4.5v4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  square: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M4.5 5h5M4.5 8h3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  report: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 11l3-4 3 2.5 3-5 2 2.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  box: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><path d="M1.5 3h11M1.5 7h7M1.5 11h9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  circle: '<svg width="14" height="14" fill="none" viewBox="0 0 14 14"><circle cx="7" cy="4.5" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 12c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'
};

const navItems = [
  { key: "home", label: "首页", icon: "home", to: "/home" },
  { key: "practice", label: "练习中心", icon: "list", to: "/home#quick" },
  { key: "agent", label: "AI 私教", icon: "spark", to: "/agent" },
  { key: "plan", label: "学习计划", icon: "square", to: "/home#goal" },
  { key: "report", label: "学习报告", icon: "report", to: "/home#report" },
  { key: "library", label: "题库", icon: "box", to: "/home#quick" },
  { key: "profile", label: "个人中心", icon: "circle", to: "/profile" }
];

const plans = [
  {
    key: "week",
    name: "周卡",
    price: "6.9",
    duration: "7 天",
    tags: ["无限练习", "AI 私教", "专属分析"]
  },
  {
    key: "month",
    name: "月卡",
    price: "19.9",
    duration: "30 天",
    badge: "推荐",
    recommended: true,
    tags: ["无限练习", "AI 私教", "专属分析"]
  },
  {
    key: "lifetime",
    name: "永久卡",
    price: "49.9",
    duration: "永久",
    badge: "超值",
    value: true,
    tags: ["无限练习", "AI 私教", "专属分析"]
  }
];

const displayNavItems = computed(() =>
  navItems.map((item) => ({
    ...item,
    icon: navIconMap[item.icon] || navIconMap.circle
  }))
);

const profile = computed(() => authStore.profile || {});
const userDisplayName = computed(() => authStore.displayName || "同学");
const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "K";
});
const userEmail = computed(() =>
  normalizeText(authStore.user?.email || profile.value?.email)
);
const userAvatarUrl = computed(() => normalizeText(authStore.avatarUrl));
const emailVerified = computed(() =>
  Boolean(authStore.user?.email_confirmed_at || authStore.user?.confirmed_at)
);

const profileLocation = computed(() => {
  const city = pickText(
    profile.value?.city,
    profile.value?.location_city,
    profile.value?.study_city,
    authStore.user?.user_metadata?.city
  );
  const country = pickText(
    profile.value?.country,
    profile.value?.region,
    profile.value?.location_country,
    authStore.user?.user_metadata?.country
  );
  const explicitLocation = pickText(
    profile.value?.location,
    profile.value?.region_city,
    authStore.user?.user_metadata?.location
  );

  if (city && country) return `${city}, ${country}`;
  return explicitLocation || city || country || "Melbourne, Australia";
});

const targetScore = computed(() =>
  formatTargetScore(
    pickText(
      profile.value?.target_score,
      profile.value?.targetScore,
      profile.value?.goal_score,
      profile.value?.goalScore,
      profile.value?.pte_target_score,
      authStore.user?.user_metadata?.target_score
    ) || "79+"
  )
);

const examDate = computed(() =>
  formatDateValue(
    pickText(
      profile.value?.exam_date,
      profile.value?.examDate,
      profile.value?.test_date,
      profile.value?.testDate,
      profile.value?.target_exam_date,
      authStore.user?.user_metadata?.exam_date
    ),
    "2026-08-18"
  )
);

const currentStage = computed(() =>
  pickText(
    profile.value?.current_stage,
    profile.value?.currentStage,
    profile.value?.stage,
    profile.value?.learning_stage,
    authStore.user?.user_metadata?.current_stage
  ) || inferStageFromScore() || "冲刺提升"
);

const membershipPill = computed(() => {
  if (!authStore.loaded) {
    return { kind: "loading", icon: "⌛", label: "状态同步中" };
  }
  if (authStore.isPremium) {
    return { kind: "vip", icon: "♛", label: "VIP 无限练习" };
  }
  if (authStore.isInTrial) {
    return { kind: "trial", icon: "✦", label: `试用 ${formatInteger(authStore.trialDaysLeft)} 天` };
  }
  return { kind: "locked", icon: "◇", label: "未开通" };
});

const currentPlanLabel = computed(() => {
  if (!authStore.loaded) return "同步中";
  if (authStore.isPremium) {
    const plan = normalizeText(profile.value?.vip_plan);
    if (plan === "week") return "VIP 周卡";
    if (plan === "month") return "VIP 月卡";
    return "VIP 无限练习";
  }
  if (authStore.isInTrial) return `试用中 · 剩余 ${formatInteger(authStore.trialDaysLeft)} 天`;
  return "暂未开通";
});

const membershipSummary = computed(() => {
  if (!authStore.loaded) return "当前套餐：正在同步会员状态";
  if (authStore.isPremium) {
    const expiresAt = formatDateValue(profile.value?.vip_expires_at, "");
    const suffix = expiresAt ? `有效期至 ${expiresAt}` : "长期有效";
    return `当前套餐：${currentPlanLabel.value}（${suffix}）`;
  }
  if (authStore.isInTrial) return `当前套餐：试用权益（剩余 ${formatInteger(authStore.trialDaysLeft)} 天）`;
  return "当前套餐：未开通";
});

const profileInfoRows = computed(() => [
  { icon: "◎", label: "目标分数", value: targetScore.value, strong: true },
  { icon: "▣", label: "考试日期", value: examDate.value, strong: true },
  { icon: "◉", label: "当前阶段", value: currentStage.value, strong: true },
  {
    icon: "✉",
    label: "邮箱",
    value: userEmail.value || "邮箱未绑定",
    badge: emailVerified.value ? "已验证" : "未验证",
    badgeTone: emailVerified.value ? "ok" : "warn"
  }
]);

const accountStatusRows = computed(() => [
  {
    label: "最近一次登录",
    value: formatLastLogin(authStore.user?.last_sign_in_at),
    icon: "◉",
    color: "purple"
  },
  {
    label: "考员状态",
    value: buildVipStatusText(),
    icon: "♛",
    color: "gold"
  },
  {
    label: "做题时长/天数",
    value: buildPracticeTimeText(),
    icon: "◈",
    color: "green"
  },
  {
    label: "AI 私教记忆",
    value: buildAgentMemoryText(),
    icon: "A",
    color: "blue"
  },
  {
    label: "今日计划状态",
    value: buildPlanStatusText(),
    icon: "✓",
    color: "teal"
  }
]);

const identityConfig = computed(() => [
  { label: "目标分数", value: targetScore.value, icon: "↗", color: "blue" },
  { label: "重点模块", value: focusModules.value, icon: "▣", color: "purple" },
  { label: "每日学习时长", value: dailyStudyTime.value, icon: "◷", color: "cyan" },
  { label: "最佳时段", value: bestStudyWindow.value, icon: "☼", color: "gold" },
  { label: "AI 建议强度", value: aiIntensity.value, icon: "✕", color: "red" }
]);

const focusModules = computed(() => {
  const explicit = normalizeListValue(
    profile.value?.focus_modules ||
    profile.value?.focusModules ||
    profile.value?.priority_modules ||
    authStore.user?.user_metadata?.focus_modules
  );
  if (explicit.length) return explicit.slice(0, 4).join(" / ");

  const completedCounts = profileProgress.value?.completedCounts || {};
  const ranked = ["RA", "DI", "WFD", "RTS", "WE", "RS"]
    .map((taskType) => ({
      taskType,
      count: Number(completedCounts[taskType] || 0)
    }))
    .sort((left, right) => left.count - right.count)
    .map((item) => item.taskType);

  return ranked.slice(0, 3).join(" / ") || "RA / DI / WFD";
});

const dailyStudyTime = computed(() => {
  const explicit = pickText(
    profile.value?.daily_study_time,
    profile.value?.dailyStudyTime,
    profile.value?.daily_minutes,
    profile.value?.dailyStudyMinutes
  );
  if (explicit) return /\d/.test(explicit) && !explicit.includes("分钟") ? `${explicit} 分钟` : explicit;
  if (planSnapshot.value.plan?.total_minutes) {
    return `${formatInteger(planSnapshot.value.plan.total_minutes)} 分钟`;
  }
  return "60-90 分钟";
});

const bestStudyWindow = computed(() =>
  pickText(
    profile.value?.best_study_time,
    profile.value?.bestStudyTime,
    profile.value?.preferred_study_time,
    profile.value?.study_window
  ) || "晚上 19:00-22:00"
);

const aiIntensity = computed(() =>
  pickText(
    profile.value?.ai_intensity,
    profile.value?.aiIntensity,
    profile.value?.coach_intensity,
    authStore.user?.user_metadata?.ai_intensity
  ) || "标准"
);

const favorites = computed(() => {
  const summary = favoritesSnapshot.value;
  const total = summary.totalCount;
  const templateCount = summary.countsByTask.RTS || summary.countsByTask.WE || 0;
  const questionCount = total;
  const materialCount = readLocalMaterialCount();

  return [
    { label: "收藏模板", count: templateCount, icon: "★", color: "gold" },
    { label: "收藏题目", count: questionCount, icon: "▣", color: "green" },
    { label: "收藏资料", count: materialCount, icon: "▤", color: "blue" }
  ];
});

const favoritesSourceNote = computed(() => {
  if (favoritesSnapshot.value.loading) return "同步中";
  if (favoritesSnapshot.value.source === "error") return "同步失败";
  if (favoritesSnapshot.value.source === "local_missing_table") return "本地记录";
  return "";
});

const commonModules = computed(() => {
  const taskCounts = homeAnalytics.value?.taskWeekCounts || {};
  const ranked = Object.entries(taskCounts)
    .filter(([, count]) => Number(count || 0) > 0)
    .sort((left, right) => Number(right[1] || 0) - Number(left[1] || 0))
    .map(([taskType]) => taskType);

  return (ranked.length ? ranked : ["RA", "DI", "WFD"]).slice(0, 3).concat("AI 私教");
});

const recentPages = computed(() => {
  const lastTask = normalizeText(homeAnalytics.value?.lastPracticeTaskType);
  const pages = [lastTask && `${lastTask} 练习`, "AI 私教", "学习报告", "题库"].filter(Boolean);
  return [...new Set(pages)].slice(0, 4);
});

const devices = computed(() => {
  const current = detectCurrentDevice();
  return [
    {
      icon: current.icon,
      name: current.name,
      meta: current.meta,
      status: "当前设备",
      current: true
    },
    {
      icon: "▯",
      name: "iPhone 13",
      meta: "iOS · Safari",
      status: "3 小时前",
      current: false
    }
  ];
});

const loginRecords = computed(() => {
  const current = detectCurrentDevice();
  return [
    {
      icon: current.icon,
      device: current.name,
      location: profileLocation.value,
      status: "当前在线",
      online: true
    },
    {
      icon: "▯",
      device: "iPhone 13",
      location: profileLocation.value,
      status: "3 小时前"
    },
    {
      icon: "▭",
      device: "Windows PC",
      location: profileLocation.value,
      status: "昨天 11:42"
    },
    {
      icon: "▭",
      device: "iPad Air (5th gen)",
      location: profileLocation.value,
      status: "05-06 18:21"
    }
  ];
});

function isNavActive(item) {
  if (item.key === "profile") return route.path === "/profile";
  if (item.key === "home") return route.path === "/home" || route.path === "/";
  return route.path === item.to || route.fullPath === item.to;
}

function goTo(path) {
  const normalized = normalizeText(path);
  if (!normalized) return;
  if (normalized === route.fullPath) return;
  router.push(normalized);
}

function selectPlan(planKey) {
  selectedPlanKey.value = planKey;
}

function openUpgrade() {
  if (BILLING_PAUSED) {
    uiStore.showToast(BILLING_PAUSED_MESSAGE, "info", 3600);
  }
  router.push({
    path: "/upgrade",
    query: {
      plan: selectedPlanKey.value
    }
  });
}

function handleEditProfile() {
  uiStore.showToast("当前可先更换头像；昵称、城市等资料表单待接入。", "info");
  triggerAvatarPicker();
}

function handleEditLearningConfig() {
  uiStore.showToast("学习配置暂以 profiles/AI 计划读取为主，编辑表单待接入。", "info");
}

function openFavorites() {
  router.push("/rts/favorites");
}

function openCommonContent() {
  router.push("/home#quick");
}

function showLoginRecordsNotice() {
  uiStore.showToast("登录设备记录目前是前端展示，待新增登录记录表/API 后可查看真实列表。", "info");
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

  avatarUploadError.value = "";

  if (!String(file.type || "").startsWith("image/")) {
    avatarUploadError.value = "请选择图片文件";
    uiStore.showToast(avatarUploadError.value, "warning");
    return;
  }

  if (Number(file.size || 0) > 8 * 1024 * 1024) {
    avatarUploadError.value = "图片不能超过 8MB";
    uiStore.showToast(avatarUploadError.value, "warning");
    return;
  }

  avatarUploading.value = true;
  try {
    const avatarDataUrl = await createAvatarDataUrl(file);
    await authStore.updateAvatarDataUrl(avatarDataUrl);
    uiStore.showToast("头像已更新", "success");
  } catch (error) {
    console.error("Avatar upload failed:", error);
    avatarUploadError.value = error?.message || "头像上传失败，请稍后重试";
    uiStore.showToast(avatarUploadError.value, "warning");
  } finally {
    avatarUploading.value = false;
  }
}

async function loadProfileSnapshots({ reset = false } = {}) {
  if (profileRefreshPromise) {
    return profileRefreshPromise;
  }

  if (reset) {
    homeAnalytics.value = createEmptyHomeAnalytics();
    profileProgress.value = createEmptyProfileProgress();
    favoritesSnapshot.value = createEmptyFavoritesSnapshot();
    planSnapshot.value = createEmptyPlanSnapshot();
  }

  profileRefreshPromise = (async () => {
    await authStore.init();
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    const [
      analyticsSnapshot,
      progressSnapshot,
      favoriteSummary,
      todayPlan
    ] = await Promise.all([
      loadHomeAnalyticsSnapshotForAuth(authStore),
      loadProfileProgressSnapshotForAuth(authStore),
      loadFavoritesSnapshotForAuth(),
      loadTodayPlanSnapshotForAuth()
    ]);

    homeAnalytics.value = analyticsSnapshot;
    profileProgress.value = progressSnapshot;
    favoritesSnapshot.value = favoriteSummary;
    planSnapshot.value = todayPlan;
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

function buildVipStatusText() {
  if (!authStore.loaded) return "会员状态同步中";
  if (authStore.isPremium) {
    const expiresAt = formatDateValue(profile.value?.vip_expires_at, "");
    return expiresAt ? `${currentPlanLabel.value} · 有效期至 ${expiresAt}` : `${currentPlanLabel.value} · 长期有效`;
  }
  if (authStore.isInTrial) return `试用中 · 剩余 ${formatInteger(authStore.trialDaysLeft)} 天`;
  return "未开通 VIP";
}

function buildPracticeTimeText() {
  if (homeAnalytics.value.loading) return "练习记录同步中";
  const weekMinutes = Number(homeAnalytics.value.weekMinutes || 0);
  const activeDays = Number(homeAnalytics.value.activeDaysCount || 0);
  if (weekMinutes > 0) return `本周 ${formatInteger(weekMinutes)} 分钟 · 累计 ${formatInteger(activeDays)} 天`;
  return `累计 ${formatInteger(activeDays)} 天 · 做题时长待同步`;
}

function buildAgentMemoryText() {
  if (!authStore.loaded || planSnapshot.value.loading) return "同步中";
  if (!authStore.isPremium && !authStore.isInTrial) return "未启用 · VIP 专属";
  if (planSnapshot.value.reasonCode === "table_missing") return "待配置 · 计划表未创建";
  if (planSnapshot.value.reasonCode === "progress_error") return "已启用 · 进度同步失败";
  if (planSnapshot.value.reasonCode === "error") return "同步失败";
  if (planSnapshot.value.plan) {
    const updatedAt = formatShortTime(planSnapshot.value.plan.updated_at || planSnapshot.value.plan.created_at);
    return updatedAt ? `已启用 · 计划更新于 ${updatedAt}` : "已启用 · 今日计划已同步";
  }
  return "已启用 · 今日暂无计划";
}

function buildPlanStatusText() {
  if (planSnapshot.value.loading) return "计划同步中";
  if (planSnapshot.value.reasonCode === "progress_error") return "计划进度同步失败";
  if (planSnapshot.value.reasonCode === "error") return "AI 计划同步失败";
  const progress = planSnapshot.value.progress;
  if (progress?.targetCount > 0) {
    if (progress.isComplete) {
      return `已完成 · ${formatInteger(progress.completedCount)} / ${formatInteger(progress.targetCount)} 项`;
    }
    return `进行中 · 已完成 ${formatInteger(progress.completedCount)} / ${formatInteger(progress.targetCount)} 项`;
  }
  if (homeAnalytics.value.todayCount > 0) {
    return `暂无 AI 计划 · 今日已练 ${formatInteger(homeAnalytics.value.todayCount)} 题`;
  }
  return "暂无计划 · 可在 AI 私教生成";
}

function inferStageFromScore() {
  const average = Number(homeAnalytics.value.averageScore);
  if (!Number.isFinite(average) || average <= 0) return "";
  if (average >= 75) return "冲刺提升";
  if (average >= 58) return "稳步提分";
  return "基础巩固";
}

async function loadFavoritesSnapshotForAuth() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    return {
      ...createEmptyFavoritesSnapshot(),
      loading: false,
      source: "auth_missing"
    };
  }

  try {
    const { data, error } = await supabase
      .from("favorites")
      .select("task_type, question_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      if (isMissingTableError(error, "favorites")) {
        const localCounts = readLocalFavoriteCounts(userId);
        return buildFavoritesSnapshotFromCounts(localCounts, "local_missing_table");
      }
      throw error;
    }

    const countsByTask = {};
    (Array.isArray(data) ? data : []).forEach((row) => {
      const taskType = normalizeTaskType(row?.task_type) || "OTHER";
      countsByTask[taskType] = (countsByTask[taskType] || 0) + 1;
    });

    return buildFavoritesSnapshotFromCounts(countsByTask, "remote");
  } catch (error) {
    console.warn("Favorites summary load failed:", error);
    return {
      ...createEmptyFavoritesSnapshot(),
      loading: false,
      source: "error"
    };
  }
}

async function loadTodayPlanSnapshotForAuth() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    return {
      ...createEmptyPlanSnapshot(),
      loading: false,
      reasonCode: "auth_missing"
    };
  }

  const dateKey = getLocalDateKey();

  try {
    const { data, error } = await supabase
      .from("agent_daily_plans")
      .select("id, user_id, plan_date, title, source, plan_json, created_at, updated_at")
      .eq("user_id", userId)
      .eq("plan_date", dateKey)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error, "agent_daily_plans")) {
        return {
          ...createEmptyPlanSnapshot(),
          loading: false,
          reasonCode: "table_missing"
        };
      }
      throw error;
    }

    if (!data) {
      return {
        ...createEmptyPlanSnapshot(),
        loading: false,
        reasonCode: "no_plan"
      };
    }

    const plan = normalizePlanRow(data);
    const progress = await loadPlanProgress({ userId, plan, dateKey });

    return {
      loading: false,
      reasonCode: "ok",
      plan,
      progress
    };
  } catch (error) {
    console.warn("Agent plan summary load failed:", error);
    if (error?.profileViewReasonCode === "progress_error") {
      return {
        ...createEmptyPlanSnapshot(),
        loading: false,
        reasonCode: "progress_error"
      };
    }
    return {
      ...createEmptyPlanSnapshot(),
      loading: false,
      reasonCode: "error"
    };
  }
}

async function loadPlanProgress({ userId, plan, dateKey }) {
  const { startIso, endIso } = getLocalDayRange(dateKey);
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, created_at")
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error) {
    const progressError = new Error(error.message || "Plan progress load failed");
    progressError.profileViewReasonCode = "progress_error";
    progressError.cause = error;
    throw progressError;
  }

  const counts = {};
  if (Array.isArray(data)) {
    data.forEach((row) => {
      const taskType = normalizeTaskType(row?.task_type);
      if (!taskType) return;
      counts[taskType] = (counts[taskType] || 0) + 1;
    });
  }

  let completedCount = 0;
  let targetCount = 0;
  (Array.isArray(plan.items) ? plan.items : []).forEach((item) => {
    const taskType = normalizeTaskType(item?.task_type);
    const target = Math.max(1, Math.round(Number(item?.target_count || item?.count || 1)));
    const completed = Math.min(Math.max(0, Number(counts[taskType] || 0)), target);
    targetCount += target;
    completedCount += completed;
  });

  return {
    completedCount,
    targetCount,
    isComplete: targetCount > 0 && completedCount >= targetCount
  };
}

function normalizePlanRow(row) {
  const rawPlan = isPlainObject(row?.plan_json) ? row.plan_json : {};
  const rawItems = Array.isArray(rawPlan?.items) ? rawPlan.items : [];
  const items = rawItems.map((item) => ({
    task_type: normalizeTaskType(item?.task_type || item?.type),
    label: normalizeText(item?.label),
    count: Math.max(1, Math.round(Number(item?.count || item?.target_count || 1))),
    minutes: Math.max(0, Math.round(Number(item?.minutes || 0)))
  })).filter((item) => item.task_type);

  return {
    id: normalizeText(row?.id),
    plan_date: normalizeText(row?.plan_date),
    title: normalizeText(row?.title || rawPlan?.title) || "今日 AI 训练计划",
    source: normalizeText(row?.source || rawPlan?.source),
    total_minutes: Math.max(0, Math.round(Number(rawPlan?.total_minutes || sumBy(items, "minutes") || 0))),
    created_at: normalizeText(row?.created_at),
    updated_at: normalizeText(row?.updated_at),
    items
  };
}

function createEmptyFavoritesSnapshot() {
  return {
    loading: true,
    source: "loading",
    totalCount: 0,
    countsByTask: {}
  };
}

function createEmptyPlanSnapshot() {
  return {
    loading: true,
    reasonCode: "loading",
    plan: null,
    progress: null
  };
}

function buildFavoritesSnapshotFromCounts(countsByTask, source) {
  const safeCounts = isPlainObject(countsByTask) ? countsByTask : {};
  return {
    loading: false,
    source,
    totalCount: Object.values(safeCounts).reduce((sum, value) => sum + Number(value || 0), 0),
    countsByTask: safeCounts
  };
}

function readLocalFavoriteCounts(userId) {
  const taskTypes = ["RA", "RTS", "DI"];
  return taskTypes.reduce((counts, taskType) => {
    const key = `kai_kou_${taskType.toLowerCase()}_favorites_${userId}`;
    counts[taskType] = readJsonArrayLengthFromLocalStorage(key);
    return counts;
  }, {});
}

function readLocalMaterialCount() {
  if (typeof localStorage === "undefined") return 0;
  const userId = normalizeText(authStore.user?.id);
  if (!userId) return 0;

  const scopedKeys = [
    `kai_kou_saved_materials_${userId}`,
    `kai_kou_saved_materials:${userId}`,
    `kai_kou_material_favorites_${userId}`
  ];

  const scopedCount = scopedKeys.reduce((total, key) => (
    total + readJsonArrayLengthFromLocalStorage(key)
  ), 0);

  if (scopedCount > 0) return scopedCount;

  return readJsonArrayLengthFromLocalStorage("kai_kou_saved_materials", userId);
}

function readJsonArrayLengthFromLocalStorage(key, userId = "") {
  if (typeof localStorage === "undefined") return 0;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;

    if (!userId) return parsed.length;

    return parsed.filter((item) => {
      const itemUserId = normalizeText(item?.user_id || item?.userId || item?.owner_id);
      return itemUserId === userId;
    }).length;
  } catch {
    return 0;
  }
}

function formatFavoriteCount(count) {
  if (favoritesSnapshot.value.loading || favoritesSnapshot.value.source === "error") return "--";
  return formatInteger(count);
}

async function resolveCurrentUserId() {
  const authUserId = normalizeText(authStore.user?.id);
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return normalizeText(data?.session?.user?.id);
}

async function createAvatarDataUrl(file) {
  const image = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  const size = 256;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器不支持头像处理");

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
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

function detectCurrentDevice() {
  if (typeof navigator === "undefined") {
    return {
      icon: "▭",
      name: "当前浏览器设备",
      meta: "Browser"
    };
  }

  const ua = navigator.userAgent || "";
  const isMac = /Macintosh|Mac OS X/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isIphone = /iPhone/i.test(ua);
  const isIpad = /iPad/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isChrome = /Chrome|CriOS/i.test(ua) && !/Edg/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua);
  const isEdge = /Edg/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);

  const browser = isEdge ? "Edge" : isFirefox ? "Firefox" : isChrome ? "Chrome 浏览器" : isSafari ? "Safari" : "浏览器";
  if (isIphone) return { icon: "▯", name: "iPhone", meta: `iOS · ${browser}` };
  if (isIpad) return { icon: "▭", name: "iPad", meta: `iPadOS · ${browser}` };
  if (isAndroid) return { icon: "▯", name: "Android Phone", meta: `Android · ${browser}` };
  if (isMac) return { icon: "▭", name: "MacBook Pro 14-inch", meta: `macOS · ${browser}` };
  if (isWindows) return { icon: "▭", name: "Windows PC", meta: `Windows · ${browser}` };
  return { icon: "▭", name: "当前浏览器设备", meta: browser };
}

function formatLastLogin(value) {
  const formatted = formatRelativeDateTime(value);
  const device = detectCurrentDevice().name;
  return formatted ? `${formatted} · ${device}` : `当前会话 · ${device}`;
}

function formatRelativeDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  if (sameDay) return `今天 ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }) + ` ${time}`;
}

function formatShortTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return sameDay ? `今日 ${time}` : formatDateValue(value, "");
}

function formatDateValue(value, fallback) {
  const text = normalizeText(value);
  if (!text) return fallback;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return text;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTargetScore(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "79+";
  if (normalized.endsWith("+")) return normalized;
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) return `${Math.round(numeric)}+`;
  return normalized;
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalDayRange(dateKey) {
  const [year, month, day] = `${dateKey || getLocalDateKey()}`.split("-").map((value) => Number(value));
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
}

function isMissingTableError(error, tableName) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message).toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return message.includes("relation") && message.includes(tableName);
}

function normalizeTaskType(value) {
  const taskType = normalizeText(value).toUpperCase();
  return ["RA", "RS", "RL", "WE", "WFD", "DI", "RTS"].includes(taskType) ? taskType : "";
}

function normalizeListValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized.split(/[,/、，\s]+/).map((item) => normalizeText(item)).filter(Boolean);
}

function pickText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return "";
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sumBy(items, key) {
  return (Array.isArray(items) ? items : []).reduce((sum, item) => sum + Number(item?.[key] || 0), 0);
}
</script>

<template>
  <div class="personal-center-page">
    <aside class="profile-sidebar">
      <RouterLink class="profile-logo" to="/home" aria-label="返回首页">
        <div class="profile-logo-icon" aria-hidden="true">
          <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".95" />
            <rect x="10" y="2" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="2" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".5" />
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="#F5EFE4" opacity=".75" />
          </svg>
        </div>
        <span class="profile-logo-name">开口 PTE</span>
      </RouterLink>

      <nav class="profile-nav" aria-label="个人中心导航">
        <RouterLink
          v-for="item in displayNavItems"
          :key="item.key"
          class="profile-nav-item"
          :class="{ 'profile-nav-item--active': isNavActive(item) }"
          :to="item.to"
          :aria-current="isNavActive(item) ? 'page' : undefined"
        >
          <span class="profile-nav-icon" aria-hidden="true" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <div class="profile-sidebar-footer">
        <div class="profile-promo">
          <div class="profile-promo-title">PTE 备考资料包</div>
          <div class="profile-promo-sub">真题 · 高频词汇 · 模板</div>
          <button class="profile-promo-button" type="button" @click="goTo('/we/templates')">免费领取</button>
        </div>
      </div>
    </aside>

    <section class="profile-shell">
      <header class="profile-topbar">
        <div>
          <div class="hello">你好，{{ userDisplayName }} 👋</div>
          <div class="hello-sub">坚持每天进步一点，PTE 梦想更近一步！</div>
        </div>

        <div class="topbar-actions">
          <div class="vip-pill" :class="`vip-pill--${membershipPill.kind}`">
            <span>{{ membershipPill.icon }}</span>
            <span>{{ membershipPill.label }}</span>
          </div>
          <div class="user-mini">
            <span class="mini-avatar">
              <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
              <span v-else>{{ userInitial }}</span>
            </span>
            <span>{{ userDisplayName }}</span>
          </div>
        </div>
      </header>

      <main class="profile-main">
        <section class="page-heading">
          <h1>个人中心</h1>
          <span>PERSONAL CENTER</span>
          <p>管理您的账号信息、学习身份配置、会员权益与设备安全</p>
        </section>

        <section class="dashboard-grid">
          <div class="dashboard-column">
            <article class="pc-card profile-card">
              <div class="card-title">
                <span class="title-icon">♟</span>
                <span>个人资料与账号中心</span>
              </div>

              <div class="profile-body">
                <div class="profile-left">
                  <button
                    type="button"
                    class="avatar-large"
                    :disabled="avatarUploading"
                    aria-label="更换头像"
                    @click="triggerAvatarPicker"
                  >
                    <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
                    <span v-else>{{ userInitial }}</span>
                  </button>
                  <input
                    ref="avatarInputRef"
                    type="file"
                    accept="image/*"
                    class="avatar-input"
                    @change="handleAvatarFileChange"
                  />
                  <div class="profile-name">
                    {{ userDisplayName }}
                    <button type="button" class="icon-edit" aria-label="编辑个人资料" @click="handleEditProfile">✎</button>
                  </div>
                  <div class="profile-location">{{ profileLocation }}</div>
                  <div class="profile-vip">♛ {{ membershipPill.label }}</div>
                  <div v-if="avatarUploadError" class="avatar-error">{{ avatarUploadError }}</div>
                </div>

                <div class="profile-info">
                  <div v-for="row in profileInfoRows" :key="row.label" class="info-row">
                    <span class="row-label"><i>{{ row.icon }}</i>{{ row.label }}</span>
                    <strong v-if="row.strong">{{ row.value }}</strong>
                    <span v-else class="email-value">{{ row.value }}</span>
                    <span v-if="row.badge" class="verified" :class="`verified--${row.badgeTone}`">{{ row.badge }}</span>
                  </div>

                  <button class="primary-btn profile-btn" type="button" @click="handleEditProfile">编辑个人资料</button>
                </div>
              </div>
            </article>

            <article class="pc-card membership-card">
              <div class="card-title with-note">
                <span>
                  <span class="title-icon crown">♛</span>
                  会员充值与权益
                </span>
                <em>{{ membershipSummary }}</em>
              </div>

              <div class="plans">
                <button
                  v-for="plan in plans"
                  :key="plan.key"
                  type="button"
                  class="plan-card"
                  :class="{
                    recommended: plan.recommended,
                    value: plan.value,
                    selected: selectedPlanKey === plan.key
                  }"
                  @click="selectPlan(plan.key)"
                >
                  <span v-if="plan.badge" class="plan-badge">{{ plan.badge }}</span>
                  <div class="plan-name">{{ plan.name }}</div>
                  <div class="plan-price">
                    ¥{{ plan.price }}
                    <small>/ {{ plan.duration }}</small>
                  </div>
                  <div class="plan-tags">
                    <span v-for="tag in plan.tags" :key="tag">{{ tag }}</span>
                  </div>
                </button>
              </div>

              <div class="membership-footer">
                <button class="primary-btn charge-btn" type="button" @click="openUpgrade">立即充值</button>
                <div class="safe-text">⊙ 安全支付 · 随时可取消 · 专属客服支持</div>
              </div>
            </article>
          </div>

          <div class="dashboard-column">
            <article class="pc-card status-card">
              <div class="card-title">
                <span class="title-icon">▤</span>
                <span>账号状态摘要</span>
              </div>

              <div class="status-list">
                <div v-for="item in accountStatusRows" :key="item.label" class="status-row">
                  <span class="soft-icon" :class="item.color">{{ item.icon }}</span>
                  <span class="status-label">{{ item.label }}</span>
                  <span class="status-value">{{ item.value }}</span>
                </div>
              </div>
            </article>

            <article class="pc-card identity-card">
              <div class="card-title">
                <span class="title-icon">⚙</span>
                <span>学习身份配置</span>
              </div>

              <div class="config-list">
                <div v-for="item in identityConfig" :key="item.label" class="config-row">
                  <span class="soft-icon" :class="item.color">{{ item.icon }}</span>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>

              <button class="ghost-btn full" type="button" @click="handleEditLearningConfig">编辑学习配置</button>
            </article>

            <article class="pc-card favorites-card">
              <div class="card-title">
                <span class="title-icon">★</span>
                <span>我的收藏与常用内容</span>
              </div>

              <div class="favorites-inner">
                <div class="favorite-box">
                  <div class="section-mini-title">
                    我的收藏
                    <span v-if="favoritesSourceNote" class="source-note">{{ favoritesSourceNote }}</span>
                  </div>
                  <div class="favorite-tiles">
                    <div v-for="item in favorites" :key="item.label" class="favorite-tile">
                      <span class="tile-icon" :class="item.color">{{ item.icon }}</span>
                      <span>{{ item.label }}</span>
                      <strong>{{ formatFavoriteCount(item.count) }}</strong>
                    </div>
                  </div>
                </div>

                <div class="common-box">
                  <div class="section-mini-title">最近使用</div>
                  <div class="chip-line">
                    <span class="chip-label">常用模块</span>
                    <span v-for="item in commonModules" :key="item" class="mini-chip">{{ item }}</span>
                  </div>
                  <div class="chip-line">
                    <span class="chip-label">最近访问</span>
                    <span v-for="item in recentPages" :key="item" class="mini-chip">{{ item }}</span>
                  </div>
                </div>
              </div>

              <div class="two-actions">
                <button class="ghost-btn" type="button" @click="openFavorites">★ 查看我的收藏</button>
                <button class="ghost-btn" type="button" @click="openCommonContent">→ 进入常用内容</button>
              </div>
            </article>
          </div>

          <article class="pc-card device-card">
            <div class="card-title">
              <span class="title-icon">▰</span>
              <span>设备管理</span>
            </div>

            <div class="device-layout">
              <div class="device-panel">
                <div class="section-mini-title">当前登录设备（{{ devices.length }}）</div>
                <div v-for="item in devices" :key="item.name" class="device-row">
                  <span class="device-icon">{{ item.icon }}</span>
                  <div>
                    <strong>{{ item.name }}</strong>
                    <p>{{ item.meta }}</p>
                  </div>
                  <span :class="item.current ? 'current-device' : 'device-time'">{{ item.status }}</span>
                </div>
              </div>

              <div class="device-panel login-panel">
                <div class="section-mini-title">近期登录记录</div>
                <div v-for="item in loginRecords" :key="`${item.device}-${item.status}`" class="login-row">
                  <span class="device-icon small">{{ item.icon }}</span>
                  <strong>{{ item.device }}</strong>
                  <span>{{ item.location }}</span>
                  <em :class="{ online: item.online }">{{ item.status }}</em>
                </div>
                <button class="link-btn" type="button" @click="showLoginRecordsNotice">查看全部登录记录 →</button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </section>
  </div>
</template>

<style scoped>
*,*::before,*::after {
  box-sizing: border-box;
}

button {
  font: inherit;
}

.personal-center-page {
  --c0: #1e1208;
  --c1: #3a2510;
  --c2: #7c5c3e;
  --c3: #a07850;
  --bg0: #f5efe4;
  --bg1: #ede8dc;
  --bg2: #e5dfd4;
  --bg3: #d9cfbd;
  --card: #faf6ef;
  --card2: #f2ebe0;
  --bdr: #d4c8b4;
  --bdr2: #c4b49c;
  --mute: #8f8477;
  --soft: #9a8f80;
  --content-max: 1320px;
  --layout-gap: 16px;
  --card-radius: 14px;
  min-height: 100vh;
  display: flex;
  overflow: hidden;
  background:
    radial-gradient(circle at 82% 10%, rgba(255, 249, 238, 0.86), transparent 32%),
    var(--bg1);
  color: var(--c0);
  font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.profile-sidebar {
  width: 220px;
  min-height: 100vh;
  background: var(--bg2);
  border-right: 1px solid #d7cfc0;
  display: flex;
  flex: 0 0 220px;
  flex-direction: column;
}

.profile-logo {
  height: 68px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  color: var(--c0);
  text-decoration: none;
  border-bottom: 1px solid #d7cfc0;
}

.profile-logo-icon {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--c2);
  display: grid;
  place-items: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.profile-logo-name {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.profile-nav {
  padding: 22px 12px;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 9px;
}

.profile-nav-item {
  height: 42px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #8c8174;
  font-size: 15px;
  font-weight: 500;
  text-decoration: none;
  transition: background 0.13s, border-color 0.13s, color 0.13s;
}

.profile-nav-item:hover {
  background: #ede8df;
  color: #6b5a44;
}

.profile-nav-item--active {
  color: var(--c2);
  background: var(--bg3);
  border-color: #cabdaa;
  box-shadow: inset 0 1px 0 rgba(245, 239, 228, 0.5);
  font-weight: 700;
}

.profile-nav-icon {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
  flex: 0 0 20px;
}

.profile-nav-icon svg {
  width: 15px;
  height: 15px;
}

.profile-sidebar-footer {
  padding: 0 14px 22px;
}

.profile-promo {
  min-height: 105px;
  padding: 16px;
  border-radius: 12px;
  background: var(--bg3);
  border: 1px solid #cfc4b1;
  color: var(--c2);
}

.profile-promo-title {
  font-size: 14px;
  font-weight: 800;
}

.profile-promo-sub {
  margin-top: 7px;
  font-size: 12px;
  color: var(--soft);
}

.profile-promo-button {
  margin-top: 13px;
  border: 0;
  border-radius: 7px;
  padding: 8px 14px;
  background: var(--c2);
  color: #fff8ee;
  font-weight: 800;
  cursor: pointer;
}

.profile-shell {
  flex: 1;
  min-width: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.profile-topbar {
  height: 56px;
  flex: 0 0 56px;
  background: var(--bg2);
  border-bottom: 1px solid #d7cfc0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 28px;
}

.hello {
  font-size: 15px;
  font-weight: 800;
}

.hello-sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--soft);
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vip-pill {
  height: 28px;
  padding: 0 13px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #d5ad55;
  background: #fff1c9;
  color: var(--c2);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.vip-pill--trial {
  background: #fff7dd;
}

.vip-pill--locked {
  background: var(--card2);
  border-color: var(--bdr);
}

.user-mini {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--c2);
  font-size: 13px;
  font-weight: 600;
}

.mini-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--c2);
  color: #fff8ee;
  display: grid;
  place-items: center;
  font-weight: 800;
}

.mini-avatar img,
.avatar-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-main {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 22px 28px 24px;
}

.profile-main::-webkit-scrollbar {
  width: 4px;
}

.profile-main::-webkit-scrollbar-thumb {
  background: var(--bdr);
  border-radius: 99px;
}

.page-heading {
  width: min(100%, var(--content-max));
  margin: 0 auto var(--layout-gap);
}

.page-heading h1 {
  display: inline-block;
  margin: 0;
  font-size: 26px;
  line-height: 1.1;
  letter-spacing: 0.01em;
}

.page-heading span {
  margin-left: 14px;
  color: var(--soft);
  font-size: 14px;
  letter-spacing: 0.08em;
}

.page-heading p {
  margin: 7px 0 0;
  color: #8b8073;
  font-size: 14px;
}

.dashboard-grid {
  width: min(100%, var(--content-max));
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(360px, 0.9fr);
  gap: var(--layout-gap);
  align-items: stretch;
}

.dashboard-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--layout-gap);
  height: 100%;
}

.dashboard-column:first-child .profile-card {
  flex: 0 0 auto;
}

.dashboard-column:first-child .membership-card {
  flex: 1 1 auto;
}

.pc-card {
  min-width: 0;
  background: rgba(250, 246, 238, 0.82);
  border: 1px solid #d8d0c3;
  border-radius: var(--card-radius);
  box-shadow:
    0 10px 24px rgba(124, 92, 62, 0.035),
    inset 0 1px 0 rgba(255, 255, 255, 0.62);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 900;
  padding: 12px 16px 0;
}

.card-title.with-note {
  gap: 10px;
  flex-wrap: wrap;
}

.card-title.with-note > span {
  font-weight: 900;
}

.card-title.with-note em {
  font-style: normal;
  color: var(--mute);
  font-size: 13px;
  font-weight: 500;
}

.title-icon {
  color: var(--c2);
  font-size: 14px;
}

.profile-card {
  min-height: 275px;
  display: flex;
  flex-direction: column;
}

.profile-body {
  display: grid;
  grid-template-columns: 34% 1fr;
  min-height: 228px;
  flex: 1;
  padding: 12px 28px 18px;
}

.profile-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #dfd6c9;
  min-width: 0;
}

.avatar-large {
  width: 86px;
  height: 86px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(circle at 35% 30%, #9b734c, #6d4d30);
  color: #fff8ee;
  cursor: pointer;
  font-size: 32px;
  font-weight: 900;
  box-shadow: 0 8px 18px rgba(109, 77, 48, 0.16);
}

.avatar-large:disabled {
  cursor: progress;
  opacity: 0.82;
}

.avatar-input {
  display: none;
}

.profile-name {
  margin-top: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 21px;
  font-weight: 900;
}

.icon-edit {
  border: 0;
  background: transparent;
  color: var(--c2);
  cursor: pointer;
  font-size: 14px;
  padding: 2px;
}

.profile-location {
  margin-top: 8px;
  color: #4f463f;
  font-size: 13px;
  text-align: center;
}

.profile-vip {
  margin-top: 13px;
  height: 28px;
  padding: 0 14px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  border: 1px solid #d5ad55;
  background: #fff1c9;
  color: var(--c2);
  font-size: 12px;
  font-weight: 800;
}

.avatar-error {
  margin-top: 8px;
  max-width: 170px;
  color: #b42318;
  font-size: 11px;
  text-align: center;
}

.profile-info {
  padding-left: 28px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.info-row {
  min-height: 41px;
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #dfd6c9;
  font-size: 14px;
}

.info-row:last-of-type {
  border-bottom: 0;
}

.row-label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #5a5046;
  font-weight: 700;
}

.row-label i {
  color: var(--c2);
  font-style: normal;
  font-weight: 700;
}

.info-row strong {
  color: #121212;
  font-size: 15px;
}

.email-value {
  color: #2f2720;
  font-size: 13px;
  min-width: 0;
}

.verified {
  padding: 3px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.verified--ok {
  background: #dff0e4;
  color: #4c9862;
}

.verified--warn {
  background: #fff2cf;
  color: #9b6b16;
}

.primary-btn,
.ghost-btn {
  border-radius: 8px;
  min-height: 31px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 800;
}

.primary-btn {
  background: linear-gradient(180deg, #8a6744 0%, #755335 100%);
  color: #fff8ee;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.primary-btn:hover {
  filter: brightness(1.04);
}

.ghost-btn {
  background: rgba(246, 241, 232, 0.78);
  border-color: #d9cdbb;
  color: var(--c2);
}

.ghost-btn:hover {
  border-color: #b99f80;
  color: #65472f;
}

.profile-btn {
  margin-top: 10px;
  width: min(226px, 100%);
  align-self: start;
}

.status-card {
  min-height: 154px;
  display: flex;
  flex-direction: column;
}

.status-list {
  padding: 8px 18px 10px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.status-row,
.config-row {
  display: grid;
  grid-template-columns: 21px minmax(86px, 0.66fr) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 21px;
  font-size: 12px;
}

.status-label,
.config-row > span:nth-child(2) {
  color: #4f463f;
  font-weight: 700;
}

.status-value,
.config-row strong {
  color: #6b6258;
  font-weight: 500;
  text-align: left;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.soft-icon,
.tile-icon {
  width: 20px;
  height: 20px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 800;
}

.soft-icon.purple { background: #efe8ff; color: #7c4dff; }
.soft-icon.gold { background: #fff0cf; color: #da8b18; }
.soft-icon.green { background: #dff0e4; color: #4c9862; }
.soft-icon.blue { background: #e6efff; color: #3f74d9; }
.soft-icon.teal { background: #dff5ef; color: #18a679; }
.soft-icon.cyan { background: #e4f6ff; color: #3a93c7; }
.soft-icon.red { background: #ffe7ec; color: #db4a63; }

.membership-card {
  min-height: 236px;
  display: flex;
  flex-direction: column;
}

.plans {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
  padding: 12px 14px 0;
}

.plan-card {
  min-height: 126px;
  height: auto;
  padding: 13px 12px 11px;
  position: relative;
  border: 1px solid #d9cdbb;
  border-radius: 10px;
  background: rgba(255, 252, 247, 0.58);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--c0);
}

.plan-card.selected,
.plan-card.recommended {
  border-color: #f28a43;
  box-shadow: 0 0 0 1px rgba(242, 138, 67, 0.2);
}

.plan-card.value {
  overflow: hidden;
}

.plan-badge {
  position: absolute;
  top: -1px;
  right: -1px;
  min-width: 47px;
  height: 22px;
  border-radius: 0 10px 0 10px;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  background: linear-gradient(135deg, #ff8a3d, #f06d2f);
}

.plan-card.value .plan-badge {
  background: linear-gradient(135deg, #a679ff, #8d5ee9);
}

.plan-name {
  font-size: 18px;
  font-weight: 900;
}

.plan-price {
  margin-top: 8px;
  font-size: 27px;
  font-weight: 900;
  letter-spacing: 0.01em;
}

.plan-price small {
  font-size: 14px;
  font-weight: 500;
  color: #5f574e;
}

.plan-tags {
  margin-top: auto;
  padding-top: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
}

.plan-tags span {
  border: 1px solid #d9cdbb;
  border-radius: 999px;
  background: rgba(246, 241, 232, 0.78);
  color: #5c5146;
  font-size: 11px;
  padding: 4px 8px;
  line-height: 1;
  white-space: nowrap;
}

.mini-chip {
  border: 1px solid #d9cdbb;
  border-radius: 999px;
  background: rgba(246, 241, 232, 0.78);
  color: #5c5146;
  font-size: 10px;
  padding: 4px 7px;
  line-height: 1;
  white-space: nowrap;
}

.membership-footer {
  margin-top: 0;
  padding: 10px 14px 13px;
  display: grid;
  grid-template-columns: minmax(210px, 0.48fr) 1fr;
  align-items: center;
  gap: 16px;
}

.charge-btn {
  min-height: 34px;
}

.safe-text {
  color: var(--mute);
  font-size: 12px;
  text-align: center;
}

.identity-card {
  min-height: 164px;
  display: flex;
  flex-direction: column;
}

.config-list {
  padding: 6px 18px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.identity-card .full {
  display: block;
  width: calc(100% - 118px);
  margin: auto auto 9px;
}

.favorites-card {
  min-height: 142px;
  display: flex;
  flex-direction: column;
}

.favorites-inner {
  display: grid;
  grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr);
  gap: 8px;
  padding: 7px 14px 0;
}

.favorite-box,
.common-box,
.device-panel {
  border: 1px solid #d9cdbb;
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.45);
  padding: 6px 8px;
}

.section-mini-title {
  font-size: 12px;
  color: #6e5840;
  font-weight: 900;
}

.source-note {
  margin-left: 7px;
  color: var(--mute);
  font-size: 11px;
  font-weight: 700;
}

.favorite-tiles {
  margin-top: 5px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.favorite-tile {
  min-height: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-size: 12px;
  color: #332820;
}

.favorite-tile span {
  font-size: 11px;
  line-height: 1;
  white-space: nowrap;
}

.favorite-tile strong {
  font-size: 13px;
}

.tile-icon.gold { background: #fff0cf; color: #f5a623; }
.tile-icon.green { background: #dff0e4; color: #50b86a; }
.tile-icon.blue { background: #e6efff; color: #4f7bee; }

.chip-line {
  min-height: 22px;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  color: #5f574e;
}

.chip-label {
  color: #6e5840;
  font-size: 11px;
  font-weight: 900;
}

.two-actions {
  margin-top: auto;
  padding: 6px 14px 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.device-card {
  grid-column: 1 / -1;
  min-height: 180px;
}

.device-layout {
  padding: 10px 14px 15px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--layout-gap);
}

.device-panel {
  min-height: 116px;
}

.device-row {
  min-height: 42px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #e4dacd;
}

.device-row:last-child {
  border-bottom: 0;
}

.device-icon {
  width: 22px;
  color: var(--c2);
  font-size: 17px;
  text-align: center;
}

.device-icon.small {
  font-size: 14px;
}

.device-row strong,
.login-row strong {
  color: #2f2720;
  font-size: 13px;
}

.device-row p {
  margin: 3px 0 0;
  color: #8a8075;
  font-size: 12px;
}

.current-device {
  padding: 5px 10px;
  border-radius: 7px;
  background: #dff0e4;
  color: #4c9862;
  font-size: 12px;
  font-weight: 900;
}

.device-time {
  color: #7f756a;
  font-size: 12px;
}

.login-row {
  min-height: 24px;
  display: grid;
  grid-template-columns: 24px minmax(160px, 1fr) minmax(140px, 1fr) auto;
  align-items: center;
  gap: 9px;
  font-size: 12px;
  color: #7a7066;
}

.login-row em {
  font-style: normal;
  color: #7a7066;
  text-align: right;
}

.login-row em.online {
  color: #4c9862;
  font-weight: 900;
}

.link-btn {
  display: block;
  margin: 12px 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--c2);
  cursor: pointer;
  font-size: 12px;
  font-weight: 800;
}

@media (max-width: 1320px) {
  .profile-sidebar {
    width: 206px;
    flex-basis: 206px;
  }

  .profile-main {
    padding-left: 20px;
    padding-right: 20px;
  }

  .dashboard-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(350px, 0.9fr);
  }

  .profile-body {
    padding-left: 20px;
    padding-right: 20px;
  }

  .profile-info {
    padding-left: 22px;
  }
}

@media (max-width: 1180px) {
  .personal-center-page {
    overflow-x: auto;
  }

  .profile-shell {
    min-width: 1000px;
  }
}
</style>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { BILLING_PAUSED, BILLING_PAUSED_MESSAGE } from "@/lib/billing";
import { getDeviceIconSource } from "@/lib/device-icons";
import {
  createEmptyHomeAnalytics,
  formatInteger,
  loadHomeAnalyticsSnapshotForAuth
} from "@/lib/home-analytics";
import {
  createEmptyLoginEventsSnapshot,
  formatLoginEventDevice,
  loadLoginEventsForAuth
} from "@/lib/login-events";
import { supabase } from "@/lib/supabase";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const uiStore = useUIStore();

const selectedPlanKey = ref("month");
const homeAnalytics = ref(createEmptyHomeAnalytics());
const favoritesSnapshot = ref(createEmptyFavoritesSnapshot());
const planSnapshot = ref(createEmptyPlanSnapshot());
const loginEventsSnapshot = ref(createEmptyLoginEventsSnapshot());
const practiceIdentitySnapshot = ref(createEmptyPracticeIdentitySnapshot());
const avatarInputRef = ref(null);
const avatarUploading = ref(false);
const avatarUploadError = ref("");
const profileModalOpen = ref(false);
const profileSaving = ref(false);
const profileSaveError = ref("");
const profileDraft = ref(createProfileDraft());
const profileDraftOriginal = ref(createProfileDraft());
const avatarDraftDataUrl = ref("");
const avatarDraftName = ref("");
const loggingOut = ref(false);
let profileRefreshPromise = null;
const PROFILE_AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const PROFILE_AVATAR_ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const stageOptions = ["基础巩固", "稳步提分", "冲刺提升"];
const IDENTITY_PRACTICE_LIMIT = 120;
const IDENTITY_RECENT_LIMIT = 30;
const IDENTITY_RECENT_DAYS = 7;
const IDENTITY_MIN_ROWS_FOR_PERIOD = 3;
const IDENTITY_ESTIMATED_MINUTES_PER_PRACTICE = 3;
const IDENTITY_MAX_DURATION_MINUTES = 180;
const profileInfoIconMap = {
  target:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.6"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="5.5" width="16" height="15" rx="3"/><path d="M8 3.5v4M16 3.5v4M4 10h16"/></svg>',
  stage:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 18.5h16"/><path d="M7 15.5l4-4 3 3 5-6"/><path d="M15.5 8.5H19v3.5"/></svg>',
  mail:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="M5 8l6.1 4.4a1.6 1.6 0 0 0 1.8 0L19 8"/></svg>'
};

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
const modalAvatarPreview = computed(() => avatarDraftDataUrl.value || userAvatarUrl.value);
const todayDateKey = computed(() => getLocalDateKey());
const emailVerified = computed(() =>
  Boolean(authStore.user?.email_confirmed_at || authStore.user?.confirmed_at)
);

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
  { icon: "target", label: "目标分数", value: targetScore.value, strong: true },
  { icon: "calendar", label: "考试日期", value: examDate.value, strong: true },
  { icon: "stage", label: "当前阶段", value: currentStage.value, strong: true },
  {
    icon: "mail",
    label: "邮箱",
    value: userEmail.value || "邮箱未绑定",
    badge: emailVerified.value ? "已验证" : "未验证",
    badgeTone: emailVerified.value ? "ok" : "warn"
  }
]);

const accountStatusRows = computed(() => [
  {
    label: "最近一次登录",
    value: latestLoginStatusText.value,
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

const identityTargetScore = computed(() => {
  const configuredTarget = pickText(
    profile.value?.target_score,
    profile.value?.targetScore,
    profile.value?.goal_score,
    profile.value?.goalScore,
    profile.value?.pte_target_score
  );
  return configuredTarget ? formatTargetScore(configuredTarget) : "未设置";
});

const identityPracticeStats = computed(() =>
  buildIdentityPracticeStats(practiceIdentitySnapshot.value.rows || [])
);

const identityConfig = computed(() => [
  { label: "目标分数", value: identityTargetScore.value, icon: "↗", color: "blue" },
  { label: "重点模块", value: focusModules.value, icon: "▣", color: "purple" },
  { label: "每日学习时长", value: dailyStudyTime.value, icon: "◷", color: "cyan" },
  { label: "最佳时段", value: bestStudyWindow.value, icon: "☼", color: "gold" },
  { label: "AI 建议强度", value: aiIntensity.value, icon: "✕", color: "red" }
]);

const focusModules = computed(() => {
  if (practiceIdentitySnapshot.value.loading) return "同步中";
  if (identityPracticeStats.value.focusModules.length) {
    return identityPracticeStats.value.focusModules.join(" / ");
  }
  if (identityPracticeStats.value.recentPracticeModules.length) {
    return identityPracticeStats.value.recentPracticeModules.join(" / ");
  }
  return "练习后自动生成";
});

const dailyStudyTime = computed(() => {
  if (practiceIdentitySnapshot.value.loading) return "同步中";
  if (identityPracticeStats.value.averageDailyMinutes > 0) {
    return `约 ${formatInteger(identityPracticeStats.value.averageDailyMinutes)} 分钟/天`;
  }
  if (identityPracticeStats.value.estimatedDailyMinutes > 0) {
    return `约 ${formatInteger(identityPracticeStats.value.estimatedDailyMinutes)} 分钟/天`;
  }
  if (planSnapshot.value.plan?.total_minutes) {
    return `计划 ${formatInteger(planSnapshot.value.plan.total_minutes)} 分钟/天`;
  }
  return "暂无足够数据";
});

const bestStudyWindow = computed(() =>
  practiceIdentitySnapshot.value.loading
    ? "同步中"
    : identityPracticeStats.value.bestStudyWindow || "练习后自动生成"
);

const aiIntensity = computed(() => {
  if (practiceIdentitySnapshot.value.loading || homeAnalytics.value.loading) return "同步中";
  const stats = identityPracticeStats.value;
  const target = parseTargetScoreNumber(identityTargetScore.value);
  const recentAverage = firstFiniteNumber(
    homeAnalytics.value.currentPeriodAverageScore,
    stats.averageScore,
    homeAnalytics.value.averageScore
  );
  const currentStreak = Number(homeAnalytics.value.currentStreak || 0);

  if (!stats.recentRows.length && !Number(homeAnalytics.value.scoredCount || 0)) {
    return "标准";
  }
  if (target !== null && recentAverage !== null && target >= 79 && recentAverage <= target - 15) {
    return "严格";
  }
  if (target !== null && recentAverage !== null && stats.weakModuleCount >= 2 && recentAverage <= target - 10) {
    return "严格";
  }
  if (
    target !== null &&
    recentAverage !== null &&
    recentAverage >= target - 3 &&
    currentStreak >= 3 &&
    stats.sevenDayRows.length >= 5
  ) {
    return "温和";
  }
  return "标准";
});

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

const loginEvents = computed(() => loginEventsSnapshot.value.events || []);
const latestLoginEvent = computed(() => loginEvents.value[0] || null);
const latestLoginStatusText = computed(() => {
  if (loginEventsSnapshot.value.loading) return "登录记录同步中";
  if (latestLoginEvent.value) return formatLoginEventSummary(latestLoginEvent.value);
  return formatLastLoginFallback(authStore.user?.last_sign_in_at);
});

const devices = computed(() =>
  loginEvents.value.map((event, index) => ({
    id: event.id || `${event.logged_in_at}-${index}`,
    icon: getDeviceIconSource(event),
    name: formatLoginEventDevice(event),
    meta: formatLoginEventBrowser(event),
    status: formatRelativeDateTime(event.logged_in_at) || "时间未记录",
    current: index === 0
  }))
);

const loginRecords = computed(() =>
  loginEvents.value.map((event, index) => ({
    id: event.id || `${event.logged_in_at}-${index}`,
    icon: getDeviceIconSource(event),
    device: formatLoginEventDevice(event),
    browser: formatLoginEventBrowser(event),
    status: formatRelativeDateTime(event.logged_in_at) || "时间未记录",
    online: index === 0
  }))
);

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
  const draft = createProfileDraft({
    displayName: userDisplayName.value,
    targetScore: targetScore.value,
    examDate: examDate.value,
    currentStage: currentStage.value
  });
  profileDraft.value = draft;
  profileDraftOriginal.value = { ...draft };
  avatarDraftDataUrl.value = "";
  avatarDraftName.value = "";
  avatarUploadError.value = "";
  profileSaveError.value = "";
  profileModalOpen.value = true;
}

function openFavorites() {
  router.push("/rts/favorites");
}

function openCommonContent() {
  router.push("/home#quick");
}

async function handleLogout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await authStore.logout();
    router.replace("/auth");
  } catch (error) {
    console.error("Logout failed:", error);
    uiStore.showToast("退出登录失败，请稍后重试", "warning");
  } finally {
    loggingOut.value = false;
  }
}

function showLoginRecordsNotice() {
  if (loginEventsSnapshot.value.source === "missing_table") {
    uiStore.showToast("登录记录表尚未创建，请先执行 user_login_events SQL。", "warning");
    return;
  }
  if (loginEventsSnapshot.value.source === "error") {
    uiStore.showToast("登录记录同步失败，请稍后重试。", "warning");
    return;
  }
  uiStore.showToast("当前仅保留最近 5 条真实登录记录。", "info");
}

function triggerAvatarPicker() {
  if (avatarUploading.value || profileSaving.value) return;
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

  if (!PROFILE_AVATAR_ACCEPTED_TYPES.has(String(file.type || "").toLowerCase())) {
    avatarUploadError.value = "请选择 JPG、PNG 或 WebP 图片";
    uiStore.showToast(avatarUploadError.value, "warning");
    return;
  }

  if (Number(file.size || 0) > PROFILE_AVATAR_MAX_BYTES) {
    avatarUploadError.value = "图片不能超过 2MB";
    uiStore.showToast(avatarUploadError.value, "warning");
    return;
  }

  avatarUploading.value = true;
  try {
    const avatarDataUrl = await createAvatarDataUrl(file);
    avatarDraftDataUrl.value = avatarDataUrl;
    avatarDraftName.value = normalizeText(file.name);
  } catch (error) {
    console.error("Avatar upload failed:", error);
    avatarUploadError.value = "头像处理失败，请稍后重试";
    uiStore.showToast(avatarUploadError.value, "warning");
  } finally {
    avatarUploading.value = false;
  }
}

function closeProfileModal() {
  if (profileSaving.value) return;
  profileModalOpen.value = false;
  profileSaveError.value = "";
  avatarUploadError.value = "";
}

function handleProfileOverlayClick(event) {
  if (event.target !== event.currentTarget) return;
  closeProfileModal();
}

async function saveProfileDraft() {
  if (profileSaving.value) return;

  const validationError = validateProfileDraft(profileDraft.value, profileDraftOriginal.value);
  if (validationError) {
    profileSaveError.value = validationError;
    return;
  }

  profileSaving.value = true;
  profileSaveError.value = "";
  try {
    const updatePayload = {
      displayName: profileDraft.value.displayName,
      avatarDataUrl: avatarDraftDataUrl.value
    };

    if (profileDraft.value.targetScore !== profileDraftOriginal.value.targetScore) {
      updatePayload.targetScore = profileDraft.value.targetScore;
    }
    if (profileDraft.value.examDate !== profileDraftOriginal.value.examDate) {
      updatePayload.examDate = profileDraft.value.examDate;
    }
    if (profileDraft.value.currentStage !== profileDraftOriginal.value.currentStage) {
      updatePayload.currentStage = profileDraft.value.currentStage;
    }

    await authStore.updateProfileDetails(updatePayload);
    profileModalOpen.value = false;
    avatarDraftDataUrl.value = "";
    avatarDraftName.value = "";
    uiStore.showToast("个人资料已更新", "success");
  } catch (error) {
    console.error("Profile update failed:", error);
    profileSaveError.value = toFriendlyProfileError(error);
  } finally {
    profileSaving.value = false;
  }
}

async function loadProfileSnapshots({ reset = false } = {}) {
  if (profileRefreshPromise) {
    return profileRefreshPromise;
  }

  if (reset) {
    homeAnalytics.value = createEmptyHomeAnalytics();
    favoritesSnapshot.value = createEmptyFavoritesSnapshot();
    planSnapshot.value = createEmptyPlanSnapshot();
    loginEventsSnapshot.value = createEmptyLoginEventsSnapshot();
    practiceIdentitySnapshot.value = createEmptyPracticeIdentitySnapshot();
  }

  profileRefreshPromise = (async () => {
    await authStore.init();
    if (!authStore.loaded) {
      await authStore.loadStatus();
    }

    const [
      analyticsSnapshot,
      favoriteSummary,
      todayPlan,
      loginEventsSummary,
      practiceIdentitySummary
    ] = await Promise.all([
      loadHomeAnalyticsSnapshotForAuth(authStore),
      loadFavoritesSnapshotForAuth(),
      loadTodayPlanSnapshotForAuth(),
      loadLoginEventsForAuth(authStore),
      loadPracticeIdentitySnapshotForAuth()
    ]);

    homeAnalytics.value = analyticsSnapshot;
    favoritesSnapshot.value = favoriteSummary;
    planSnapshot.value = todayPlan;
    loginEventsSnapshot.value = loginEventsSummary;
    practiceIdentitySnapshot.value = practiceIdentitySummary;
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

async function loadPracticeIdentitySnapshotForAuth() {
  const userId = await resolveCurrentUserId();
  if (!userId) {
    return {
      ...createEmptyPracticeIdentitySnapshot(),
      loading: false,
      source: "auth_missing"
    };
  }

  try {
    const { data, error } = await supabase
      .from("practice_logs")
      .select("id, task_type, created_at, score_json")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(IDENTITY_PRACTICE_LIMIT);

    if (error) throw error;

    return {
      loading: false,
      source: "remote",
      rows: Array.isArray(data) ? data : []
    };
  } catch (error) {
    console.warn("Practice identity snapshot load failed:", error);
    return {
      ...createEmptyPracticeIdentitySnapshot(),
      loading: false,
      source: "error"
    };
  }
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

function createEmptyPracticeIdentitySnapshot() {
  return {
    loading: true,
    source: "loading",
    rows: []
  };
}

function createProfileDraft(seed = {}) {
  return {
    displayName: normalizeText(seed.displayName),
    targetScore: normalizeTargetScoreInput(seed.targetScore),
    examDate: normalizeDateInput(seed.examDate),
    currentStage: normalizeText(seed.currentStage)
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

function formatLoginEventSummary(event) {
  const formatted = formatRelativeDateTime(event?.logged_in_at);
  const deviceText = formatLoginEventFullDevice(event);
  if (formatted && deviceText) return `${formatted} · ${deviceText}`;
  if (formatted) return formatted;
  return deviceText || "暂无记录";
}

function formatLoginEventBrowser(event) {
  const browser = normalizeText(event?.browser);
  return browser && browser !== "Unknown Browser" ? browser : "浏览器未知";
}

function formatLoginEventFullDevice(event) {
  const parts = [];
  const device = formatLoginEventDevice(event);
  const browser = normalizeText(event?.browser);
  if (device && device !== "Unknown Device") parts.push(device);
  if (browser && browser !== "Unknown Browser") parts.push(browser);
  if (parts.length) return parts.join(" · ");

  const legacy = normalizeText(event?.device_label);
  return legacy || "Unknown Device";
}

function formatLastLoginFallback(value) {
  const formatted = formatRelativeDateTime(value);
  if (formatted) return `${formatted} · 设备未记录`;
  return "暂无记录";
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

function buildIdentityPracticeStats(rows) {
  const normalizedRows = normalizePracticeIdentityRows(rows);
  const sevenDayRows = filterRowsWithinDays(normalizedRows, IDENTITY_RECENT_DAYS);
  const recentRows = sevenDayRows.length >= IDENTITY_MIN_ROWS_FOR_PERIOD
    ? sevenDayRows
    : normalizedRows.slice(0, IDENTITY_RECENT_LIMIT);
  const moduleStats = buildModuleStats(recentRows);
  const scoredModules = moduleStats.filter((item) => item.scoredCount > 0);
  const focusModules = scoredModules
    .slice()
    .sort((left, right) =>
      left.averageScore - right.averageScore ||
      right.lowScoreCount - left.lowScoreCount ||
      right.count - left.count
    )
    .slice(0, 3)
    .map((item) => item.taskType);
  const recentPracticeModules = moduleStats
    .slice()
    .sort((left, right) => right.count - left.count || left.lastIndex - right.lastIndex)
    .slice(0, 3)
    .map((item) => item.taskType);
  const weeklyDurationMinutes = sumPracticeDurationMinutes(sevenDayRows);
  const weeklyPracticeCount = sevenDayRows.length;
  const averageScore = calculatePracticeAverageScore(recentRows);

  return {
    rows: normalizedRows,
    sevenDayRows,
    recentRows,
    focusModules,
    recentPracticeModules,
    averageDailyMinutes: weeklyDurationMinutes > 0 ? Math.max(1, Math.round(weeklyDurationMinutes / 7)) : 0,
    estimatedDailyMinutes: weeklyDurationMinutes > 0 || weeklyPracticeCount <= 0
      ? 0
      : Math.max(1, Math.round((weeklyPracticeCount * IDENTITY_ESTIMATED_MINUTES_PER_PRACTICE) / 7)),
    bestStudyWindow: resolveBestStudyWindow(recentRows),
    averageScore,
    weakModuleCount: scoredModules.filter((item) => item.averageScore < 65).length
  };
}

function normalizePracticeIdentityRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const createdAt = new Date(row?.created_at);
      return {
        ...row,
        taskType: normalizeTaskType(row?.task_type),
        createdAt,
        score: resolvePracticeScore(row),
        durationMinutes: resolvePracticeDurationMinutes(row)
      };
    })
    .filter((row) => row.taskType && Number.isFinite(row.createdAt.getTime()))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function filterRowsWithinDays(rows, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, Number(days || 1)));
  return (Array.isArray(rows) ? rows : []).filter((row) => row.createdAt >= cutoff);
}

function buildModuleStats(rows) {
  const stats = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    if (!row.taskType) return;
    const current = stats.get(row.taskType) || {
      taskType: row.taskType,
      count: 0,
      scoredCount: 0,
      scoreTotal: 0,
      averageScore: 0,
      lowScoreCount: 0,
      lastIndex: index
    };
    current.count += 1;
    current.lastIndex = Math.min(current.lastIndex, index);
    if (row.score !== null) {
      current.scoredCount += 1;
      current.scoreTotal += row.score;
      if (row.score < 65) current.lowScoreCount += 1;
    }
    stats.set(row.taskType, current);
  });

  return [...stats.values()].map((item) => ({
    ...item,
    averageScore: item.scoredCount ? item.scoreTotal / item.scoredCount : 0
  }));
}

function calculatePracticeAverageScore(rows) {
  const scores = (Array.isArray(rows) ? rows : [])
    .map((row) => row.score)
    .filter((score) => score !== null);
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

function sumPracticeDurationMinutes(rows) {
  return (Array.isArray(rows) ? rows : [])
    .reduce((sum, row) => sum + Number(row?.durationMinutes || 0), 0);
}

function resolvePracticeScore(row) {
  const score = toPlainObject(row?.score_json) || {};
  const candidates = [
    score?.overall,
    score?.score_overall,
    score?.overall_score,
    score?.overall_estimated,
    score?.total_score,
    score?.final_score,
    score?.score,
    score?.estimated_score,
    score?.scores?.overall,
    score?.display_scores?.overall,
    score?.diagnostics?.display_scores?.overall,
    score?.ai_review?.display_scores?.overall,
    score?.ai_review?.diagnostics?.display_scores?.overall,
    score?.ai_review?.overall,
    score?.ai_review?.product?.overall,
    score?.product?.overall,
    score?.result?.overall,
    score?.result?.overall_score,
    score?.feedback?.overall,
    score?.feedback?.overall_score
  ];

  for (const candidate of candidates) {
    const normalized = normalizePracticeScore(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function resolvePracticeDurationMinutes(row) {
  const score = toPlainObject(row?.score_json) || {};
  const secondCandidates = [
    score?.analytics?.total_active_sec,
    score?.analytics?.totalActiveSec,
    score?.duration_sec,
    score?.durationSec,
    score?.duration_seconds,
    score?.durationSeconds,
    score?.time_spent_sec,
    score?.timeSpentSec,
    score?.time_spent_seconds,
    score?.timeSpentSeconds,
    score?.elapsed_sec,
    score?.elapsedSec,
    score?.elapsed_seconds,
    score?.elapsedSeconds,
    score?.metrics?.speech_duration_sec,
    score?.metrics?.speechDurationSec,
    score?.audio_signals?.duration_sec,
    score?.audio_signals?.durationSec,
    score?.recording_duration_sec,
    score?.recordingDurationSec
  ];
  const minuteCandidates = [
    score?.duration_min,
    score?.durationMin,
    score?.duration_minutes,
    score?.durationMinutes,
    score?.time_spent_min,
    score?.timeSpentMin,
    score?.time_spent_minutes,
    score?.timeSpentMinutes,
    score?.minutes
  ];

  for (const candidate of secondCandidates) {
    const minutes = normalizeDurationMinutes(Number(candidate) / 60);
    if (minutes > 0) return minutes;
  }
  for (const candidate of minuteCandidates) {
    const minutes = normalizeDurationMinutes(candidate);
    if (minutes > 0) return minutes;
  }

  const durationMs = Number(score?.audio_signals?.duration_ms ?? score?.audio_signals?.durationMs);
  if (Number.isFinite(durationMs) && durationMs > 0) {
    return normalizeDurationMinutes(durationMs / 60000);
  }
  return 0;
}

function resolveBestStudyWindow(rows) {
  if (!Array.isArray(rows) || rows.length < IDENTITY_MIN_ROWS_FOR_PERIOD) return "";
  const windows = {
    morning: { label: "早上 06:00-12:00", count: 0 },
    afternoon: { label: "下午 12:00-18:00", count: 0 },
    evening: { label: "晚上 18:00-24:00", count: 0 },
    late: { label: "深夜 00:00-06:00", count: 0 }
  };

  rows.forEach((row) => {
    const hour = row.createdAt.getHours();
    if (hour >= 6 && hour < 12) {
      windows.morning.count += 1;
    } else if (hour >= 12 && hour < 18) {
      windows.afternoon.count += 1;
    } else if (hour >= 18 && hour < 24) {
      windows.evening.count += 1;
    } else {
      windows.late.count += 1;
    }
  });

  const best = Object.values(windows).sort((left, right) => right.count - left.count)[0];
  return best?.count > 0 ? best.label : "";
}

function parseTargetScoreNumber(value) {
  const numeric = Number(normalizeText(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function normalizePracticeScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(0, Math.min(90, numeric));
}

function normalizeDurationMinutes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.min(IDENTITY_MAX_DURATION_MINUTES, numeric);
}

function toPlainObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return isPlainObject(value) ? value : null;
}

function normalizeTargetScoreInput(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const numeric = Number(normalized.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return `${Math.max(10, Math.min(90, Math.round(numeric)))}`;
}

function normalizeDateInput(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function validateProfileDraft(draft, original = {}) {
  if (!normalizeText(draft?.displayName)) return "请输入昵称/用户名";

  const targetText = normalizeText(draft?.targetScore);
  const target = Number(targetText);
  if (!targetText && normalizeText(original?.targetScore)) {
    return "目标分数不能为空";
  }
  if (targetText && (!Number.isFinite(target) || target < 10 || target > 90)) {
    return "目标分数请输入 10 到 90 之间的数字";
  }

  if (normalizeText(draft?.examDate)) {
    const date = new Date(`${draft.examDate}T00:00:00`);
    if (!Number.isFinite(date.getTime())) return "请选择有效的考试日期";
    if (draft.examDate < getLocalDateKey()) return "考试日期不能早于今天";
  }

  return "";
}

function toFriendlyProfileError(error) {
  const message = normalizeText(error?.message);
  if (/schema cache|column .* does not exist|could not find .* column/i.test(message)) {
    return "当前资料字段还未在数据库启用，已保留其它可保存内容。";
  }
  if (/permission|policy|rls|row-level|not authorized|401|403/i.test(message)) {
    return "当前账号暂时没有更新权限，请重新登录后再试。";
  }
  if (/jwt|token|session|auth/i.test(message)) {
    return "登录状态已过期，请重新登录后再试。";
  }
  return "保存失败，请稍后重试。";
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
          <button class="logout-btn" type="button" :disabled="loggingOut" @click="handleLogout">
            {{ loggingOut ? "退出中..." : "退出登录" }}
          </button>
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
                    :disabled="avatarUploading || profileSaving"
                    aria-label="更换头像"
                    @click="handleEditProfile"
                  >
                    <img v-if="userAvatarUrl" :src="userAvatarUrl" alt="头像" />
                    <span v-else>{{ userInitial }}</span>
                  </button>
                  <input
                    ref="avatarInputRef"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    class="avatar-input"
                    @change="handleAvatarFileChange"
                  />
                  <div class="profile-name">
                    {{ userDisplayName }}
                    <button type="button" class="icon-edit" aria-label="编辑个人资料" @click="handleEditProfile">✎</button>
                  </div>
                  <div class="profile-vip">♛ {{ membershipPill.label }}</div>
                  <div v-if="avatarUploadError" class="avatar-error">{{ avatarUploadError }}</div>
                </div>

                <div class="profile-info">
                  <div v-for="row in profileInfoRows" :key="row.label" class="info-row">
                    <span class="row-label">
                      <i class="row-icon" v-html="profileInfoIconMap[row.icon]"></i>
                      {{ row.label }}
                    </span>
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

              <div class="auto-config-note">根据练习数据自动更新</div>
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
                <div class="section-mini-title">最近登录设备（{{ devices.length }}）</div>
                <div v-for="item in devices" :key="item.id" class="device-row">
                  <span class="device-image-wrap">
                    <img :src="item.icon" :alt="`${item.name} 设备图标`" class="device-image" />
                  </span>
                  <div class="device-copy">
                    <strong>{{ item.name }}</strong>
                    <p>{{ item.meta }}</p>
                  </div>
                  <span :class="item.current ? 'current-device' : 'device-time'">{{ item.status }}</span>
                </div>
                <div v-if="!devices.length" class="empty-login-state">
                  暂无真实登录设备记录
                </div>
              </div>

              <div class="device-panel login-panel">
                <div class="section-mini-title">近期登录记录</div>
                <div v-for="item in loginRecords" :key="item.id" class="login-row">
                  <span class="device-image-wrap small">
                    <img :src="item.icon" :alt="`${item.device} 设备图标`" class="device-image" />
                  </span>
                  <div class="device-copy">
                    <strong>{{ item.device }}</strong>
                    <p>{{ item.browser }}</p>
                  </div>
                  <em :class="{ online: item.online }">{{ item.status }}</em>
                </div>
                <div v-if="!loginRecords.length" class="empty-login-state">
                  暂无真实登录记录
                </div>
                <button class="link-btn" type="button" @click="showLoginRecordsNotice">查看全部登录记录 →</button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </section>

    <Teleport to="body">
      <div
        v-if="profileModalOpen"
        class="profile-modal-overlay"
        role="presentation"
        @click="handleProfileOverlayClick"
      >
        <section class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
          <header class="profile-modal-head">
            <div>
              <p>PERSONAL PROFILE</p>
              <h2 id="profile-edit-title">编辑个人资料</h2>
            </div>
            <button type="button" class="profile-modal-close" aria-label="关闭编辑个人资料" @click="closeProfileModal">
              ×
            </button>
          </header>

          <div class="profile-modal-body">
            <div class="profile-edit-avatar">
              <button
                type="button"
                class="profile-edit-avatar-btn"
                :disabled="avatarUploading || profileSaving"
                @click="triggerAvatarPicker"
              >
                <img v-if="modalAvatarPreview" :src="modalAvatarPreview" alt="头像预览" />
                <span v-else>{{ userInitial }}</span>
              </button>
              <div>
                <button
                  type="button"
                  class="profile-edit-upload"
                  :disabled="avatarUploading || profileSaving"
                  @click="triggerAvatarPicker"
                >
                  {{ avatarUploading ? "处理中..." : "更换头像" }}
                </button>
                <p>{{ avatarDraftName || "JPG / PNG / WebP，2MB 以内" }}</p>
                <p v-if="avatarUploadError" class="profile-modal-error">{{ avatarUploadError }}</p>
              </div>
            </div>

            <label class="profile-edit-field">
              <span>昵称/用户名</span>
              <input
                v-model.trim="profileDraft.displayName"
                type="text"
                maxlength="32"
                autocomplete="nickname"
                :disabled="profileSaving"
              />
            </label>

            <div class="profile-edit-grid">
              <label class="profile-edit-field">
                <span>目标分数</span>
                <input
                  v-model="profileDraft.targetScore"
                  type="number"
                  min="10"
                  max="90"
                  step="1"
                  :disabled="profileSaving"
                />
              </label>

              <label class="profile-edit-field">
                <span>考试日期</span>
                <input v-model="profileDraft.examDate" type="date" :min="todayDateKey" :disabled="profileSaving" />
              </label>
            </div>

            <label class="profile-edit-field">
              <span>当前阶段</span>
              <select v-model="profileDraft.currentStage" :disabled="profileSaving">
                <option v-for="stage in stageOptions" :key="stage" :value="stage">{{ stage }}</option>
              </select>
            </label>

            <div class="profile-locked-fields" aria-label="不可修改资料">
              <label class="profile-edit-field profile-edit-field--locked">
                <span>邮箱</span>
                <input :value="userEmail || '邮箱未绑定'" type="text" disabled />
              </label>
              <label class="profile-edit-field profile-edit-field--locked">
                <span>VIP 权限/套餐状态</span>
                <input :value="membershipPill.label" type="text" disabled />
              </label>
            </div>

            <p v-if="profileSaveError" class="profile-modal-error" role="alert">{{ profileSaveError }}</p>
          </div>

          <footer class="profile-modal-actions">
            <button type="button" class="profile-modal-secondary" :disabled="profileSaving" @click="closeProfileModal">
              取消
            </button>
            <button type="button" class="profile-modal-primary" :disabled="profileSaving" @click="saveProfileDraft">
              {{ profileSaving ? "保存中..." : "保存" }}
            </button>
          </footer>
        </section>
      </div>
    </Teleport>
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

.logout-btn {
  min-height: 28px;
  padding: 0 12px;
  border: 1px solid #d9cdbb;
  border-radius: 8px;
  background: rgba(246, 241, 232, 0.82);
  color: #76563a;
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.logout-btn:hover:not(:disabled) {
  border-color: #b99f80;
  color: #5f3f27;
}

.logout-btn:disabled {
  cursor: not-allowed;
  opacity: 0.62;
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

.row-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  display: inline-grid;
  place-items: center;
  border: 1px solid rgba(154, 113, 73, 0.24);
  border-radius: 8px;
  background: rgba(154, 113, 73, 0.08);
  color: #8a6744;
}

.row-icon :deep(svg) {
  width: 15px;
  height: 15px;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
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

.profile-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(40, 29, 18, 0.38);
  backdrop-filter: blur(9px);
}

.profile-modal {
  width: min(560px, calc(100vw - 36px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  border: 1px solid rgba(199, 180, 153, 0.9);
  border-radius: 18px;
  background: rgba(250, 246, 239, 0.94);
  box-shadow: 0 24px 70px rgba(53, 35, 18, 0.28);
  color: #2b2119;
}

.profile-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px 24px 14px;
  border-bottom: 1px solid rgba(216, 204, 187, 0.8);
}

.profile-modal-head p {
  margin: 0 0 5px;
  color: #9a8f80;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.profile-modal-head h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
}

.profile-modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid #d9cdbb;
  border-radius: 10px;
  background: rgba(246, 241, 232, 0.78);
  color: #7c5c3e;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.profile-modal-body {
  padding: 18px 24px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.profile-edit-avatar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 15px;
  padding: 14px;
  border: 1px solid rgba(216, 204, 187, 0.8);
  border-radius: 14px;
  background: rgba(255, 252, 247, 0.54);
}

.profile-edit-avatar-btn {
  width: 72px;
  height: 72px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 50%;
  background: #9a7149;
  color: #fff8ee;
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 900;
  box-shadow: 0 10px 24px rgba(120, 82, 45, 0.24);
}

.profile-edit-avatar-btn img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-edit-avatar-btn:disabled,
.profile-edit-upload:disabled,
.profile-modal-primary:disabled,
.profile-modal-secondary:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.profile-edit-upload {
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid #cbbba2;
  border-radius: 9px;
  background: rgba(246, 241, 232, 0.86);
  color: #6f4d30;
  cursor: pointer;
  font-weight: 800;
}

.profile-edit-avatar p {
  margin: 7px 0 0;
  color: #8f8477;
  font-size: 12px;
}

.profile-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.profile-edit-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}

.profile-edit-field span {
  color: #6e5840;
  font-size: 12px;
  font-weight: 900;
}

.profile-edit-field input,
.profile-edit-field select {
  width: 100%;
  min-height: 40px;
  border: 1px solid #d2c4ae;
  border-radius: 10px;
  background: rgba(255, 252, 247, 0.82);
  color: #2b2119;
  font: 700 14px/1.2 inherit;
  outline: none;
  padding: 0 12px;
}

.profile-edit-field input:focus,
.profile-edit-field select:focus {
  border-color: #8a6744;
  box-shadow: 0 0 0 3px rgba(124, 92, 62, 0.12);
}

.profile-edit-field--locked input {
  background: rgba(234, 226, 215, 0.58);
  color: #7d7268;
  cursor: not-allowed;
}

.profile-locked-fields {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 2px;
  padding-top: 12px;
  border-top: 1px solid rgba(216, 204, 187, 0.82);
}

.profile-modal-error {
  margin: 0;
  color: #b42318;
  font-size: 12px;
  font-weight: 800;
}

.profile-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px 22px;
}

.profile-modal-primary,
.profile-modal-secondary {
  min-width: 112px;
  min-height: 39px;
  border-radius: 10px;
  cursor: pointer;
  font: 900 14px/1 inherit;
}

.profile-modal-primary {
  border: 0;
  background: linear-gradient(180deg, #8a6744 0%, #755335 100%);
  color: #fff8ee;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.profile-modal-secondary {
  border: 1px solid #d9cdbb;
  background: rgba(246, 241, 232, 0.82);
  color: #6f4d30;
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
  grid-template-columns: 1fr;
  align-items: center;
  gap: 9px;
}

.charge-btn {
  width: 100%;
  min-height: 40px;
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

.auto-config-note {
  width: calc(100% - 118px);
  margin: auto auto 9px;
  min-height: 31px;
  border: 1px solid #d9cdbb;
  border-radius: 8px;
  background: rgba(246, 241, 232, 0.56);
  color: #8a7259;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0;
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
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #e4dacd;
}

.device-row:last-child {
  border-bottom: 0;
}

.device-image-wrap {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(196, 180, 156, 0.72);
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: rgba(250, 246, 239, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.58);
}

.device-image-wrap.small {
  width: 32px;
  height: 32px;
}

.device-image {
  width: 26px;
  height: 26px;
  display: block;
  object-fit: contain;
}

.device-image-wrap.small .device-image {
  width: 24px;
  height: 24px;
}

.device-copy {
  min-width: 0;
}

.device-copy strong,
.login-row strong {
  display: block;
  color: #2f2720;
  font-size: 13px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-copy p {
  margin: 3px 0 0;
  color: #8a8075;
  font-size: 12px;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  min-height: 42px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
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

.empty-login-state {
  display: flex;
  min-height: 42px;
  align-items: center;
  color: #8a8075;
  font-size: 12px;
  font-weight: 700;
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

@media (max-width: 640px) {
  .profile-modal-overlay {
    padding: 16px;
    align-items: center;
  }

  .profile-modal {
    width: calc(100vw - 28px);
  }

  .profile-modal-head,
  .profile-modal-body,
  .profile-modal-actions {
    padding-left: 18px;
    padding-right: 18px;
  }

  .profile-edit-grid {
    grid-template-columns: 1fr;
  }
}
</style>

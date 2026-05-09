<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { BILLING_PAUSED, BILLING_PAUSED_MESSAGE } from "@/lib/billing";
import { classifyDeviceFamily, getDeviceIconSource } from "@/lib/device-icons";
import {
  createEmptyHomeAnalytics,
  formatInteger,
  loadHomeAnalyticsSnapshotForAuth
} from "@/lib/home-analytics";
import {
  createEmptyLoginEventsSnapshot,
  detectLoginEventDevice,
  formatLoginEventMeta,
  loadLoginEventsForAuth
} from "@/lib/login-events";
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
const loginEventsSnapshot = ref(createEmptyLoginEventsSnapshot());
const profileProgress = ref(createEmptyProfileProgress());
const favoritesSnapshot = ref(createEmptyFavoritesSnapshot());
const planSnapshot = ref(createEmptyPlanSnapshot());
const avatarInputRef = ref(null);
const avatarUploading = ref(false);
const avatarUploadError = ref("");
const profileModalOpen = ref(false);
const profileSaving = ref(false);
const profileSaveError = ref("");
const profileDraft = ref(createEmptyProfileDraft());
const todayDateKey = ref(getLocalDateKey());
const logoutPending = ref(false);
let profileRefreshPromise = null;

const profileStageOptions = ["基础巩固", "稳步提分", "冲刺提升"];
const defaultProfileStage = profileStageOptions[0];
const targetScoreMin = 10;
const targetScoreMax = 90;
const defaultTargetScore = 50;

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
  if (city && country) return `${city}, ${country}`;
  return city || country || "未设置";
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
    ) || defaultTargetScore
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
  normalizeStageValue(
    pickText(
      profile.value?.current_stage,
      profile.value?.currentStage,
      profile.value?.stage,
      profile.value?.learning_stage,
      authStore.user?.user_metadata?.current_stage
    )
  ) || inferStageFromScore() || defaultProfileStage
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

const profileInfoIconMap = {
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.6"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>',
  stage:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  mail:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 8 7.8 5.2a2.2 2.2 0 0 0 2.4 0L21 8"/></svg>'
};

const accountStatusIconMap = {
  summary:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h7"/><path d="M9 12h7"/><path d="M9 19h5"/><path d="M5 5h.01"/><path d="M5 12h.01"/><path d="M5 19h.01"/></svg>',
  login:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v4l3 2"/><path d="M3.05 11a9 9 0 1 1 2.64 6.36"/><path d="M3 17h3v-3"/></svg>',
  status:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 2.9 8 7 10 4.1-2 7-5.6 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></svg>',
  time:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12"/><path d="M6 21h12"/><path d="M7 3c0 4 5 5 5 9s-5 5-5 9"/><path d="M17 3c0 4-5 5-5 9s5 5 5 9"/></svg>',
  memory:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6a3 3 0 0 1 5.4-1.8A3.7 3.7 0 0 1 19 7.4a3.2 3.2 0 0 1-.7 5.8A3.7 3.7 0 0 1 15 20a3 3 0 0 1-3-2 3 3 0 0 1-3 2 3.7 3.7 0 0 1-3.3-6.8A3.2 3.2 0 0 1 5 7.4 3.7 3.7 0 0 1 8 6Z"/><path d="M12 6v12"/><path d="M8.5 10H12"/><path d="M12 14h3.5"/></svg>',
  plan:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 6h10"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="m4 6 1 1 2-2"/><path d="m4 12 1 1 2-2"/><path d="m4 18 1 1 2-2"/></svg>'
};

const identityIconMap = {
  summary:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4 7l8 4 8-4-8-4Z"/><path d="m4 11 8 4 8-4"/><path d="m4 15 8 4 8-4"/></svg>',
  score:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21a9 9 0 1 0-9-9"/><path d="M12 17a5 5 0 1 0-5-5"/><path d="M12 13a1 1 0 1 0-1-1"/><path d="m15 9 5-5"/><path d="M16 4h4v4"/></svg>',
  modules:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
  duration:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 2h6"/></svg>',
  window:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
  ai:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="m5.6 5.6 2.1 2.1"/><path d="m16.3 16.3 2.1 2.1"/><path d="m18.4 5.6-2.1 2.1"/><path d="m7.7 16.3-2.1 2.1"/><path d="M9.5 12a2.5 2.5 0 0 1 5 0c0 1.4-1.2 2.2-2.5 3-1.3-.8-2.5-1.6-2.5-3Z"/></svg>'
};

const favoriteIconMap = {
  ra:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><path d="M12 19v3"/></svg>',
  rs:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 8h8a4 4 0 0 1 0 8H9"/><path d="m11 12-4 4 4 4"/><path d="M5 8h2"/><path d="M3 5h4"/></svg>',
  rl:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19h16"/><path d="M7 19V9a5 5 0 0 1 10 0v10"/><path d="M9 10h6"/><path d="M12 3v3"/></svg>',
  wfd:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><path d="M5 13h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2Z"/><path d="M19 13h-3v6h3a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2Z"/></svg>',
  we:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 4 4 4-10 10H6v-4L16 4Z"/><path d="m14 6 4 4"/><path d="M4 20h16"/></svg>',
  di:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-4.2-4.2a2 2 0 0 0-2.8 0L7 18"/></svg>',
  rts:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.5 18.5 4 21v-5.5A7.5 7.5 0 0 1 11.5 8h1A7.5 7.5 0 0 1 20 15.5 7.5 7.5 0 0 1 12.5 23h-1a7.4 7.4 0 0 1-4-1.2"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>'
};

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

const latestLoginEvent = computed(() => {
  const rows = Array.isArray(loginEventsSnapshot.value.rows) ? loginEventsSnapshot.value.rows : [];
  return rows[0] || null;
});

const accountStatusRows = computed(() => [
  {
    label: "最近一次登录",
    value: formatLatestLoginText(),
    icon: "login",
    color: "purple"
  },
  {
    label: "考员状态",
    value: buildVipStatusText(),
    icon: "status",
    color: "gold"
  },
  {
    label: "做题时长/天数",
    value: buildPracticeTimeText(),
    icon: "time",
    color: "green"
  },
  {
    label: "AI 私教记忆",
    value: buildAgentMemoryText(),
    icon: "memory",
    color: "blue"
  },
  {
    label: "今日计划状态",
    value: buildPlanStatusText(),
    icon: "plan",
    color: "teal"
  }
]);

const identityConfig = computed(() => [
  { label: "目标分数", value: targetScore.value, icon: "score", color: "blue" },
  { label: "重点模块", value: focusModules.value, icon: "modules", color: "purple" },
  { label: "每日学习时长", value: dailyStudyTime.value, icon: "duration", color: "cyan" },
  { label: "最佳时段", value: bestStudyWindow.value, icon: "window", color: "gold" },
  { label: "AI 建议强度", value: aiIntensity.value, icon: "ai", color: "red" }
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
  const counts = summary.countsByTask || {};

  return favoriteTaskTypes.map((item) => ({
    ...item,
    count: Number(counts[item.type] || 0)
  }));
});

const favoriteTotalCount = computed(() => Number(favoritesSnapshot.value.totalCount || 0));

const favoriteSummaryText = computed(() => {
  if (favoritesSnapshot.value.loading) return "正在同步你的重点题目。";
  if (favoritesSnapshot.value.source === "error") return "收藏暂时同步失败，可以先进入题库继续练习。";
  if (favoriteTotalCount.value > 0) {
    return `已整理 ${formatInteger(favoriteTotalCount.value)} 个重点内容，适合考前集中复习。`;
  }
  return "把高频题、易错题和需要回看的题收藏起来，这里会成为你的复习清单。";
});

const favoriteTaskTypes = [
  { type: "RA", label: "RA 朗读", hint: "朗读题", icon: "ra", color: "blue" },
  { type: "RS", label: "RS 复述", hint: "复述句子", icon: "rs", color: "purple" },
  { type: "RL", label: "RL 讲座", hint: "复述讲座", icon: "rl", color: "green" },
  { type: "WFD", label: "WFD 听写", hint: "听写句子", icon: "wfd", color: "cyan" },
  { type: "WE", label: "WE 作文", hint: "写作题", icon: "we", color: "gold" },
  { type: "DI", label: "DI 图片", hint: "图片描述", icon: "di", color: "indigo" },
  { type: "RTS", label: "RTS 情景", hint: "情景回应", icon: "rts", color: "orange" }
];

const devices = computed(() => {
  const current = detectCurrentDevice();
  return [
    {
      icon: getDeviceIconSource(current),
      name: current.name,
      meta: current.meta,
      time: "正在使用",
      status: "当前设备",
      current: true
    }
  ];
});

const loginRecords = computed(() => {
  const rows = Array.isArray(loginEventsSnapshot.value.rows) ? loginEventsSnapshot.value.rows : [];
  const current = detectCurrentDevice();
  const currentRecordIndex = rows.findIndex((row) => doesLoginRecordMatchCurrentDevice(row, current));

  return rows.slice(0, 5).map((row, index) => ({
    icon: getDeviceIconSource(row),
    device: row.device_label || "设备未记录",
    meta: formatLoginEventMeta(row),
    time: formatRelativeDateTime(row.created_at) || "时间未记录",
    current: index === currentRecordIndex,
    status: index === currentRecordIndex ? "当前设备" : ""
  }));
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

function openEditProfileModal(event) {
  event?.stopPropagation?.();
  todayDateKey.value = getLocalDateKey();
  profileDraft.value = createProfileDraftFromCurrentUser();
  profileSaveError.value = "";
  profileModalOpen.value = true;
}

function closeEditProfileModal() {
  if (profileSaving.value) return;
  profileModalOpen.value = false;
  profileSaveError.value = "";
}

async function handleLogout() {
  if (logoutPending.value) return;
  logoutPending.value = true;

  try {
    await authStore.logout();
    uiStore.showToast("已退出登录", "success");
    await router.replace("/auth");
  } catch (error) {
    console.error("Logout failed:", error);
    uiStore.showToast(error?.message || "退出登录失败，请稍后重试", "warning");
  } finally {
    logoutPending.value = false;
  }
}

async function saveProfileDraft() {
  if (profileSaving.value) return;

  const userId = normalizeText(authStore.user?.id);
  if (!userId) {
    profileSaveError.value = "请先登录后再保存资料";
    uiStore.showToast(profileSaveError.value, "warning");
    return;
  }

  const normalizedDraft = normalizeProfileDraft(profileDraft.value);
  const validationError = validateProfileDraft(normalizedDraft);
  if (validationError) {
    profileSaveError.value = validationError;
    uiStore.showToast(validationError, "warning");
    return;
  }

  profileSaving.value = true;
  profileSaveError.value = "";

  try {
    const currentMeta =
      authStore.user?.user_metadata && typeof authStore.user.user_metadata === "object"
        ? authStore.user.user_metadata
        : {};

    const { data, error } = await supabase.auth.updateUser({
      data: {
        ...currentMeta,
        display_name: normalizedDraft.display_name,
        username: normalizedDraft.display_name,
        city: normalizedDraft.city,
        country: normalizedDraft.country,
        target_score: normalizedDraft.target_score,
        exam_date: normalizedDraft.exam_date,
        current_stage: normalizedDraft.current_stage,
        profile_updated_at: new Date().toISOString()
      }
    });

    if (error) throw error;
    applyUpdatedAuthUser(data?.user);

    const profilePatch = buildExistingProfilePatch(normalizedDraft);
    if (Object.keys(profilePatch).length) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update(profilePatch)
        .eq("id", userId);

      if (profileError) throw profileError;
    }

    authStore.profile = {
      ...(authStore.profile || {}),
      display_name: normalizedDraft.display_name,
      city: normalizedDraft.city,
      country: normalizedDraft.country,
      target_score: normalizedDraft.target_score,
      exam_date: normalizedDraft.exam_date,
      current_stage: normalizedDraft.current_stage
    };

    profileDraft.value = normalizedDraft;
    profileModalOpen.value = false;
    uiStore.showToast("个人资料已保存", "success");
  } catch (error) {
    console.error("Profile save failed:", error);
    profileSaveError.value = error?.message || "保存失败，请稍后重试";
    uiStore.showToast(profileSaveError.value, "warning");
  } finally {
    profileSaving.value = false;
  }
}

function showLoginRecordsNotice() {
  if (loginEventsSnapshot.value.loading) {
    uiStore.showToast("正在同步最近 5 条登录记录", "info");
    return;
  }

  if (loginEventsSnapshot.value.source === "table_missing") {
    uiStore.showToast("登录记录表未配置，当前暂无真实记录", "info");
    return;
  }

  if (loginEventsSnapshot.value.source === "error") {
    uiStore.showToast("登录记录同步失败，请稍后重试", "warning");
    return;
  }

  uiStore.showToast("当前仅展示数据库保存的最近 5 条登录记录", "info");
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

function createEmptyProfileDraft() {
  return {
    display_name: "",
    city: "",
    country: "",
    target_score: "",
    exam_date: "",
    current_stage: ""
  };
}

function createProfileDraftFromCurrentUser() {
  return normalizeProfileDraft({
    display_name: userDisplayName.value,
    city: pickText(
      profile.value?.city,
      profile.value?.location_city,
      profile.value?.study_city,
      authStore.user?.user_metadata?.city
    ),
    country: pickText(
      profile.value?.country,
      profile.value?.region,
      profile.value?.location_country,
      authStore.user?.user_metadata?.country
    ),
    target_score: targetScore.value,
    exam_date: examDate.value,
    current_stage: currentStage.value
  });
}

function normalizeProfileDraft(draft) {
  return {
    display_name: normalizeText(draft?.display_name),
    city: normalizeText(draft?.city),
    country: normalizeText(draft?.country),
    target_score: formatTargetScore(draft?.target_score || defaultTargetScore),
    exam_date: formatDateValue(draft?.exam_date, ""),
    current_stage: normalizeStageValue(draft?.current_stage) || inferStageFromScore() || defaultProfileStage
  };
}

function validateProfileDraft(draft) {
  todayDateKey.value = getLocalDateKey();
  if (draft.exam_date && draft.exam_date < todayDateKey.value) {
    return "考试日期不能早于今天";
  }
  if (!profileStageOptions.includes(draft.current_stage)) {
    return "请选择有效的当前阶段";
  }
  return "";
}

function normalizeStageValue(value) {
  const normalized = normalizeText(value);
  return profileStageOptions.includes(normalized) ? normalized : "";
}

function adjustTargetScore(delta) {
  const current = parseTargetScoreNumber(profileDraft.value.target_score);
  profileDraft.value.target_score = String(clampTargetScore(current + delta));
}

function applyUpdatedAuthUser(user) {
  if (!user) return;
  authStore.user = user;
  if (authStore.session) {
    authStore.session = {
      ...authStore.session,
      user
    };
  }
}

function buildExistingProfilePatch(draft) {
  const currentProfile = authStore.profile || {};
  const patch = {};

  assignIfProfileKeyExists(patch, currentProfile, ["display_name", "username", "name", "full_name"], draft.display_name);
  assignIfProfileKeyExists(patch, currentProfile, ["city", "location_city", "study_city"], draft.city);
  assignIfProfileKeyExists(patch, currentProfile, ["country", "region", "location_country"], draft.country);
  assignIfProfileKeyExists(patch, currentProfile, ["target_score", "goal_score", "pte_target_score"], draft.target_score);
  assignIfProfileKeyExists(patch, currentProfile, ["exam_date", "test_date", "target_exam_date"], draft.exam_date || null);
  assignIfProfileKeyExists(patch, currentProfile, ["current_stage", "stage", "learning_stage"], draft.current_stage);

  if (Object.prototype.hasOwnProperty.call(currentProfile, "updated_at")) {
    patch.updated_at = new Date().toISOString();
  }

  return patch;
}

function assignIfProfileKeyExists(patch, currentProfile, keys, value) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(currentProfile, key)) {
      patch[key] = value;
    }
  }
}

async function loadProfileSnapshots({ reset = false } = {}) {
  if (profileRefreshPromise) {
    return profileRefreshPromise;
  }

  if (reset) {
    homeAnalytics.value = createEmptyHomeAnalytics();
    loginEventsSnapshot.value = createEmptyLoginEventsSnapshot();
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
      loginEvents,
      progressSnapshot,
      favoriteSummary,
      todayPlan
    ] = await Promise.all([
      loadHomeAnalyticsSnapshotForAuth(authStore),
      loadLoginEventsForAuth(authStore),
      loadProfileProgressSnapshotForAuth(authStore),
      loadFavoritesSnapshotForAuth(),
      loadTodayPlanSnapshotForAuth()
    ]);

    homeAnalytics.value = analyticsSnapshot;
    loginEventsSnapshot.value = loginEvents;
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

  return buildFavoritesSnapshotFromCounts(readLocalFavoriteCounts(userId), "local_profile_summary");
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
  const taskTypes = favoriteTaskTypes.map((item) => item.type);
  return taskTypes.reduce((counts, taskType) => {
    const key = `kai_kou_${taskType.toLowerCase()}_favorites_${userId}`;
    counts[taskType] = readJsonArrayLengthFromLocalStorage(key);
    return counts;
  }, {});
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
  const device = detectLoginEventDevice();

  if (device.device_label || device.browser || device.os) {
    return {
      device_label: device.device_label,
      browser: device.browser,
      os: device.os,
      name: device.device_label || "当前浏览器设备",
      meta: [device.os, device.browser].filter(Boolean).join(" · ") || "设备信息未记录"
    };
  }

  if (typeof navigator === "undefined") {
    return {
      device_label: "当前浏览器设备",
      browser: "Browser",
      os: "未知系统",
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
  if (isIphone) return { device_label: "iPhone", browser, os: "iOS", name: "iPhone", meta: `iOS · ${browser}` };
  if (isIpad) return { device_label: "iPad", browser, os: "iPadOS", name: "iPad", meta: `iPadOS · ${browser}` };
  if (isAndroid) return { device_label: "Android Phone", browser, os: "Android", name: "Android Phone", meta: `Android · ${browser}` };
  if (isMac) return { device_label: "MacBook Pro 14-inch", browser, os: "macOS", name: "MacBook Pro 14-inch", meta: `macOS · ${browser}` };
  if (isWindows) return { device_label: "Windows PC", browser, os: "Windows", name: "Windows PC", meta: `Windows · ${browser}` };
  return { device_label: "当前浏览器设备", browser, os: "未知系统", name: "当前浏览器设备", meta: browser };
}

function doesLoginRecordMatchCurrentDevice(row, currentDevice) {
  if (!row || !currentDevice) return false;
  const sameFamily = classifyDeviceFamily(row) === classifyDeviceFamily(currentDevice);
  const recordBrowser = normalizeText(row.browser).toLowerCase();
  const currentBrowser = normalizeText(currentDevice.browser).toLowerCase();
  return sameFamily && (!recordBrowser || !currentBrowser || recordBrowser === currentBrowser);
}

function formatLatestLoginText() {
  const event = latestLoginEvent.value;
  if (event) {
    const formatted = formatRelativeDateTime(event.created_at) || "时间未记录";
    return `${formatted} · ${event.device_label || "设备未记录"}`;
  }

  const fallback = formatRelativeDateTime(authStore.user?.last_sign_in_at);
  return fallback ? `${fallback} · 设备未记录` : "暂无登录记录";
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
  return String(clampTargetScore(parseTargetScoreNumber(value)));
}

function parseTargetScoreNumber(value) {
  const normalized = normalizeText(value).replace("+", "");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : defaultTargetScore;
}

function clampTargetScore(value) {
  const rounded = Math.round(Number(value));
  if (!Number.isFinite(rounded)) return defaultTargetScore;
  return Math.min(targetScoreMax, Math.max(targetScoreMin, rounded));
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
          <p>管理您的账号信息、学习身份配置、会员权益与登录记录</p>
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
                    @click.stop="triggerAvatarPicker"
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
                    <button type="button" class="icon-edit" aria-label="编辑个人资料" @click.stop="openEditProfileModal">✎</button>
                  </div>
                  <div class="profile-location">{{ profileLocation }}</div>
                  <div class="profile-vip">♛ {{ membershipPill.label }}</div>
                  <div v-if="avatarUploadError" class="avatar-error">{{ avatarUploadError }}</div>
                </div>

                <div class="profile-info">
                  <div v-for="row in profileInfoRows" :key="row.label" class="info-row">
                    <span class="row-label">
                      <span class="info-row-icon" aria-hidden="true" v-html="profileInfoIconMap[row.icon]"></span>
                      {{ row.label }}
                    </span>
                    <strong v-if="row.strong">{{ row.value }}</strong>
                    <span v-else class="email-value">{{ row.value }}</span>
                    <span v-if="row.badge" class="verified" :class="`verified--${row.badgeTone}`">{{ row.badge }}</span>
                  </div>

                  <div class="profile-actions">
                    <button class="primary-btn profile-btn" type="button" @click.stop="openEditProfileModal">编辑个人资料</button>
                    <button class="logout-btn" type="button" :disabled="logoutPending" @click.stop="handleLogout">
                      {{ logoutPending ? "退出中..." : "退出登录" }}
                    </button>
                  </div>
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

          <div class="dashboard-column summary-column">
            <article class="pc-card status-card">
              <div class="card-title">
                <span class="title-icon title-icon-svg" aria-hidden="true" v-html="accountStatusIconMap.summary"></span>
                <span>账号状态摘要</span>
              </div>

              <div class="status-list">
                <div v-for="item in accountStatusRows" :key="item.label" class="status-row">
                  <span class="soft-icon status-icon" :class="item.color" aria-hidden="true" v-html="accountStatusIconMap[item.icon]"></span>
                  <span class="status-label">{{ item.label }}</span>
                  <span class="status-value">{{ item.value }}</span>
                </div>
              </div>
            </article>

            <article class="pc-card identity-card">
              <div class="card-title">
                <span class="title-icon title-icon-svg" aria-hidden="true" v-html="identityIconMap.summary"></span>
                <span>学习身份配置</span>
              </div>

              <div class="config-list">
                <div v-for="item in identityConfig" :key="item.label" class="config-row">
                  <span class="soft-icon config-icon" :class="item.color" aria-hidden="true" v-html="identityIconMap[item.icon]"></span>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </article>
          </div>

          <article class="pc-card favorites-card">
            <div class="favorite-hero">
              <div class="favorite-heading">
                <span class="favorite-eyebrow">全题型收藏概览</span>
                <h2>我的收藏</h2>
                <p>{{ favoriteSummaryText }}</p>
              </div>
              <div class="favorite-total-pill">
                <strong>{{ formatFavoriteCount(favoriteTotalCount) }}</strong>
                <span>已收藏</span>
              </div>
            </div>

            <div class="favorites-content">
              <div class="favorite-tiles" aria-label="收藏分类">
                <div
                  v-for="item in favorites"
                  :key="item.label"
                  class="favorite-tile"
                >
                  <span class="tile-icon favorite-icon" :class="item.color" aria-hidden="true" v-html="favoriteIconMap[item.icon]"></span>
                  <span class="favorite-tile-copy">
                    <strong>{{ item.label }}</strong>
                    <em>{{ item.hint }}</em>
                  </span>
                  <b>{{ formatFavoriteCount(item.count) }}</b>
                </div>
              </div>
            </div>
          </article>

          <article class="pc-card device-card">
            <div class="card-title">
              <span class="title-icon">▰</span>
              <span>设备与登录记录</span>
            </div>

              <div class="device-layout">
              <div class="device-panel">
                <div class="section-mini-title">当前设备</div>
                <div v-for="item in devices" :key="item.name" class="device-row device-record">
                  <span class="device-image-wrap">
                    <img :src="item.icon" :alt="`${item.name} 设备图标`" class="device-image" />
                  </span>
                  <div class="device-copy">
                    <strong>{{ item.name }}</strong>
                    <p>{{ item.meta }}</p>
                  </div>
                  <div class="device-side">
                    <span class="device-time">{{ item.time }}</span>
                    <span class="current-device">{{ item.status }}</span>
                  </div>
                </div>
              </div>

              <div class="device-panel login-panel">
                <div class="section-mini-title">近期登录记录</div>
                <div v-if="loginEventsSnapshot.loading" class="login-empty">正在同步登录记录...</div>
                <div v-else-if="loginEventsSnapshot.source === 'table_missing'" class="login-empty">登录记录表未配置，暂无真实记录</div>
                <div v-else-if="loginEventsSnapshot.source === 'error'" class="login-empty login-empty--error">登录记录同步失败，请稍后重试</div>
                <div v-else-if="!loginRecords.length" class="login-empty">暂无登录记录</div>
                <template v-else>
                  <div v-for="item in loginRecords" :key="`${item.device}-${item.time}`" class="login-row device-record">
                    <span class="device-image-wrap small">
                      <img :src="item.icon" :alt="`${item.device} 设备图标`" class="device-image" />
                    </span>
                    <div class="device-copy">
                      <strong>{{ item.device }}</strong>
                      <p>{{ item.meta }}</p>
                    </div>
                    <div class="device-side">
                      <em>{{ item.time }}</em>
                      <span v-if="item.current" class="current-device compact">{{ item.status }}</span>
                    </div>
                  </div>
                </template>
                <button class="link-btn" type="button" @click="showLoginRecordsNotice">仅显示最近 5 条登录记录</button>
              </div>
            </div>
          </article>
        </section>
      </main>
    </section>

    <Teleport to="body">
      <div
        v-if="profileModalOpen"
        class="profile-modal-backdrop"
        role="presentation"
        @click.self="closeEditProfileModal"
      >
        <form class="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title" novalidate @submit.prevent="saveProfileDraft">
          <div class="profile-modal-head">
            <div>
              <span>个人资料</span>
              <h2 id="profile-modal-title">编辑个人资料</h2>
            </div>
            <button type="button" class="profile-modal-close" aria-label="关闭编辑个人资料" @click="closeEditProfileModal">×</button>
          </div>

          <div class="profile-modal-grid">
            <label class="profile-field profile-field--full">
              <span>昵称</span>
              <input v-model.trim="profileDraft.display_name" type="text" autocomplete="nickname" placeholder="输入你的昵称" />
            </label>

            <label class="profile-field">
              <span>城市</span>
              <input v-model.trim="profileDraft.city" type="text" autocomplete="address-level2" placeholder="Melbourne" />
            </label>

            <label class="profile-field">
              <span>国家或地区</span>
              <input v-model.trim="profileDraft.country" type="text" autocomplete="country-name" placeholder="Australia" />
            </label>

            <label class="profile-field">
              <span>目标分数</span>
              <div class="score-stepper">
                <input
                  v-model.number="profileDraft.target_score"
                  type="number"
                  inputmode="numeric"
                  :min="targetScoreMin"
                  :max="targetScoreMax"
                  step="1"
                  placeholder="50"
                />
                <div class="score-stepper-actions" aria-label="调整目标分数">
                  <button type="button" class="score-stepper-button score-stepper-button--up" aria-label="提高目标分数" @click="adjustTargetScore(1)"></button>
                  <button type="button" class="score-stepper-button score-stepper-button--down" aria-label="降低目标分数" @click="adjustTargetScore(-1)"></button>
                </div>
              </div>
            </label>

            <label class="profile-field">
              <span>考试日期</span>
              <input v-model="profileDraft.exam_date" type="date" :min="todayDateKey" />
            </label>

            <label class="profile-field profile-field--full">
              <span>当前阶段</span>
              <select v-model="profileDraft.current_stage">
                <option v-for="stage in profileStageOptions" :key="stage" :value="stage">{{ stage }}</option>
              </select>
            </label>
          </div>

          <p v-if="profileSaveError" class="profile-modal-error">{{ profileSaveError }}</p>

          <div class="profile-modal-actions">
            <button type="button" class="ghost-btn modal-action-btn" :disabled="profileSaving" @click="closeEditProfileModal">取消</button>
            <button type="submit" class="primary-btn modal-action-btn" :disabled="profileSaving">
              {{ profileSaving ? "保存中..." : "保存资料" }}
            </button>
          </div>
        </form>
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
  align-items: start;
}

.dashboard-column {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--layout-gap);
  height: 100%;
}

.summary-column {
  align-self: start;
  height: auto;
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

.title-icon-svg {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.title-icon-svg :deep(svg) {
  width: 17px;
  height: 17px;
  stroke-width: 2;
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

.info-row-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  color: #8b633d;
  border: 1px solid rgba(139, 99, 61, 0.2);
  border-radius: 8px;
  background: rgba(139, 99, 61, 0.07);
}

.info-row-icon :deep(svg) {
  width: 15px;
  height: 15px;
  stroke-width: 2.15;
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

.profile-actions {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.profile-btn {
  width: min(226px, 100%);
  align-self: start;
}

.logout-btn {
  min-height: 31px;
  padding: 0 18px;
  border: 1px solid rgba(160, 80, 61, 0.32);
  border-radius: 8px;
  background: rgba(255, 246, 238, 0.72);
  color: #9b3f2d;
  cursor: pointer;
  font-weight: 800;
}

.logout-btn:hover:not(:disabled) {
  border-color: rgba(155, 63, 45, 0.54);
  background: rgba(255, 237, 229, 0.9);
}

.logout-btn:disabled {
  cursor: progress;
  opacity: 0.68;
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

.status-icon {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.52);
}

.status-icon :deep(svg) {
  width: 13px;
  height: 13px;
  stroke-width: 2.15;
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

.membership-footer {
  margin-top: 0;
  padding: 10px 14px 13px;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.charge-btn {
  width: 100%;
  min-height: 42px;
  font-size: 15px;
}

.safe-text {
  color: var(--mute);
  font-size: 12px;
  text-align: center;
}

.identity-card {
  min-height: auto;
  display: flex;
  flex-direction: column;
}

.config-list {
  padding: 12px 14px 15px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.identity-card .config-row {
  min-height: 56px;
  padding: 8px;
  border: 1px solid rgba(217, 205, 187, 0.76);
  border-radius: 8px;
  grid-template-columns: 28px minmax(0, 1fr);
  grid-template-rows: auto auto;
  background: rgba(255, 252, 247, 0.55);
}

.identity-card .soft-icon {
  grid-row: 1 / 3;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  font-size: 13px;
}

.identity-card .config-icon {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}

.identity-card .config-icon :deep(svg) {
  width: 16px;
  height: 16px;
  stroke-width: 2.05;
}

.identity-card .config-row > span:nth-child(2) {
  color: #5c5146;
  font-size: 11px;
  line-height: 1.15;
}

.identity-card .config-row strong {
  color: #2f2720;
  font-size: 13px;
  line-height: 1.18;
}

.favorites-card {
  grid-column: 1 / -1;
  min-height: 188px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.favorite-hero {
  padding: 15px 20px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-bottom: 1px solid rgba(217, 205, 187, 0.78);
  background:
    linear-gradient(135deg, rgba(255, 244, 219, 0.72), rgba(246, 251, 247, 0.58) 52%, rgba(232, 240, 255, 0.48));
}

.favorite-heading {
  min-width: 0;
}

.favorite-eyebrow {
  height: 22px;
  padding: 0 9px;
  border: 1px solid rgba(196, 180, 156, 0.82);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: rgba(255, 252, 247, 0.78);
  color: #7a5b3b;
  font-size: 11px;
  font-weight: 900;
}

.favorite-heading h2 {
  margin: 7px 0 4px;
  color: #241a12;
  font-size: 24px;
  line-height: 1.08;
}

.favorite-heading p {
  margin: 0;
  color: #6f655a;
  font-size: 13px;
}

.favorite-total-pill {
  width: 96px;
  min-height: 62px;
  border: 1px solid rgba(185, 159, 128, 0.72);
  border-radius: 8px;
  display: grid;
  place-items: center;
  align-content: center;
  background: rgba(255, 252, 247, 0.72);
  color: #7a5b3b;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.favorite-total-pill strong {
  color: #241a12;
  font-size: 25px;
  line-height: 1;
}

.favorite-total-pill span {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 900;
}

.favorites-content {
  padding: 14px 16px 16px;
}

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

.favorite-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
  align-items: start;
  gap: 10px;
}

.favorite-tile {
  position: relative;
  min-height: 92px;
  padding: 12px;
  border: 1px solid rgba(217, 205, 187, 0.9);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  background: rgba(255, 252, 247, 0.62);
  color: #2f2720;
  text-align: left;
}

.favorite-tile .tile-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  font-size: 15px;
}

.favorite-tile .favorite-icon {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.52);
}

.favorite-tile .favorite-icon :deep(svg) {
  width: 17px;
  height: 17px;
  stroke-width: 2.05;
}

.favorite-tile-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.favorite-tile-copy strong {
  color: #2b2118;
  font-size: 14px;
}

.favorite-tile-copy em {
  color: #81776b;
  font-size: 11px;
  font-style: normal;
  line-height: 1.25;
}

.favorite-tile b {
  position: absolute;
  top: 12px;
  right: 12px;
  color: #6e5840;
  font-size: 21px;
  line-height: 1;
}

.tile-icon.gold { background: #fff0cf; color: #f5a623; }
.tile-icon.orange { background: #ffe8d6; color: #d06f2a; }
.tile-icon.green { background: #dff0e4; color: #50b86a; }
.tile-icon.blue { background: #e6efff; color: #4f7bee; }
.tile-icon.purple { background: #efe8ff; color: #7c4dff; }
.tile-icon.cyan { background: #e5f7ff; color: #2b9fd8; }
.tile-icon.indigo { background: #e6efff; color: #4f7bee; }

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
  min-height: 126px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-record {
  min-height: 58px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 9px 0;
  border-bottom: 1px solid #e4dacd;
}

.device-record:last-child {
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

.device-side {
  min-width: 72px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.current-device {
  padding: 5px 9px;
  border-radius: 7px;
  background: #dff0e4;
  color: #4c9862;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
}

.current-device.compact {
  padding: 4px 8px;
}

.device-time {
  color: #7f756a;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
}

.login-row {
  font-size: 12px;
  color: #7a7066;
}

.login-row em {
  font-style: normal;
  color: #7a7066;
  text-align: right;
  white-space: nowrap;
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

.profile-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(30, 18, 8, 0.34);
  backdrop-filter: blur(6px);
}

.profile-modal {
  width: min(520px, 100%);
  border: 1px solid rgba(196, 180, 156, 0.92);
  border-radius: 14px;
  background: #faf6ef;
  box-shadow: 0 24px 70px rgba(68, 47, 27, 0.24);
  padding: 22px;
}

.profile-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.profile-modal-head span {
  display: inline-flex;
  height: 24px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid #d9cdbb;
  border-radius: 999px;
  color: #7a5b3b;
  font-size: 12px;
  font-weight: 900;
}

.profile-modal-head h2 {
  margin: 8px 0 0;
  color: #21170e;
  font-size: 24px;
  line-height: 1.1;
}

.profile-modal-close {
  width: 34px;
  height: 34px;
  border: 1px solid #d9cdbb;
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.78);
  color: #7c5c3e;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.profile-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.profile-field {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.profile-field--full {
  grid-column: 1 / -1;
}

.profile-field span {
  color: #6f6256;
  font-size: 13px;
  font-weight: 800;
}

.profile-field input,
.profile-field select {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d4c8b4;
  border-radius: 8px;
  background: rgba(255, 252, 247, 0.88);
  color: #22170f;
  font: inherit;
  font-size: 14px;
  padding: 0 12px;
  outline: none;
}

.profile-field select {
  cursor: pointer;
}

.profile-field input:focus,
.profile-field select:focus {
  border-color: #a07850;
  box-shadow: 0 0 0 3px rgba(160, 120, 80, 0.14);
}

.score-stepper {
  width: 100%;
  min-height: 42px;
  border: 1px solid #d4c8b4;
  border-radius: 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  overflow: hidden;
  background: rgba(255, 252, 247, 0.88);
}

.score-stepper:focus-within {
  border-color: #a07850;
  box-shadow: 0 0 0 3px rgba(160, 120, 80, 0.14);
}

.score-stepper input {
  min-height: 40px;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding-right: 10px;
}

.score-stepper input::-webkit-outer-spin-button,
.score-stepper input::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.score-stepper-actions {
  display: grid;
  grid-template-rows: 1fr 1fr;
  border-left: 1px solid rgba(196, 180, 156, 0.58);
  background: rgba(245, 239, 228, 0.36);
}

.score-stepper-actions button {
  border: 0;
  display: grid;
  place-items: center;
  background: transparent;
  color: #7c5c3e;
  cursor: pointer;
  padding: 0;
}

.score-stepper-button::before {
  content: "";
  width: 7px;
  height: 7px;
  border-top: 2px solid currentColor;
  border-left: 2px solid currentColor;
}

.score-stepper-button--up::before {
  transform: translateY(2px) rotate(45deg);
}

.score-stepper-button--down::before {
  transform: translateY(-2px) rotate(225deg);
}

.score-stepper-actions button + button {
  border-top: 1px solid rgba(196, 180, 156, 0.58);
}

.score-stepper-actions button:hover {
  background: rgba(239, 228, 212, 0.72);
  color: #5f4026;
}

.score-stepper input:focus {
  box-shadow: none;
}

.profile-modal-error {
  margin: 12px 0 0;
  color: #b5483f;
  font-size: 13px;
  font-weight: 700;
}

.profile-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.modal-action-btn {
  min-width: 108px;
  min-height: 40px;
  padding: 0 18px;
}

.modal-action-btn:disabled,
.profile-modal-close:disabled {
  cursor: progress;
  opacity: 0.72;
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

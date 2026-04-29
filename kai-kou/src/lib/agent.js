import { getApiUrl } from "@/lib/api-url";
import { createEmptyHomeAnalytics, loadHomeAnalyticsSnapshotForAuth } from "@/lib/home-analytics";
import { createEmptyProfilePortrait, loadProfilePortraitSnapshotForAuth } from "@/lib/profile-portrait";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

const AGENT_CHAT_PATH = "/api/agent/chat";
const AGENT_CLIENT_TIMEOUT_MS = 45000;
const MAX_RECENT_MESSAGES = 10;
const MAX_RECENT_MESSAGE_CONTENT_LENGTH = 1000;
const TASK_LABELS = {
  RA: "RA",
  RS: "RS",
  RL: "RL",
  WE: "WE",
  WFD: "WFD",
  DI: "DI",
  RTS: "RTS"
};

export async function sendAgentMessage(message, conversationId = "", recentMessages = []) {
  const normalizedMessage = normalizeText(message);
  if (!normalizedMessage) {
    return {
      ok: false,
      message: "请输入你想问的问题。",
      reason_code: "invalid_request"
    };
  }

  const token = await resolveAccessToken();
  if (!token) {
    return {
      ok: false,
      message: "请先登录后再使用 AI 私教。",
      reason_code: "auth_failed"
    };
  }

  const requestPayload = {
    message: normalizedMessage,
    conversation_id: normalizeText(conversationId) || undefined,
    recent_messages: sanitizeRecentMessages(recentMessages)
  };

  let result = await performAgentRequest({
    token,
    payload: requestPayload
  });

  if (result.status === 401) {
    const refreshedToken = await resolveAccessToken({ forceRefresh: true });
    if (refreshedToken && refreshedToken !== token) {
      result = await performAgentRequest({
        token: refreshedToken,
        payload: requestPayload
      });
    }
  }

  if (result.networkError) {
    return result.networkError;
  }

  if (result.payload && result.status >= 400) {
    return normalizeFailurePayload(result.payload, result.status);
  }

  if (result.payload) {
    return normalizeSuccessPayload(result.payload);
  }

  return {
    ok: false,
    message: "网络连接不太稳定，请稍后再试。",
    reason_code: "network_error"
  };
}

function sanitizeRecentMessages(recentMessages) {
  return (Array.isArray(recentMessages) ? recentMessages : [])
    .map((item) => ({
      role: normalizeText(item?.role).toLowerCase(),
      content: normalizeText(item?.content).slice(0, MAX_RECENT_MESSAGE_CONTENT_LENGTH)
    }))
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-MAX_RECENT_MESSAGES);
}

async function performAgentRequest({ token, payload } = {}) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort();
      }, AGENT_CLIENT_TIMEOUT_MS)
    : null;

  try {
    const response = await fetch(getApiUrl(AGENT_CHAT_PATH), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload || {}),
      signal: controller?.signal
    });

    return {
      status: Number(response.status || 0),
      payload: await readJsonPayload(response)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        networkError: {
          ok: false,
          message: "AI 私教这次思考超时了，请换个更具体的问题再试。",
          reason_code: "provider_timeout"
        }
      };
    }

    return {
      networkError: {
        ok: false,
        message: "网络连接不太稳定，请稍后再试。",
        reason_code: "network_error"
      }
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function loadAgentOverview(authStore) {
  const [homeAnalytics, profilePortrait, recentTaskSnapshot] = await Promise.all([
    loadHomeAnalyticsSnapshotForAuth(authStore).catch(() => ({
      ...createEmptyHomeAnalytics(),
      loading: false
    })),
    loadProfilePortraitSnapshotForAuth(authStore).catch(() => ({
      ...createEmptyProfilePortrait(),
      loading: false
    })),
    loadRecentTaskSnapshot(authStore).catch(() => createEmptyRecentTaskSnapshot())
  ]);

  return {
    homeAnalytics,
    profilePortrait,
    recentTaskSnapshot
  };
}

function normalizeSuccessPayload(payload) {
  return {
    ok: true,
    reply: normalizeText(payload?.reply),
    model: normalizeText(payload?.model),
    provider: normalizeText(payload?.provider),
    usage: isPlainObject(payload?.usage) ? payload.usage : {},
    latency_ms: Number.isFinite(Number(payload?.latency_ms)) ? Math.round(Number(payload.latency_ms)) : 0,
    reason_code: normalizeText(payload?.reason_code) || "ok",
    request_id: normalizeText(payload?.request_id)
  };
}

function normalizeFailurePayload(payload, status = 0) {
  const reasonCode = normalizeText(payload?.reason_code || payload?.error);
  if (Number(status) === 401 || reasonCode === "auth_failed") {
    return {
      ok: false,
      message: normalizeText(payload?.message) || "请先登录后再使用 AI 私教。",
      reason_code: "auth_failed",
      request_id: normalizeText(payload?.request_id)
    };
  }

  return {
    ok: false,
    message: normalizeText(payload?.message) || "AI 私教暂时不可用，请稍后再试。",
    reason_code: reasonCode || (Number(status) === 400 ? "invalid_request" : "provider_error"),
    request_id: normalizeText(payload?.request_id)
  };
}

async function resolveAccessToken({ forceRefresh = false } = {}) {
  const authStore = useAuthStore();

  try {
    await authStore.init();

    const storeToken = normalizeText(authStore.session?.access_token);
    if (storeToken && !forceRefresh) {
      return storeToken;
    }

    const { data, error } = await supabase.auth.getSession();
    const sessionToken = normalizeText(data?.session?.access_token);
    if (!error && sessionToken && !forceRefresh) {
      return sessionToken;
    }

    const refreshResult = await supabase.auth.refreshSession();
    if (refreshResult?.error) {
      return sessionToken || storeToken || "";
    }

    return normalizeText(refreshResult?.data?.session?.access_token) || sessionToken || storeToken || "";
  } catch {
    return "";
  }
}

async function loadRecentTaskSnapshot(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) return createEmptyRecentTaskSnapshot();

  const { data, error } = await supabase
    .from("practice_logs")
    .select("task_type, created_at, score_json")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error || !Array.isArray(data)) {
    return createEmptyRecentTaskSnapshot();
  }

  const recentRows = data
    .map((row) => ({
      taskType: normalizeTaskType(row?.task_type),
      createdAt: normalizeText(row?.created_at),
      score: resolveComparableScore(row?.task_type, row?.score_json)
    }))
    .filter((item) => item.taskType);

  const attemptsByTask = {};
  const scoredByTask = {};
  let totalComparableScore = 0;
  let totalComparableScoreCount = 0;

  recentRows.forEach((item) => {
    attemptsByTask[item.taskType] = (attemptsByTask[item.taskType] || 0) + 1;

    if (!Number.isFinite(Number(item?.score?.comparable))) return;

    if (!scoredByTask[item.taskType]) {
      scoredByTask[item.taskType] = {
        totalDisplay: 0,
        totalComparable: 0,
        count: 0
      };
    }

    scoredByTask[item.taskType].totalDisplay += Number(item.score.display || 0);
    scoredByTask[item.taskType].totalComparable += Number(item.score.comparable || 0);
    scoredByTask[item.taskType].count += 1;

    totalComparableScore += Number(item.score.comparable || 0);
    totalComparableScoreCount += 1;
  });

  const weakTask = Object.entries(scoredByTask)
    .map(([taskType, bucket]) => ({
      taskType,
      label: TASK_LABELS[taskType] || taskType,
      averageDisplay: bucket.count ? Number((bucket.totalDisplay / bucket.count).toFixed(1)) : null,
      averageComparable: bucket.count ? Number((bucket.totalComparable / bucket.count).toFixed(1)) : null
    }))
    .sort((left, right) => Number(left.averageComparable || 0) - Number(right.averageComparable || 0))[0] || null;

  const recent7DayAttempts = recentRows.filter((item) => {
    if (!item.createdAt) return false;
    const createdAt = new Date(item.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return false;
    const diffMs = Date.now() - createdAt.getTime();
    return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    recentAttempts: recentRows.length,
    recent7DayAttempts,
    averageScore: totalComparableScoreCount
      ? Number((totalComparableScore / totalComparableScoreCount).toFixed(1))
      : null,
    weakTaskType: weakTask?.taskType || "",
    weakTaskTypeLabel: weakTask?.label || "",
    weakTaskAverageDisplay: weakTask?.averageDisplay ?? null,
    sampleInsufficient: recentRows.length < 5 || totalComparableScoreCount < 3
  };
}

function createEmptyRecentTaskSnapshot() {
  return {
    recentAttempts: 0,
    recent7DayAttempts: 0,
    averageScore: null,
    weakTaskType: "",
    weakTaskTypeLabel: "",
    weakTaskAverageDisplay: null,
    sampleInsufficient: true
  };
}

function resolveComparableScore(taskType, scoreJson) {
  const normalizedTaskType = normalizeTaskType(taskType);
  const score = parseJsonObject(scoreJson);

  if (normalizedTaskType === "WFD") {
    const accuracy = normalizePercent(score?.score)
      ?? normalizePercent(score?.overall)
      ?? resolveWfdAccuracy(score);

    if (!Number.isFinite(Number(accuracy))) return null;

    return {
      display: Number(accuracy.toFixed(1)),
      comparable: Number((10 + (accuracy / 100) * 80).toFixed(1))
    };
  }

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
    const normalized = normalizeScore90(candidate);
    if (Number.isFinite(Number(normalized))) {
      return {
        display: normalized,
        comparable: normalized
      };
    }
  }

  return null;
}

function resolveWfdAccuracy(score) {
  const correct = Number(score?.correct);
  const total = Number(score?.total);
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
  return (Math.max(0, correct) / total) * 100;
}

async function resolveCurrentUserId(authStore) {
  const authUserId = normalizeText(authStore?.user?.id);
  if (authUserId) return authUserId;

  try {
    const { data } = await supabase.auth.getSession();
    return normalizeText(data?.session?.user?.id);
  } catch {
    return "";
  }
}

function parseJsonObject(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  return isPlainObject(value) ? value : {};
}

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function normalizeTaskType(value) {
  const normalized = normalizeText(value).toUpperCase();
  return TASK_LABELS[normalized] ? normalized : "";
}

function normalizeScore90(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(Math.max(0, Math.min(90, numeric)).toFixed(1));
}

function normalizePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Number(Math.max(0, Math.min(100, numeric)).toFixed(1));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

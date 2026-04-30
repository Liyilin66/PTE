const PLAN_TABLE = "agent_daily_plans";
const LOCAL_TIMEZONE_OFFSET_MINUTES = 8 * 60;
const MAX_PLAN_ITEMS = 8;
const MAX_TARGET_COUNT = 30;
const MAX_ITEM_MINUTES = 180;

export const PLAN_TASK_TYPES = ["RA", "WFD", "WE", "DI", "RTS"];

export const PLAN_TASK_META = {
  RA: {
    label: "复述题训练",
    route: "/ra",
    color: "#34c9a2",
    focus: "保持不断句，开口别卡超过 3 秒",
    defaultCount: 3,
    defaultMinutes: 10
  },
  WFD: {
    label: "听写填空训练",
    route: "/wfd",
    color: "#5c8df6",
    focus: "先听主干，再补冠词、复数和时态细节",
    defaultCount: 5,
    defaultMinutes: 10
  },
  WE: {
    label: "学术短文写作",
    route: "/we",
    color: "#a7adb8",
    focus: "先列结构，再写正文，避免边想边写",
    defaultCount: 1,
    defaultMinutes: 5
  },
  DI: {
    label: "图表专项练习",
    route: "/di",
    color: "#49c9a7",
    focus: "先说主图信息，再补 2 个细节",
    defaultCount: 3,
    defaultMinutes: 15
  },
  RTS: {
    label: "复述句子",
    route: "/rts/practice",
    color: "#ff9142",
    focus: "抓场景和任务，再复述关键动作",
    defaultCount: 5,
    defaultMinutes: 10
  }
};

const FALLBACK_SEQUENCE = ["RA", "DI", "RTS", "WE"];

export function shouldAttachPlanSuggestion({ intent = "", message = "", recentMessages = [] } = {}) {
  const normalizedIntent = normalizeText(intent).toLowerCase();
  if (normalizedIntent === "plan") return true;

  if (normalizedIntent === "continuation") {
    const recentText = (Array.isArray(recentMessages) ? recentMessages : [])
      .map((item) => normalizeText(item?.content))
      .join("\n");
    return /(计划|规划|今天练什么|学习安排|训练安排|7天计划|7 天计划|冲刺计划|提分计划|备考计划|表格)/i.test(recentText);
  }

  return /(计划|规划|今天练什么|给我安排|学习安排|训练安排|7天计划|7 天计划|冲刺计划|提分计划|备考计划|每天练什么|帮我制定计划)/i.test(normalizeText(message));
}

export function createPlanSuggestionFromContext({ context = null, message = "", source = "agent_chat" } = {}) {
  const summary = context?.summary || context?.lifetime_summary || null;
  const selectedTypes = selectTaskTypesFromSummary(summary);
  const items = selectedTypes.map((taskType) => {
    const meta = PLAN_TASK_META[taskType] || PLAN_TASK_META.RA;
    return {
      task_type: taskType,
      label: meta.label,
      count: meta.defaultCount,
      minutes: meta.defaultMinutes,
      focus: meta.focus,
      route: meta.route
    };
  });

  return sanitizePlanSuggestion({
    title: isSevenDayPlanRequest(message) ? "第 1 天 AI 训练计划" : "今日 AI 训练计划",
    source,
    total_minutes: sumMinutes(items),
    items
  });
}

export function buildPlanReplyFromSuggestion(planSuggestion, message = "") {
  const plan = sanitizePlanSuggestion(planSuggestion);
  if (isSevenDayPlanRequest(message)) {
    return [
      "可以，我先把 7 天冲刺拆成每天 40 分钟左右；右侧可执行计划会接入第 1 天任务。",
      "",
      buildSevenDayMarkdownTable(plan),
      "",
      "点击下方「一键接入可执行计划」后，我会把第 1 天任务保存到右侧计划卡。"
    ].join("\n");
  }

  return [
    `可以，先按今天 ${plan.total_minutes} 分钟安排，优先补最容易带来提分的题型。`,
    "",
    buildPlanMarkdownTable(plan.items),
    "",
    "点击下方「一键接入可执行计划」后，右侧计划卡会变成这份任务。"
  ].join("\n");
}

export function ensureReplyContainsPlanTable(reply, planSuggestion, message = "") {
  const normalizedReply = normalizeText(reply);
  if (containsMarkdownTable(normalizedReply)) return normalizedReply;
  const fallback = buildPlanReplyFromSuggestion(planSuggestion, message);
  if (!normalizedReply) return fallback;
  return [normalizedReply, "", buildPlanMarkdownTable(sanitizePlanSuggestion(planSuggestion).items)].join("\n");
}

export async function getAgentDailyPlan({ supabase, user, planDate = "" } = {}) {
  const userId = normalizeText(user?.id);
  const dateKey = normalizeDateKey(planDate) || getTodayDateKey();
  if (!supabase || !userId) {
    return createPlanError("auth_failed", "请先登录后再查看今日计划。", dateKey);
  }

  const { data, error } = await supabase
    .from(PLAN_TABLE)
    .select("id, user_id, plan_date, title, source, plan_json, created_at, updated_at")
    .eq("user_id", userId)
    .eq("plan_date", dateKey)
    .maybeSingle();

  if (error) return mapPlanStorageError(error, dateKey);
  if (!data) {
    return {
      ok: true,
      plan: null,
      plan_date: dateKey,
      reason_code: "no_plan"
    };
  }

  const plan = sanitizePlanSuggestion({
    ...data.plan_json,
    title: data.title || data.plan_json?.title,
    source: data.source || data.plan_json?.source
  });
  const progress = await buildPlanProgress({ supabase, userId, plan, planDate: dateKey });

  return {
    ok: true,
    plan: {
      id: normalizeText(data.id),
      plan_date: normalizeText(data.plan_date) || dateKey,
      title: plan.title,
      source: plan.source,
      total_minutes: plan.total_minutes,
      created_at: normalizeText(data.created_at),
      updated_at: normalizeText(data.updated_at),
      ...progress
    },
    plan_date: dateKey,
    reason_code: "ok"
  };
}

export async function saveAgentDailyPlan({ supabase, user, planSuggestion, planDate = "" } = {}) {
  const userId = normalizeText(user?.id);
  const dateKey = normalizeDateKey(planDate) || getTodayDateKey();
  if (!supabase || !userId) {
    return createPlanError("auth_failed", "请先登录后再保存今日计划。", dateKey);
  }

  const plan = sanitizePlanSuggestion(planSuggestion);
  const payload = {
    user_id: userId,
    plan_date: dateKey,
    title: plan.title,
    source: plan.source,
    plan_json: plan,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from(PLAN_TABLE)
    .upsert(payload, { onConflict: "user_id,plan_date" });

  if (error) return mapPlanStorageError(error, dateKey);
  return getAgentDailyPlan({ supabase, user, planDate: dateKey });
}

export async function deleteAgentDailyPlan({ supabase, user, planDate = "" } = {}) {
  const userId = normalizeText(user?.id);
  const dateKey = normalizeDateKey(planDate) || getTodayDateKey();
  if (!supabase || !userId) {
    return createPlanError("auth_failed", "请先登录后再清空今日计划。", dateKey);
  }

  const { error } = await supabase
    .from(PLAN_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("plan_date", dateKey);

  if (error) return mapPlanStorageError(error, dateKey);
  return {
    ok: true,
    plan: null,
    plan_date: dateKey,
    reason_code: "deleted"
  };
}

export function sanitizePlanSuggestion(value = {}) {
  const rawItems = Array.isArray(value?.items) ? value.items : [];
  const itemMap = new Map();

  rawItems.slice(0, MAX_PLAN_ITEMS).forEach((item) => {
    const taskType = normalizeTaskType(item?.task_type || item?.type);
    if (!taskType) return;
    const meta = PLAN_TASK_META[taskType];
    const existing = itemMap.get(taskType);
    const count = clampInt(item?.count, existing ? 0 : meta.defaultCount, 1, MAX_TARGET_COUNT);
    const minutes = clampInt(item?.minutes, existing ? 0 : meta.defaultMinutes, 1, MAX_ITEM_MINUTES);
    const normalized = {
      task_type: taskType,
      label: limitText(item?.label, meta.label, 24),
      count,
      minutes,
      focus: limitText(item?.focus, meta.focus, 60),
      route: meta.route,
      color: meta.color
    };

    if (existing) {
      itemMap.set(taskType, {
        ...existing,
        count: Math.min(MAX_TARGET_COUNT, existing.count + normalized.count),
        minutes: Math.min(MAX_ITEM_MINUTES, existing.minutes + normalized.minutes),
        focus: existing.focus || normalized.focus
      });
      return;
    }

    itemMap.set(taskType, normalized);
  });

  const items = Array.from(itemMap.values());
  const safeItems = items.length
    ? items
    : FALLBACK_SEQUENCE.map((taskType) => {
      const meta = PLAN_TASK_META[taskType];
      return {
        task_type: taskType,
        label: meta.label,
        count: meta.defaultCount,
        minutes: meta.defaultMinutes,
        focus: meta.focus,
        route: meta.route,
        color: meta.color
      };
    });

  return {
    title: limitText(value?.title, "今日 AI 训练计划", 32),
    source: limitText(value?.source, "agent_chat", 32),
    total_minutes: sumMinutes(safeItems),
    items: safeItems
  };
}

async function buildPlanProgress({ supabase, userId, plan, planDate }) {
  const counts = await loadTodayPracticeCounts({ supabase, userId, planDate });
  let effectiveCompletedTotal = 0;
  let targetTotal = 0;
  let remainingMinutes = 0;

  const items = plan.items.map((item) => {
    const targetCount = Math.max(1, Math.round(Number(item.count || 1)));
    const completedCount = Math.max(0, Math.round(Number(counts[item.task_type] || 0)));
    const effectiveCompleted = Math.min(completedCount, targetCount);
    const remainingRatio = Math.max(targetCount - completedCount, 0) / targetCount;
    const itemRemainingMinutes = Math.ceil(Number(item.minutes || 0) * remainingRatio);
    effectiveCompletedTotal += effectiveCompleted;
    targetTotal += targetCount;
    remainingMinutes += itemRemainingMinutes;

    return {
      ...item,
      target_count: targetCount,
      completed_count: completedCount,
      effective_completed_count: effectiveCompleted,
      remaining_minutes: itemRemainingMinutes,
      is_complete: effectiveCompleted >= targetCount
    };
  });

  const progressPercentage = targetTotal
    ? Math.min(100, Math.round((effectiveCompletedTotal / targetTotal) * 100))
    : 0;

  return {
    items,
    completed_count: effectiveCompletedTotal,
    target_count: targetTotal,
    remaining_minutes: Math.max(0, Math.round(remainingMinutes)),
    progress_percentage: progressPercentage,
    is_complete: targetTotal > 0 && effectiveCompletedTotal >= targetTotal,
    practice_counts: counts
  };
}

async function loadTodayPracticeCounts({ supabase, userId, planDate }) {
  const { startIso, endIso } = getLocalDateRangeUtc(planDate);
  const { data, error } = await supabase
    .from("practice_logs")
    .select("id, task_type, created_at")
    .eq("user_id", userId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);

  if (error || !Array.isArray(data)) return {};
  return data.reduce((counts, row) => {
    const taskType = normalizeTaskType(row?.task_type);
    if (!taskType) return counts;
    counts[taskType] = (counts[taskType] || 0) + 1;
    return counts;
  }, {});
}

function selectTaskTypesFromSummary(summary) {
  const averages = summary && typeof summary === "object" && summary.average_score_by_task_type
    ? summary.average_score_by_task_type
    : {};
  const scoredTypes = PLAN_TASK_TYPES
    .map((taskType) => ({
      taskType,
      average: Number(averages?.[taskType])
    }))
    .filter((item) => Number.isFinite(item.average))
    .sort((left, right) => left.average - right.average)
    .map((item) => item.taskType);

  const output = [];
  [...scoredTypes, ...FALLBACK_SEQUENCE].forEach((taskType) => {
    if (!PLAN_TASK_TYPES.includes(taskType) || output.includes(taskType)) return;
    output.push(taskType);
  });

  return output.slice(0, 4);
}

function buildPlanMarkdownTable(items) {
  const rows = sanitizePlanSuggestion({ items }).items.map((item) => (
    `| ${item.task_type} | ${item.label} | ${item.count} | ${item.minutes} 分钟 | ${item.focus} |`
  ));

  return [
    "| 题型 | 任务 | 数量 | 预计时间 | 训练重点 |",
    "| --- | --- | --- | --- | --- |",
    ...rows
  ].join("\n");
}

function buildSevenDayMarkdownTable(plan) {
  const taskSets = [
    plan.items,
    rotateItems(plan.items, 1),
    rotateItems(plan.items, 2),
    plan.items,
    rotateItems(plan.items, 1),
    rotateItems(plan.items, 2),
    plan.items
  ];

  const rows = taskSets.map((items, index) => {
    const safeItems = sanitizePlanSuggestion({ items }).items;
    const types = safeItems.map((item) => item.task_type).join(" + ");
    const totalCount = safeItems.reduce((total, item) => total + Number(item.count || 0), 0);
    const totalMinutes = safeItems.reduce((total, item) => total + Number(item.minutes || 0), 0);
    const focus = safeItems[0]?.focus || "先完成计划，再复盘错点";
    return `| 第 ${index + 1} 天 | ${types} | 当日组合训练 | ${totalCount} | ${totalMinutes} 分钟 | ${focus} |`;
  });

  return [
    "| 天数 | 题型 | 任务 | 数量 | 预计时间 | 训练重点 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows
  ].join("\n");
}

function rotateItems(items, offset) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return safeItems;
  return safeItems.map((_, index) => safeItems[(index + offset) % safeItems.length]);
}

function isSevenDayPlanRequest(message) {
  return /(7天|7 天|七天|一周|week)/i.test(normalizeText(message));
}

function containsMarkdownTable(text) {
  const lines = normalizeText(text).split(/\r?\n/);
  return lines.some((line, index) => line.includes("|") && /^(\s*\|?\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || ""));
}

function normalizeTaskType(value) {
  const normalized = normalizeText(value).toUpperCase();
  return PLAN_TASK_TYPES.includes(normalized) ? normalized : "";
}

function normalizeDateKey(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getTodayDateKey() {
  const now = new Date(Date.now() + LOCAL_TIMEZONE_OFFSET_MINUTES * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function getLocalDateRangeUtc(planDate) {
  const dateKey = normalizeDateKey(planDate) || getTodayDateKey();
  const [year, month, day] = dateKey.split("-").map((item) => Number(item));
  const localStartUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - LOCAL_TIMEZONE_OFFSET_MINUTES * 60 * 1000;
  const localEndUtcMs = localStartUtcMs + 24 * 60 * 60 * 1000;
  return {
    startIso: new Date(localStartUtcMs).toISOString(),
    endIso: new Date(localEndUtcMs).toISOString()
  };
}

function sumMinutes(items) {
  return Math.max(0, Math.round((Array.isArray(items) ? items : [])
    .reduce((total, item) => total + Number(item?.minutes || 0), 0)));
}

function clampInt(value, fallback, min, max) {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return Math.max(min, Math.min(max, Math.round(Number(fallback || min))));
  return Math.max(min, Math.min(max, numeric));
}

function limitText(value, fallback, maxLength) {
  const text = normalizeText(value) || normalizeText(fallback);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function mapPlanStorageError(error, planDate) {
  const code = normalizeText(error?.code);
  const message = normalizeText(error?.message);
  const storageNotReady = code === "42P01"
    || code === "PGRST205"
    || /agent_daily_plans|does not exist|schema cache/i.test(message);

  if (storageNotReady) {
    return createPlanError(
      "plan_storage_not_ready",
      "可执行计划表还没有创建。请先在 Supabase SQL Editor 执行 db/agent-daily-plans.sql。",
      planDate
    );
  }

  return createPlanError("plan_storage_error", "可执行计划暂时不可用，请稍后再试。", planDate);
}

function createPlanError(reasonCode, message, planDate) {
  return {
    ok: false,
    plan: null,
    plan_date: normalizeDateKey(planDate) || getTodayDateKey(),
    message,
    reason_code: reasonCode
  };
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

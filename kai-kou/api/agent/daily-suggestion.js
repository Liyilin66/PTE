import { buildDailySuggestionResponse } from "../../backend/agent/daily-suggestion-service.js";
import { BillingRequestError, handleOptions, readJsonBody, respondJson } from "../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../backend/billing/supabase-admin.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const requestId = createRequestId("daily_suggestion");
  const startedAt = nowMs();

  try {
    if (req.method !== "POST") {
      return respondJson(res, 405, {
        ok: false,
        message: "Method not allowed",
        reason_code: "invalid_request",
        request_id: requestId
      });
    }

    const body = readJsonBody(req);
    const { user, supabase } = await requireAuthenticatedUser(req);
    const payload = await buildDailySuggestionResponse({
      supabase,
      user,
      requestId,
      force: Boolean(body?.force),
      practiceSignature: normalizeText(body?.practice_signature)
    });

    return respondJson(res, 200, {
      ...payload,
      latency_ms: elapsedMs(startedAt)
    });
  } catch (error) {
    if (error instanceof BillingRequestError && Number(error.status) === 401) {
      return respondJson(res, 401, {
        ok: false,
        message: "请先登录后再使用今日 AI 建议。",
        reason_code: "auth_failed",
        request_id: requestId,
        latency_ms: elapsedMs(startedAt)
      });
    }

    console.warn("[daily-suggestion] request failed", JSON.stringify({
      request_id: requestId,
      reason_code: normalizeText(error?.code || error?.name || "unexpected_error"),
      total_ms: elapsedMs(startedAt)
    }));

    return respondJson(res, 200, {
      ok: true,
      suggestion: {
        title: "今日 AI 建议",
        main_task_type: "RA",
        headline: "先完成一轮基础测温",
        reason: "AI 建议暂时不可用，先用保守训练计划兜底。",
        advice: "先做 RA 2 道、DI 2 道、WFD 5 道，完成后刷新首页再看新的建议。",
        tasks: [
          { task_type: "RA", count: 2 },
          { task_type: "DI", count: 2 },
          { task_type: "WFD", count: 5 }
        ],
        cta_text: "开始练习"
      },
      generated_at: new Date().toISOString(),
      source: "fallback",
      practice_signature: "",
      summary: null,
      model: "",
      provider: "local_fallback",
      reason_code: "fallback_unexpected_error",
      request_id: requestId,
      latency_ms: elapsedMs(startedAt)
    });
  }
}

function createRequestId(prefix) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - Number(startedAt || 0)));
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

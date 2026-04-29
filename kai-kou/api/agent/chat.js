import { buildAgentContext } from "../../backend/agent/build-agent-context.js";
import { buildAgentMessages } from "../../backend/agent/agent-prompt.js";
import {
  AgentChatServiceError,
  detectAgentIntent,
  getAgentTokenBudget,
  requestAgentChatCompletion,
  sanitizeRecentMessages,
  tryBuildFastPathAgentReply,
  shouldUsePracticeData
} from "../../backend/agent/chat-service.js";
import { BillingRequestError, handleOptions, readJsonBody, respondJson } from "../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../backend/billing/supabase-admin.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const requestId = createRequestId("agent");
  const timing = createTimingState();
  let responseStatus = 500;
  let responsePayload = {
    ok: false,
    message: "AI 私教暂时不可用，请稍后再试。",
    reason_code: "unexpected_error",
    request_id: requestId
  };
  let intent = "";
  let usePracticeData = false;
  let context = null;
  let messages = [];
  let model = "";
  let provider = "";
  let reply = "";
  let usage = {};
  let reasonCode = "unexpected_error";
  let errorName = "";
  let errorMessageSafe = "";
  let recentMessages = [];
  let authStartedAt = 0;
  let selectedMaxTokens = 0;
  let globalMaxTokens = 0;
  let fastPathUsed = false;
  let outputChars = 0;
  let debugTiming = {};

  try {
    if (req.method !== "POST") {
      responseStatus = 405;
      responsePayload = {
        ok: false,
        message: "Method not allowed",
        reason_code: "invalid_request",
        request_id: requestId
      };
      errorName = "InvalidRequest";
      errorMessageSafe = "invalid_request";
    } else {
      let body = {};
      try {
        body = readJsonBody(req);
      } catch {
        responseStatus = 400;
        responsePayload = {
          ok: false,
          message: "请输入你想问的问题。",
          reason_code: "invalid_request",
          request_id: requestId
        };
        errorName = "InvalidRequest";
        errorMessageSafe = "invalid_request";
      }

      if (responseStatus !== 400) {
        const message = normalizeText(body?.message);
        recentMessages = sanitizeRecentMessages(body?.recent_messages, {
          maxItems: 6,
          maxContentLength: 500
        });

        if (!message) {
          responseStatus = 400;
          responsePayload = {
            ok: false,
            message: "请输入你想问的问题。",
            reason_code: "invalid_request",
            request_id: requestId
          };
          errorName = "InvalidRequest";
          errorMessageSafe = "invalid_request";
        } else {
          authStartedAt = nowMs();
          const { user, supabase } = await requireAuthenticatedUser(req);
          timing.auth_ms = elapsedMs(authStartedAt);

          const intentStartedAt = nowMs();
          intent = detectAgentIntent(message, { recentMessages });
          usePracticeData = shouldUsePracticeData({ intent, message, recentMessages });
          const tokenBudget = getAgentTokenBudget({ intent, message, recentMessages });
          selectedMaxTokens = tokenBudget.selected_max_tokens;
          globalMaxTokens = tokenBudget.global_max_tokens;
          timing.intent_ms = elapsedMs(intentStartedAt);

          const contextDiagnostics = { timing: {} };
          context = await buildAgentContext({
            supabase,
            user,
            intent,
            usePracticeData,
            diagnostics: contextDiagnostics
          });
          mergeTiming(timing, contextDiagnostics.timing);

          const fastPathReply = tryBuildFastPathAgentReply({ intent, message, context });
          if (fastPathReply) {
            fastPathUsed = true;
            model = "";
            provider = "backend_fast_path";
            reply = normalizeText(fastPathReply);
            usage = {};
            debugTiming = {
              provider_request_ms: 0,
              provider_parse_ms: 0
            };
          } else {
            const promptStartedAt = nowMs();
            messages = buildAgentMessages({ message, context, intent, recentMessages });
            timing.prompt_build_ms = elapsedMs(promptStartedAt);

            const chatResult = await requestAgentChatCompletion({
              messages,
              intent,
              recentMessages
            });
            model = normalizeText(chatResult?.model);
            provider = normalizeText(chatResult?.provider);
            reply = normalizeText(chatResult?.reply);
            usage = isPlainObject(chatResult?.usage) ? chatResult.usage : {};
            selectedMaxTokens = toRoundedInt(chatResult?.selected_max_tokens, selectedMaxTokens);
            globalMaxTokens = toRoundedInt(chatResult?.global_max_tokens, globalMaxTokens);
            debugTiming = isPlainObject(chatResult?.debug_timing) ? chatResult.debug_timing : {};
            mergeTiming(timing, debugTiming);
          }

          reasonCode = "ok";
          outputChars = reply.length;
          responseStatus = 200;
          responsePayload = {
            ok: true,
            reply,
            model,
            provider,
            usage,
            reason_code: reasonCode,
            request_id: requestId,
            ...(shouldExposeDebug()
              ? {
                  debug: buildSafeDebug(context, intent, usePracticeData, recentMessages, {
                    selectedMaxTokens,
                    globalMaxTokens,
                    fastPathUsed
                  })
                }
              : {})
          };
        }
      }
    }
  } catch (error) {
    if (authStartedAt && !timing.auth_ms) {
      timing.auth_ms = elapsedMs(authStartedAt);
    }

    if (error instanceof BillingRequestError && Number(error.status) === 401) {
      responseStatus = 401;
      responsePayload = {
        ok: false,
        message: "请先登录后再使用 AI 私教。",
        reason_code: "auth_failed",
        request_id: requestId
      };
      errorName = "BillingRequestError";
      errorMessageSafe = "auth_failed";
    } else if (error instanceof AgentChatServiceError) {
      model = normalizeText(error.model || model);
      provider = normalizeText(error.provider || provider);
      debugTiming = isPlainObject(error.debug_timing) ? error.debug_timing : {};
      mergeTiming(timing, debugTiming);

      responseStatus = error.status;
      reasonCode = normalizeText(error.reason_code) || "provider_error";
      responsePayload = {
        ok: false,
        message: error.message,
        reason_code: reasonCode,
        request_id: requestId
      };
      errorName = normalizeText(error.error_name || error.name || "AgentChatServiceError");
      errorMessageSafe = normalizeText(error.error_message_safe || error.reason_code || "provider_error");
      selectedMaxTokens = toRoundedInt(error.selected_max_tokens, selectedMaxTokens);
      globalMaxTokens = toRoundedInt(error.global_max_tokens, globalMaxTokens);
    } else {
      responseStatus = 500;
      reasonCode = "unexpected_error";
      responsePayload = {
        ok: false,
        message: "AI 私教暂时不可用，请稍后再试。",
        reason_code: reasonCode,
        request_id: requestId
      };
      errorName = normalizeText(error?.name || "Error");
      errorMessageSafe = "unexpected_error";
    }
  } finally {
    const finalizedTiming = finalizeTiming(timing);
    reasonCode = normalizeText(responsePayload?.reason_code || reasonCode) || "unexpected_error";
    const latencyMs = finalizedTiming.total_ms;
    outputChars = toRoundedInt(outputChars, reply.length);

    responsePayload = {
      ...responsePayload,
      request_id: requestId,
      latency_ms: latencyMs,
      ...(shouldExposeDebug()
        ? {
            debug_timing: {
              request_start: finalizedTiming.request_start,
              auth_ms: finalizedTiming.auth_ms,
              intent_ms: finalizedTiming.intent_ms,
              build_context_ms: finalizedTiming.build_context_ms,
              profile_query_ms: finalizedTiming.profile_query_ms,
              practice_logs_query_ms: finalizedTiming.practice_logs_query_ms,
              lifetime_summary_ms: finalizedTiming.lifetime_summary_ms,
              prompt_build_ms: finalizedTiming.prompt_build_ms,
              provider_request_ms: finalizedTiming.provider_request_ms,
              provider_parse_ms: finalizedTiming.provider_parse_ms,
              total_ms: finalizedTiming.total_ms
            }
          }
        : {})
    };

    logAgentRequestSummary({
      request_id: requestId,
      intent: normalizeText(intent) || null,
      usePracticeData,
      model: model || null,
      provider: provider || null,
      input_messages_count: messages.length,
      estimated_context_chars: estimateContextChars(messages),
      output_chars: outputChars,
      request_start: finalizedTiming.request_start,
      auth_ms: finalizedTiming.auth_ms,
      intent_ms: finalizedTiming.intent_ms,
      build_context_ms: finalizedTiming.build_context_ms,
      profile_query_ms: finalizedTiming.profile_query_ms,
      practice_logs_query_ms: finalizedTiming.practice_logs_query_ms,
      lifetime_summary_ms: finalizedTiming.lifetime_summary_ms,
      prompt_build_ms: finalizedTiming.prompt_build_ms,
      provider_request_ms: finalizedTiming.provider_request_ms,
      provider_parse_ms: finalizedTiming.provider_parse_ms,
      total_ms: finalizedTiming.total_ms,
      selected_max_tokens: selectedMaxTokens,
      global_max_tokens: globalMaxTokens,
      fast_path_used: fastPathUsed,
      reason_code: reasonCode,
      error_name: errorName || null,
      error_message_safe: errorMessageSafe || null
    });
  }

  return respondJson(res, responseStatus, responsePayload);
}

function buildSafeDebug(context, intent, usePracticeData, recentMessages, extras = {}) {
  return {
    intent,
    usePracticeData,
    hasPracticeData: Boolean(context?.practice || context?.summary || context?.lifetime_summary),
    totalAttempts: Number(context?.summary?.total_attempts ?? context?.lifetime_summary?.total_attempts ?? 0),
    scoredAttempts: Number(context?.summary?.scored_attempts ?? context?.lifetime_summary?.scored_attempts ?? 0),
    overallAverageScore: context?.summary?.overall_average_score ?? context?.lifetime_summary?.overall_average_score ?? null,
    recentMessagesCount: Array.isArray(recentMessages) ? recentMessages.length : 0,
    selectedMaxTokens: toRoundedInt(extras.selectedMaxTokens, 0),
    globalMaxTokens: toRoundedInt(extras.globalMaxTokens, 0),
    fastPathUsed: Boolean(extras.fastPathUsed)
  };
}

function createTimingState() {
  return {
    _started_at: nowMs(),
    request_start: new Date().toISOString(),
    auth_ms: 0,
    intent_ms: 0,
    build_context_ms: 0,
    profile_query_ms: 0,
    practice_logs_query_ms: 0,
    lifetime_summary_ms: 0,
    prompt_build_ms: 0,
    provider_request_ms: 0,
    provider_parse_ms: 0,
    total_ms: 0
  };
}

function finalizeTiming(timing) {
  const safeTiming = {
    ...createTimingState(),
    ...(timing && typeof timing === "object" ? timing : {})
  };

  safeTiming.total_ms = elapsedMs(safeTiming._started_at);
  delete safeTiming._started_at;
  return safeTiming;
}

function mergeTiming(target, source) {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) continue;
    if (!Number.isFinite(Number(value))) continue;
    target[key] = Math.max(0, Math.round(Number(value)));
  }
}

function logAgentRequestSummary(summary) {
  try {
    console.log("[agent/chat]", JSON.stringify(summary));
  } catch {
    console.log("[agent/chat]", summary?.request_id || "unknown_request");
  }
}

function estimateContextChars(messages) {
  return (Array.isArray(messages) ? messages : [])
    .reduce((total, item) => total + normalizeText(item?.content).length, 0);
}

function createRequestId(prefix = "agent") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value) {
  return `${value || ""}`.trim();
}

function shouldExposeDebug() {
  const nodeEnv = `${process.env.NODE_ENV || ""}`.trim().toLowerCase();
  const vercelEnv = `${process.env.VERCEL_ENV || ""}`.trim().toLowerCase();
  return nodeEnv !== "production" && vercelEnv !== "production";
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - Number(startedAt || 0)));
}

function toRoundedInt(value, fallback = 0) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric);
  }
  return Math.max(0, Math.round(Number(fallback || 0)));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

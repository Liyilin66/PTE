import { buildAgentContext } from "../../backend/agent/build-agent-context.js";
import { buildAgentMessages } from "../../backend/agent/agent-prompt.js";
import {
  buildPlanReplyFromSuggestion,
  createPlanSuggestionFromContext,
  ensureReplyContainsPlanTable,
  resolvePreviousPlanFromRecentMessages,
  shouldAttachPlanSuggestion
} from "../../backend/agent/agent-plan-service.js";
import {
  AgentChatServiceError,
  detectAgentIntent,
  getAgentTokenBudget,
  requestAgentChatCompletion,
  tryBuildFastPathAgentReply,
  shouldUsePracticeData
} from "../../backend/agent/chat-service.js";
import { BillingRequestError, handleOptions, readJsonBody, respondJson } from "../../backend/billing/http.js";
import { requireAuthenticatedUser } from "../../backend/billing/supabase-admin.js";
import {
  AgentMemoryError,
  ensureMainAgentSession,
  fetchRecentModelMessages,
  getAgentSessionForUser,
  insertAgentMessage,
  requireAgentVip,
  updateAgentSessionTitleFromMessage,
  writeAgentUsageLog
} from "../../backend/agent/agent-memory-service.js";

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
  let planSuggestion = null;
  let previousPlan = null;
  let clientRecentMessages = [];
  let supabase = null;
  let userId = "";
  let agentSession = null;
  let shouldWriteUsageLog = false;
  let shouldPersistFailureReply = false;

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
        recentMessages = [];
        clientRecentMessages = sanitizeClientRecentMessages(body?.recent_messages);

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
          const authResult = await requireAuthenticatedUser(req);
          const user = authResult.user;
          supabase = authResult.supabase;
          userId = normalizeText(user?.id);
          timing.auth_ms = elapsedMs(authStartedAt);
          await requireAgentVip({ supabase, user });

          const requestedSessionId = normalizeText(body?.session_id);
          agentSession = requestedSessionId
            ? await getAgentSessionForUser({ supabase, userId, sessionId: requestedSessionId })
            : await ensureMainAgentSession({ supabase, userId });
          if (agentSession.session_type !== "main") {
            throw new AgentMemoryError(403, "forbidden", "无权访问这个 AI 私教会话。");
          }

          const storedRecentMessages = await fetchRecentModelMessages({
            supabase,
            userId,
            sessionId: agentSession.id,
            limit: 20
          });
          recentMessages = mergeRecentMessagesWithClientMetadata(storedRecentMessages, clientRecentMessages);

          const intentStartedAt = nowMs();
          intent = detectAgentIntent(message, { recentMessages });
          previousPlan = intent === "regenerate_plan"
            ? resolvePreviousPlanFromRecentMessages(recentMessages)
            : null;
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

          await insertAgentMessage({
            supabase,
            userId,
            sessionId: agentSession.id,
            role: "user",
            content: message,
            intent,
            metadata: {
              source: "agent_chat"
            }
          });
          const titledSession = await updateAgentSessionTitleFromMessage({
            supabase,
            userId,
            sessionId: agentSession.id,
            message
          });
          if (titledSession?.id) {
            agentSession = {
              ...agentSession,
              title: titledSession.title || agentSession.title,
              updated_at: titledSession.updated_at || agentSession.updated_at,
              status: titledSession.status || agentSession.status
            };
          }
          shouldWriteUsageLog = true;
          shouldPersistFailureReply = true;

          if (shouldAttachPlanSuggestion({ intent, message, recentMessages })) {
            planSuggestion = createPlanSuggestionFromContext({
              context,
              message,
              source: "agent_chat",
              previousPlan,
              requestId,
              intent
            });
          }

          const fastPathReply = planSuggestion
            ? buildPlanReplyFromSuggestion(planSuggestion, message, { previousPlan })
            : tryBuildFastPathAgentReply({ intent, message, context });
          if (fastPathReply) {
            fastPathUsed = true;
            model = "";
            provider = planSuggestion ? "backend_plan_builder" : "backend_fast_path";
            reply = normalizeText(fastPathReply);
            usage = {};
            debugTiming = {
              provider_request_ms: 0,
              provider_parse_ms: 0
            };
          } else {
            const promptStartedAt = nowMs();
            messages = buildAgentMessages({ message, context, intent, recentMessages, previousPlan });
            timing.prompt_build_ms = elapsedMs(promptStartedAt);

            const chatResult = await requestAgentChatCompletion({
              messages,
              intent,
              recentMessages
            });
            model = normalizeText(chatResult?.model);
            provider = normalizeText(chatResult?.provider);
            reply = normalizeText(chatResult?.reply);
            if (planSuggestion) {
              reply = ensureReplyContainsPlanTable(reply, planSuggestion, message, { previousPlan });
            }
            usage = isPlainObject(chatResult?.usage) ? chatResult.usage : {};
            selectedMaxTokens = toRoundedInt(chatResult?.selected_max_tokens, selectedMaxTokens);
            globalMaxTokens = toRoundedInt(chatResult?.global_max_tokens, globalMaxTokens);
            debugTiming = isPlainObject(chatResult?.debug_timing) ? chatResult.debug_timing : {};
            mergeTiming(timing, debugTiming);
          }

          reply = sanitizePersistedAssistantReply(reply);

          await insertAgentMessage({
            supabase,
            userId,
            sessionId: agentSession.id,
            role: "assistant",
            content: reply,
            intent,
            metadata: {
              source: provider || "agent_chat",
              ...(planSuggestion
                ? {
                    plan_suggestion: planSuggestion,
                    plan_variant: planSuggestion.variant || null,
                    previous_plan_used: Boolean(previousPlan)
                  }
                : {})
            }
          });

          reasonCode = "ok";
          outputChars = reply.length;
          responseStatus = 200;
          responsePayload = {
            ok: true,
            reply,
            session_id: agentSession.id,
            ...(planSuggestion ? { plan_suggestion: planSuggestion } : {}),
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
    } else if (error instanceof AgentMemoryError) {
      responseStatus = error.status;
      reasonCode = normalizeText(error.reason_code) || "agent_memory_error";
      responsePayload = {
        ok: false,
        message: error.message,
        reason_code: reasonCode,
        request_id: requestId
      };
      errorName = "AgentMemoryError";
      errorMessageSafe = reasonCode;
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

    if (shouldWriteUsageLog && supabase && userId && agentSession?.id) {
      if (shouldPersistFailureReply && reasonCode !== "ok") {
        try {
          await insertAgentMessage({
            supabase,
            userId,
            sessionId: agentSession.id,
            role: "assistant",
            content: normalizeText(responsePayload?.message) || "AI 私教暂时不可用，请稍后再试。",
            intent,
            metadata: {
              source: "agent_chat_error",
              error_code: reasonCode || "unexpected_error",
              request_id: requestId
            }
          });
          outputChars = normalizeText(responsePayload?.message).length;
        } catch (historyError) {
          console.warn("[agent/chat] failure reply write failed", JSON.stringify({
            request_id: requestId,
            reason_code: normalizeText(historyError?.reason_code || historyError?.code || "history_write_failed")
          }));
        }
      }

      try {
        await writeAgentUsageLog({
          supabase,
          payload: {
            user_id: userId,
            session_id: agentSession.id,
            request_id: requestId,
            intent: normalizeText(intent) || null,
            provider_used: provider || null,
            model: model || null,
            input_tokens: usage?.prompt_tokens,
            output_tokens: usage?.completion_tokens,
            latency_ms: latencyMs,
            status: reasonCode === "ok" ? "ok" : "failed",
            error_code: reasonCode === "ok" ? null : reasonCode
          }
        });
      } catch (usageError) {
        console.warn("[agent/chat] usage log write failed", JSON.stringify({
          request_id: requestId,
          reason_code: normalizeText(usageError?.reason_code || usageError?.code || "usage_log_failed")
        }));
      }
    }

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

function sanitizeClientRecentMessages(sourceMessages) {
  return (Array.isArray(sourceMessages) ? sourceMessages : [])
    .map((item) => {
      const planSuggestion = sanitizeClientPlanSuggestion(item?.plan_suggestion || item?.planSuggestion);
      return {
        role: normalizeText(item?.role).toLowerCase(),
        content: normalizeText(item?.content).slice(0, 1000),
        ...(planSuggestion ? { metadata: { plan_suggestion: planSuggestion } } : {})
      };
    })
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-20);
}

function sanitizeClientPlanSuggestion(value) {
  if (!isPlainObject(value) || !Array.isArray(value.items) || !value.items.length) return null;
  return {
    title: normalizeText(value.title).slice(0, 80),
    source: normalizeText(value.source).slice(0, 40),
    variant: normalizeText(value.variant).slice(0, 40),
    total_minutes: toRoundedInt(value.total_minutes, 0),
    items: value.items.slice(0, 8).map((item) => ({
      task_type: normalizeText(item?.task_type).toUpperCase().slice(0, 12),
      label: normalizeText(item?.label).slice(0, 40),
      count: toRoundedInt(item?.count, 0),
      minutes: toRoundedInt(item?.minutes, 0),
      focus: normalizeText(item?.focus).slice(0, 100),
      route: normalizeText(item?.route).slice(0, 80)
    }))
  };
}

function mergeRecentMessagesWithClientMetadata(storedMessages, clientMessages) {
  const output = (Array.isArray(storedMessages) ? storedMessages : []).map((item) => ({
    ...item,
    metadata: isPlainObject(item?.metadata) ? { ...item.metadata } : {}
  }));

  (Array.isArray(clientMessages) ? clientMessages : []).forEach((clientItem) => {
    const clientPlan = clientItem?.metadata?.plan_suggestion;
    if (!isPlainObject(clientPlan)) return;

    const match = findRecentMessageMatch(output, clientItem);
    if (match) {
      match.metadata = {
        ...(isPlainObject(match.metadata) ? match.metadata : {}),
        plan_suggestion: isPlainObject(match.metadata?.plan_suggestion) ? match.metadata.plan_suggestion : clientPlan
      };
      return;
    }

    output.push({
      role: clientItem.role,
      content: clientItem.content,
      metadata: {
        plan_suggestion: clientPlan
      }
    });
  });

  return output.slice(-20);
}

function findRecentMessageMatch(messages, candidate) {
  const candidateRole = normalizeText(candidate?.role).toLowerCase();
  const candidateContent = normalizeText(candidate?.content);
  if (!candidateRole || !candidateContent) return null;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    if (normalizeText(item?.role).toLowerCase() !== candidateRole) continue;
    if (normalizeText(item?.content) !== candidateContent) continue;
    return item;
  }

  return null;
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

function sanitizePersistedAssistantReply(value) {
  const text = normalizeText(value);
  if (!text) return "";

  const hasSensitiveMarker = /(system prompt|developer prompt|authorization:\s*bearer|service_role|api[_ -]?key|secret|jwt|private key|practice_logs|score_json)/i.test(text);
  const hasRawContextJson = /"(practice|summary|lifetime_summary|recent_logs|score_json|feedback)"\s*:/i.test(text);
  if (!hasSensitiveMarker && !hasRawContextJson) {
    return text;
  }

  let safeText = text
    .replace(/(authorization:\s*bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/([A-Z0-9_]*(?:API_KEY|SERVICE_ROLE_KEY|SECRET|TOKEN|JWT)[A-Z0-9_]*\s*[:=]\s*)["']?[^"',}\s]+["']?/gi, "$1[redacted]")
    .replace(/"(?:practice|summary|lifetime_summary|recent_logs|score_json|feedback)"\s*:\s*(?:\{[\s\S]*?\}|\[[\s\S]*?\]|"[^"]*")/gi, "\"agent_context\":\"[redacted]\"");

  safeText = safeText
    .split(/\r?\n/)
    .filter((line) => !/(system prompt|developer prompt|service_role|private key|authorization:\s*bearer|practice_logs)/i.test(line))
    .join("\n")
    .trim();

  return safeText || "我无法展示内部提示词、密钥或后台上下文，但可以继续根据你可见的练习结果给出建议。";
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

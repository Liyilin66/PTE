import { isFallbackEligible } from "./provider-error.js";
import { callGemini } from "./providers/gemini.js";
import { callGroq, getGroqApiKeyFromEnv } from "./providers/groq.js";

export async function generateScoreTextWithFallback({ prompt } = {}) {
  const startedAt = nowMs();

  let primaryLatencyMs = 0;
  try {
    const primary = await callGemini({
      prompt,
      apiKey: process.env.GEMINI_API_KEY
    });
    primaryLatencyMs = Number(primary?.latency_ms || 0);
    return {
      raw_text: primary.raw_text,
      provider_used: "gemini",
      fallback_reason: null,
      raw_error_type: null,
      latency: {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      }
    };
  } catch (primaryError) {
    primaryLatencyMs = Number(primaryError?.latency_ms || 0);
    if (!isFallbackEligible(primaryError)) {
      primaryError.provider_used = "gemini";
      primaryError.fallback_reason = null;
      primaryError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      };
      throw primaryError;
    }

    const fallbackApiKey = getGroqApiKeyFromEnv();
    if (!fallbackApiKey) {
      primaryError.provider_used = "gemini";
      primaryError.fallback_reason = primaryError.raw_error_type || "gemini_provider_error";
      primaryError.raw_error_type = "groq_api_key_missing";
      primaryError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: 0
      };
      throw primaryError;
    }

    try {
      const fallback = await callGroq({
        prompt,
        apiKey: fallbackApiKey
      });
      const fallbackLatencyMs = Number(fallback?.latency_ms || 0);
      return {
        raw_text: fallback.raw_text,
        provider_used: "groq",
        fallback_reason: primaryError.raw_error_type || "gemini_provider_error",
        raw_error_type: primaryError.raw_error_type || "gemini_provider_error",
        latency: {
          total_ms: elapsedMs(startedAt),
          primary_ms: primaryLatencyMs,
          fallback_ms: fallbackLatencyMs
        }
      };
    } catch (fallbackError) {
      fallbackError.provider_used = "groq";
      fallbackError.fallback_reason = primaryError.raw_error_type || "gemini_provider_error";
      fallbackError.primary_raw_error_type = primaryError.raw_error_type || "gemini_provider_error";
      fallbackError.latency = {
        total_ms: elapsedMs(startedAt),
        primary_ms: primaryLatencyMs,
        fallback_ms: Number(fallbackError?.latency_ms || 0)
      };
      throw fallbackError;
    }
  }
}

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(nowMs() - startedAt));
}

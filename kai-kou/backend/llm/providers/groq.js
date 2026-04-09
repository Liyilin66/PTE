import { createProviderError, toProviderError } from "../provider-error.js";

const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_TIMEOUT_MS = 8000;

let hasWarnedLegacyGroqKey = false;
let hasLoggedGroqKeySuffix = false;

export async function callGroq({ prompt, apiKey, model, timeoutMs } = {}) {
  const resolvedApiKey = `${apiKey || getGroqApiKeyFromEnv() || ""}`.trim();
  if (!resolvedApiKey) {
    throw createProviderError("groq", {
      message: "Groq API key is missing",
      status: 500,
      raw_error_type: "groq_api_key_missing",
      fallback_allowed: false
    });
  }

  const resolvedModel = `${model || process.env.LLM_GROQ_MODEL || DEFAULT_GROQ_MODEL}`.trim() || DEFAULT_GROQ_MODEL;
  const resolvedTimeoutMs = toPositiveInt(timeoutMs, process.env.LLM_FALLBACK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const startedAt = nowMs();
  maybeLogGroqKeySuffix(resolvedApiKey, resolveGroqKeySource(apiKey));

  try {
    const response = await fetchWithTimeout(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedApiKey}`
        },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [{ role: "user", content: `${prompt || ""}` }],
          response_format: { type: "json_object" }
        })
      },
      resolvedTimeoutMs
    );

    const data = await safeReadJson(response);
    if (!response.ok) {
      const message = extractGroqErrorMessage(data) || `Groq request failed with status ${response.status}`;
      throw createProviderError("groq", {
        message,
        status: response.status
      });
    }

    const rawText = data?.choices?.[0]?.message?.content;
    if (typeof rawText !== "string" || !rawText.trim()) {
      throw createProviderError("groq", {
        message: "Groq returned empty content",
        status: 502,
        raw_error_type: "groq_empty_content",
        fallback_allowed: false
      });
    }

    return {
      raw_text: rawText,
      provider_used: "groq",
      latency_ms: elapsedMs(startedAt)
    };
  } catch (error) {
    const normalized = toProviderError("groq", error);
    normalized.latency_ms = elapsedMs(startedAt);
    throw normalized;
  }
}

export function getGroqApiKeyFromEnv() {
  const canonical = `${process.env.GROQ_API_KEY || ""}`.trim();
  if (canonical) return canonical;

  const legacy = `${process.env.GROP_API_KEY || ""}`.trim();
  if (legacy) {
    if (!hasWarnedLegacyGroqKey) {
      hasWarnedLegacyGroqKey = true;
      console.warn("[llm] legacy env key GROP_API_KEY detected; please migrate to GROQ_API_KEY.");
    }
    return legacy;
  }

  return "";
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    return await fetch(url, {
      ...init,
      signal: controller?.signal
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractGroqErrorMessage(data) {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  return "";
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

function toPositiveInt(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return Math.floor(num);
  }
  return DEFAULT_TIMEOUT_MS;
}

function maybeLogGroqKeySuffix(apiKey, source) {
  if (hasLoggedGroqKeySuffix) return;
  if (!isDevRuntime()) return;
  const suffix = resolveKeySuffix(apiKey);
  if (!suffix) return;

  hasLoggedGroqKeySuffix = true;
  console.info(`[llm] groq key in use (source=${source}, suffix=${suffix})`);
}

function resolveGroqKeySource(apiKeyArgument) {
  const fromArg = `${apiKeyArgument || ""}`.trim();
  if (fromArg) return "call_arg";
  if (`${process.env.GROQ_API_KEY || ""}`.trim()) return "GROQ_API_KEY";
  if (`${process.env.GROP_API_KEY || ""}`.trim()) return "GROP_API_KEY";
  return "unknown";
}

function resolveKeySuffix(apiKey) {
  const normalized = `${apiKey || ""}`.trim();
  if (!normalized) return "";
  const suffixLength = Math.min(6, Math.max(4, normalized.length));
  return normalized.slice(-suffixLength);
}

function isDevRuntime() {
  const vercelEnv = `${process.env.VERCEL_ENV || ""}`.trim().toLowerCase();
  if (vercelEnv) return vercelEnv !== "production";
  const nodeEnv = `${process.env.NODE_ENV || ""}`.trim().toLowerCase();
  if (!nodeEnv) return true;
  return nodeEnv !== "production";
}

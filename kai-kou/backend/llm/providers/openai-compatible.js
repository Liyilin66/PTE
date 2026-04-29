import { createProviderError, toProviderError } from "../provider-error.js";

const PROVIDER_NAME = "openai_compatible";
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_MAX_TOKENS = 900;

export function getOpenAICompatibleConfig() {
  return {
    baseUrl: normalizeBaseUrl(process.env.AGENT_OPENAI_BASE_URL),
    apiKey: normalizeText(process.env.AGENT_OPENAI_API_KEY),
    model: normalizeText(process.env.AGENT_OPENAI_MODEL) || DEFAULT_MODEL,
    timeoutMs: toPositiveInt(process.env.AGENT_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxTokens: toPositiveInt(process.env.AGENT_MAX_OUTPUT_TOKENS, DEFAULT_MAX_TOKENS)
  };
}

export async function callOpenAICompatibleChat({
  messages,
  apiKey,
  baseUrl,
  model,
  timeoutMs,
  maxTokens,
  temperature = 0.6
} = {}) {
  const configFromEnv = getOpenAICompatibleConfig();
  const resolvedApiKey = normalizeText(apiKey || configFromEnv.apiKey);
  const resolvedBaseUrl = normalizeBaseUrl(baseUrl || configFromEnv.baseUrl);
  const resolvedModel = normalizeText(model || configFromEnv.model);
  const resolvedTimeoutMs = toPositiveInt(timeoutMs, configFromEnv.timeoutMs, DEFAULT_TIMEOUT_MS);
  const resolvedMaxTokens = toPositiveInt(maxTokens, configFromEnv.maxTokens, 0);
  const startedAt = nowMs();
  let providerRequestMs = 0;
  let providerParseMs = 0;

  if (!resolvedApiKey) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible API key is missing",
      status: 500,
      raw_error_type: `${PROVIDER_NAME}_api_key_missing`,
      fallback_allowed: false
    });
  }

  if (!resolvedBaseUrl) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible base URL is missing",
      status: 500,
      raw_error_type: `${PROVIDER_NAME}_base_url_missing`,
      fallback_allowed: false
    });
  }

  if (!resolvedModel) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible model is missing",
      status: 500,
      raw_error_type: `${PROVIDER_NAME}_model_missing`,
      fallback_allowed: false
    });
  }

  const normalizedMessages = normalizeMessages(messages);
  if (!normalizedMessages.length) {
    throw createProviderError(PROVIDER_NAME, {
      message: "OpenAI-compatible messages are missing",
      status: 400,
      raw_error_type: `${PROVIDER_NAME}_messages_missing`,
      fallback_allowed: false
    });
  }

  try {
    const providerRequestStartedAt = nowMs();
    let response = null;
    try {
      response = await fetchWithTimeout(
        `${resolvedBaseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resolvedApiKey}`
          },
          body: JSON.stringify({
            model: resolvedModel,
            messages: normalizedMessages,
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.35,
            ...(resolvedMaxTokens > 0 ? { max_tokens: resolvedMaxTokens } : {})
          })
        },
        resolvedTimeoutMs
      );
      providerRequestMs = elapsedMs(providerRequestStartedAt);
    } catch (error) {
      providerRequestMs = elapsedMs(providerRequestStartedAt);
      if (isAbortError(error)) {
        throw createProviderError(PROVIDER_NAME, {
          message: "provider_timeout",
          status: 504,
          raw_error_type: `${PROVIDER_NAME}_timeout`,
          fallback_allowed: true,
          cause: error
        });
      }

      throw error;
    }

    const providerParseStartedAt = nowMs();
    const data = await safeReadJson(response);
    if (!response.ok) {
      providerParseMs = elapsedMs(providerParseStartedAt);
      throw createProviderError(PROVIDER_NAME, {
        message: extractProviderErrorMessage(data) || `OpenAI-compatible request failed with status ${response.status}`,
        status: response.status
      });
    }

    const rawText = extractAssistantText(data);
    if (!rawText) {
      providerParseMs = elapsedMs(providerParseStartedAt);
      throw createProviderError(PROVIDER_NAME, {
        message: "OpenAI-compatible provider returned empty content",
        status: 502,
        raw_error_type: `${PROVIDER_NAME}_empty_content`,
        fallback_allowed: false
      });
    }
    providerParseMs = elapsedMs(providerParseStartedAt);

    return {
      raw_text: rawText,
      provider_used: PROVIDER_NAME,
      latency_ms: elapsedMs(startedAt),
      provider_request_ms: providerRequestMs,
      provider_parse_ms: providerParseMs,
      model: resolvedModel,
      usage: data?.usage || null
    };
  } catch (error) {
    const normalized = toProviderError(PROVIDER_NAME, error);
    normalized.latency_ms = elapsedMs(startedAt);
    normalized.provider_request_ms = providerRequestMs;
    normalized.provider_parse_ms = providerParseMs;
    throw normalized;
  }
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

function isAbortError(error) {
  return `${error?.name || ""}`.trim() === "AbortError";
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractProviderErrorMessage(data) {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }
  return "";
}

function extractAssistantText(data) {
  const directContent = data?.choices?.[0]?.message?.content;
  const normalizedDirect = normalizeContent(directContent);
  if (normalizedDirect) return normalizedDirect;

  const toolStyle = data?.choices?.[0]?.message?.output_text;
  return normalizeContent(toolStyle);
}

function normalizeContent(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (typeof item?.text === "string") return item.text.trim();
      if (typeof item?.content === "string") return item.content.trim();
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((item) => ({
      role: normalizeRole(item?.role),
      content: normalizeText(item?.content)
    }))
    .filter((item) => item.content);
}

function normalizeRole(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "system" || normalized === "assistant" || normalized === "user") {
    return normalized;
  }
  return "user";
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, "");
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function toPositiveInt(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return Math.floor(num);
  }
  return 0;
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

import { supabase } from "@/lib/supabase";

export const LOGIN_EVENTS_LIMIT = 5;

export function createEmptyLoginEventsSnapshot() {
  return {
    loading: true,
    rows: [],
    source: "pending",
    error: null
  };
}

export async function recordLoginEvent(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) return null;

  const device = detectLoginEventDevice();
  const payload = {
    user_id: userId,
    device_label: normalizePayloadText(device.device_label, "当前浏览器设备"),
    browser: normalizePayloadText(device.browser, "浏览器"),
    os: normalizePayloadText(device.os, "未知系统")
  };

  const { data, error } = await supabase
    .from("user_login_events")
    .insert(payload)
    .select("id, user_id, device_label, browser, os, created_at")
    .single();

  if (error) throw error;
  return normalizeLoginEventRow(data);
}

export async function loadLoginEventsForAuth(authStore, limit = LOGIN_EVENTS_LIMIT) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) {
    return {
      ...createEmptyLoginEventsSnapshot(),
      loading: false,
      source: "anonymous"
    };
  }

  try {
    const normalizedLimit = clampInteger(limit, 1, LOGIN_EVENTS_LIMIT);
    const { data, error } = await supabase
      .from("user_login_events")
      .select("id, user_id, device_label, browser, os, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(normalizedLimit);

    if (error) throw error;

    return {
      loading: false,
      rows: (Array.isArray(data) ? data : []).map(normalizeLoginEventRow).filter(Boolean),
      source: "supabase",
      error: null
    };
  } catch (error) {
    if (isMissingLoginEventsTableError(error)) {
      return {
        ...createEmptyLoginEventsSnapshot(),
        loading: false,
        source: "table_missing",
        error
      };
    }

    console.warn("Login events load failed:", error);
    return {
      ...createEmptyLoginEventsSnapshot(),
      loading: false,
      source: "error",
      error
    };
  }
}

export function detectLoginEventDevice() {
  const ua = typeof navigator === "undefined" ? "" : String(navigator.userAgent || "");
  const os = detectOs(ua);
  const browser = detectBrowser(ua);
  const deviceLabel = detectDeviceLabel(ua, os);

  return {
    device_label: deviceLabel,
    browser,
    os
  };
}

export function formatLoginEventMeta(row) {
  const browser = normalizeText(row?.browser);
  const os = normalizeText(row?.os);
  return [os, browser].filter(Boolean).join(" · ") || "设备信息未记录";
}

export function normalizeLoginEventRow(row) {
  if (!row || typeof row !== "object") return null;

  return {
    id: row.id,
    user_id: normalizeText(row.user_id),
    device_label: normalizeText(row.device_label) || "设备未记录",
    browser: normalizeText(row.browser) || "浏览器未记录",
    os: normalizeText(row.os) || "系统未记录",
    created_at: normalizeText(row.created_at)
  };
}

async function resolveCurrentUserId(authStore) {
  const authUserId = normalizeText(authStore?.user?.id);
  if (authUserId) return authUserId;

  const { data } = await supabase.auth.getSession();
  return normalizeText(data?.session?.user?.id);
}

function detectDeviceLabel(ua, os) {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "Android Phone";
  if (/Android/i.test(ua)) return "Android Tablet";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows PC";
  if (/Linux/i.test(ua)) return "Linux PC";
  return os && os !== "未知系统" ? `${os} 设备` : "当前浏览器设备";
}

function detectOs(ua) {
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "未知系统";
}

function detectBrowser(ua) {
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/CriOS/i.test(ua)) return "Chrome";
  if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) return "Chrome 浏览器";
  if (/Safari\//i.test(ua) && !/Chrome|CriOS|Android/i.test(ua)) return "Safari";
  return "浏览器";
}

function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return max;
  return Math.min(max, Math.max(min, Math.trunc(number)));
}

function isMissingLoginEventsTableError(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message).toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    (message.includes("relation") && message.includes("user_login_events")) ||
    message.includes("could not find the table")
  );
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizePayloadText(value, fallback) {
  return (normalizeText(value) || fallback).slice(0, 80);
}

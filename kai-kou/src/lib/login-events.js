import { supabase } from "@/lib/supabase";

export const LOGIN_EVENT_LIMIT = 5;

const MISSING_LOGIN_EVENTS_TABLE_CODES = new Set(["42P01", "PGRST205"]);

export function createEmptyLoginEventsSnapshot() {
  return {
    loading: true,
    events: [],
    source: "loading",
    error: null
  };
}

export async function recordLoginEventForUser(userId) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return null;

  const device = parseCurrentDevice();
  const payload = {
    user_id: normalizedUserId,
    device_label: device.device_label,
    browser: device.browser,
    os: device.os
  };

  const { data, error } = await supabase
    .from("user_login_events")
    .insert(payload)
    .select("id, user_id, logged_in_at, device_label, browser, os, created_at")
    .maybeSingle();

  if (error) {
    if (isMissingLoginEventsTableError(error)) return null;
    throw error;
  }
  return normalizeLoginEventRow(data);
}

export async function loadLoginEventsForAuth(authStore) {
  const userId = await resolveCurrentUserId(authStore);
  if (!userId) {
    return {
      ...createEmptyLoginEventsSnapshot(),
      loading: false,
      source: "auth_missing"
    };
  }

  try {
    const { data, error } = await supabase
      .from("user_login_events")
      .select("id, user_id, logged_in_at, device_label, browser, os, created_at")
      .eq("user_id", userId)
      .order("logged_in_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LOGIN_EVENT_LIMIT);

    if (error) {
      if (isMissingLoginEventsTableError(error)) {
        return {
          ...createEmptyLoginEventsSnapshot(),
          loading: false,
          source: "missing_table"
        };
      }
      throw error;
    }

    return {
      loading: false,
      events: (Array.isArray(data) ? data : []).map(normalizeLoginEventRow).filter(Boolean),
      source: "remote",
      error: null
    };
  } catch (error) {
    console.warn("Login events load failed:", error);
    return {
      ...createEmptyLoginEventsSnapshot(),
      loading: false,
      source: "error",
      error
    };
  }
}

export function parseCurrentDevice() {
  if (typeof navigator === "undefined") {
    return {
      device_label: "Unknown Device",
      browser: "Unknown Browser",
      os: "Unknown OS"
    };
  }

  return parseUserAgent(navigator.userAgent || "");
}

export function parseUserAgent(userAgent) {
  const ua = normalizeText(userAgent);
  const os = detectOS(ua);
  const browser = detectBrowser(ua);
  const device_label = detectDeviceLabel(ua, os);

  return {
    device_label,
    browser,
    os
  };
}

export function formatLoginEventDevice(event) {
  const deviceLabel = normalizeText(event?.device_label);
  if (deviceLabel) return deviceLabel;

  const os = normalizeText(event?.os);
  if (os === "Windows") return "Windows PC";
  if (os === "macOS") return "Mac";
  if (os === "iOS") return "iPhone";
  if (os === "iPadOS") return "iPad";
  if (os === "Android") return "Android Device";
  return "Unknown Device";
}

function detectOS(ua) {
  if (!ua) return "Unknown OS";
  if (/ipad/i.test(ua)) return "iPadOS";
  if (/iphone|ipod/i.test(ua)) return "iOS";
  if (/macintosh/i.test(ua) && /mobile/i.test(ua)) return "iPadOS";
  if (/android/i.test(ua)) return "Android";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/mac os x|macintosh/i.test(ua)) return "macOS";
  return "Unknown OS";
}

function detectBrowser(ua) {
  if (!ua) return "Unknown Browser";
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua) && !/edg\//i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) return "Safari";
  return "Unknown Browser";
}

function detectDeviceLabel(ua, os) {
  if (/ipad/i.test(ua)) return "iPad";
  if (/iphone|ipod/i.test(ua)) return "iPhone";
  if (/macintosh/i.test(ua) && /mobile/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return /mobile/i.test(ua) ? "Android Phone" : "Android Tablet";
  if (os === "Windows") return "Windows PC";
  if (os === "macOS") return "Mac";
  return "Unknown Device";
}

async function resolveCurrentUserId(authStore) {
  const authUserId = normalizeText(authStore?.user?.id);
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return normalizeText(data?.session?.user?.id);
}

function normalizeLoginEventRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: normalizeText(row.id),
    user_id: normalizeText(row.user_id),
    logged_in_at: normalizeText(row.logged_in_at),
    device_label: normalizeText(row.device_label),
    browser: normalizeText(row.browser),
    os: normalizeText(row.os),
    created_at: normalizeText(row.created_at)
  };
}

function isMissingLoginEventsTableError(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message);
  return MISSING_LOGIN_EVENTS_TABLE_CODES.has(code) || /user_login_events/i.test(message) && /schema cache|does not exist|not find/i.test(message);
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

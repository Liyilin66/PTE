import { defineStore } from "pinia";
import { getApiUrl } from "@/lib/api-url";
import { ACCESS_STATUS, getAccessStatus } from "@/lib/access-status";
import { supabase } from "@/lib/supabase";

let initPromise = null;
let authSubscription = null;
const RESET_PASSWORD_PATH = "/reset-password";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    session: null,
    profile: null,
    isPremium: false,
    isInTrial: false,
    trialDaysLeft: 0,
    accessStatus: ACCESS_STATUS.NOT_OPENED,
    canPractice: false,
    canUseAiScoring: false,
    loaded: false,
    initialized: false
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.session && state.user),
    displayName(state) {
      return resolveUserDisplayName(state.user, state.profile);
    },
    avatarUrl(state) {
      return resolveAvatarUrl(state.user, state.profile);
    },
    statusText(state) {
      if (state.accessStatus === ACCESS_STATUS.VIP) return "✅ VIP · 无限练习";
      if (state.accessStatus === ACCESS_STATUS.TRIAL) return `试用中 · 剩余 ${state.trialDaysLeft} 天`;
      if (state.accessStatus === ACCESS_STATUS.TRIAL_EXPIRED) return "试用已结束";
      return "未开通";
    },
    isLimited(state) {
      return !state.canUseAiScoring;
    }
  },

  actions: {
    async init() {
      if (this.initialized) return;
      if (initPromise) {
        await initPromise;
        return;
      }

      initPromise = (async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.error("getSession error:", error);
        }

        this.session = data?.session || null;
        this.user = data?.session?.user || null;

        if (this.user) {
          await this.loadStatus();
        } else {
          this.resetUsageState();
          this.loaded = true;
        }

        if (!authSubscription) {
          const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            this.session = session || null;
            this.user = session?.user || null;

            if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
              setTimeout(() => {
                this.loadStatus();
              }, 0);
            }

            if (event === "SIGNED_OUT") {
              this.resetUsageState();
              this.loaded = false;
            }

            if (event === "PASSWORD_RECOVERY") {
              redirectToResetPassword();
            }
          });

          authSubscription = authListener?.subscription || null;
        }

        this.initialized = true;
      })();

      try {
        await initPromise;
      } finally {
        initPromise = null;
      }
    },

    resetUsageState() {
      this.profile = null;
      this.isPremium = false;
      this.isInTrial = false;
      this.trialDaysLeft = 0;
      this.accessStatus = ACCESS_STATUS.NOT_OPENED;
      this.canUseAiScoring = false;
      this.canPractice = false;
    },

    async sendRegisterCode(email) {
      const response = await fetch(getApiUrl("/api/auth/send-register-code"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email
        })
      });

      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw createApiError(payload, "发送验证码失败，请稍后重试");
      }

      return payload;
    },

    async registerWithCode({ username, email, verificationCode, password, confirmPassword }) {
      const response = await fetch(getApiUrl("/api/auth/register-with-code"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          email,
          verificationCode,
          password,
          confirmPassword
        })
      });

      const payload = await readJsonPayload(response);
      if (!response.ok) {
        throw createApiError(payload, "注册失败，请稍后重试");
      }

      try {
        await this.login(email, password);
        return {
          ...payload,
          autoLoggedIn: true
        };
      } catch (loginError) {
        return {
          ...payload,
          autoLoggedIn: false,
          loginError
        };
      }
    },

    async login(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      this.session = data?.session || null;
      this.user = data?.user || null;

      if (this.user) {
        await this.loadStatus();
      }

      return data;
    },

    async logout() {
      await supabase.auth.signOut();
      this.session = null;
      this.user = null;
      this.resetUsageState();
      this.loaded = true;
    },

    async forgotPassword(email) {
      const redirectBase = getAuthRedirectBase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}${RESET_PASSWORD_PATH}`
      });

      if (error) throw error;
    },

    async resetPassword(newPassword) {
      const update = async () => {
        const { error } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (error) throw error;
      };

      try {
        await update();
      } catch (error) {
        if (isAuthLockRaceError(error)) {
          await new Promise((resolve) => setTimeout(resolve, 120));
          await update();
          return;
        }
        throw error;
      }
    },

    async updateAvatarDataUrl(dataUrl) {
      const normalizedAvatar = normalizeAvatarUrl(dataUrl);
      if (!normalizedAvatar) {
        throw new Error("头像数据无效，请重新选择图片");
      }

      const currentMeta =
        this.user?.user_metadata && typeof this.user.user_metadata === "object"
          ? this.user.user_metadata
          : {};

      const { data, error } = await supabase.auth.updateUser({
        data: {
          ...currentMeta,
          avatar_url: normalizedAvatar,
          avatar_updated_at: new Date().toISOString()
        }
      });

      if (error) throw error;

      if (data?.user) {
        this.user = data.user;
        if (this.session) {
          this.session = {
            ...this.session,
            user: data.user
          };
        }
      }

      return normalizedAvatar;
    },

    async loadStatus() {
      if (!this.user) {
        this.resetUsageState();
        this.loaded = true;
        return;
      }

      try {
        let { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", this.user.id)
          .single();

        if (profileError || !profile) {
          console.warn("Profile not found, retrying in 1s...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const retry = await supabase
            .from("profiles")
            .select("*")
            .eq("id", this.user.id)
            .single();
          profile = retry.data;
          profileError = retry.error;
        }

        if (profileError && profileError.code !== "PGRST116") throw profileError;

        this.profile = profile || null;
        const access = getAccessStatus(this.user, profile);
        applyAccessState(this, access);
        this.loaded = true;
      } catch (error) {
        console.error("loadStatus error:", error);
        this.resetUsageState();
        this.loaded = true;
      }
    },

    decrementRemaining() {
      // Compatibility no-op: permission is no longer based on daily counters.
      this.canPractice = this.canUseAiScoring;
    }
  }
});

function applyAccessState(store, access) {
  store.isPremium = access.isPremium;
  store.isInTrial = access.isInTrial;
  store.trialDaysLeft = access.trialDaysLeft;
  store.accessStatus = access.accessStatus;
  store.canUseAiScoring = access.canUseAiScoring;
  store.canPractice = access.canUseAiScoring;
}

function isAuthLockRaceError(error) {
  const message = String(error?.message || "");
  return message.includes("was released because another request stole it");
}

function getAuthRedirectBase() {
  const envUrl = normalizeAbsoluteUrl(import.meta.env.VITE_APP_URL);

  if (typeof window === "undefined") {
    return envUrl || "";
  }

  const currentOrigin = normalizeAbsoluteUrl(window.location.origin);
  if (!envUrl) return currentOrigin;

  const envHost = getHostname(envUrl);
  const currentHost = getHostname(currentOrigin);

  if (isLocalHostname(envHost) && currentHost && !isLocalHostname(currentHost)) {
    return currentOrigin;
  }

  return envUrl;
}

function redirectToResetPassword() {
  if (typeof window === "undefined" || !window.__vue_router__) return;
  if (window.__vue_router__.currentRoute?.value?.path === RESET_PASSWORD_PATH) return;
  window.__vue_router__.replace(RESET_PASSWORD_PATH).catch(() => {});
}

function normalizeAbsoluteUrl(value) {
  const normalized = `${value || ""}`.trim().replace(/\/+$/, "");
  if (!normalized) return "";

  try {
    return new URL(normalized).toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
}

function resolveUserDisplayName(user, profile) {
  const candidates = [
    profile?.display_name,
    profile?.username,
    profile?.name,
    profile?.full_name,
    user?.user_metadata?.display_name,
    user?.user_metadata?.username,
    user?.user_metadata?.name,
    getEmailLocalPart(user?.email)
  ];

  for (const candidate of candidates) {
    const normalized = normalizeDisplayValue(candidate);
    if (normalized) return normalized;
  }

  return "同学";
}

function getEmailLocalPart(email) {
  const normalizedEmail = normalizeDisplayValue(email);
  if (!normalizedEmail) return "";

  const atIndex = normalizedEmail.indexOf("@");
  if (atIndex <= 0) return normalizedEmail;
  return normalizedEmail.slice(0, atIndex).trim();
}

function normalizeDisplayValue(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function resolveAvatarUrl(user, profile) {
  const candidates = [
    profile?.avatar_url,
    profile?.avatarUrl,
    profile?.photo_url,
    profile?.photoUrl,
    user?.user_metadata?.avatar_url,
    user?.user_metadata?.avatarUrl,
    user?.user_metadata?.photo_url,
    user?.user_metadata?.photoUrl,
    user?.user_metadata?.picture
  ];

  for (const candidate of candidates) {
    const normalized = normalizeAvatarUrl(candidate);
    if (normalized) return normalized;
  }

  return "";
}

function normalizeAvatarUrl(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.startsWith("data:image/")) return normalized;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return "";
}

async function readJsonPayload(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function createApiError(payload, fallbackMessage) {
  const error = new Error(payload?.message || fallbackMessage);
  error.code = payload?.error || "api_error";
  error.payload = payload;
  return error;
}

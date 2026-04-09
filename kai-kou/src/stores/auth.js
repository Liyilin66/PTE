import { defineStore } from "pinia";
import { supabase } from "@/lib/supabase";

const ACCESS_STATUS = {
  VIP: "vip",
  TRIAL: "trial",
  TRIAL_EXPIRED: "trial_expired",
  NOT_OPENED: "not_opened"
};

let initPromise = null;
let authSubscription = null;

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    session: null,
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
              if (typeof window !== "undefined" && window.__vue_router__) {
                window.__vue_router__.push("/reset-password");
              }
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
      this.isPremium = false;
      this.isInTrial = false;
      this.trialDaysLeft = 0;
      this.accessStatus = ACCESS_STATUS.NOT_OPENED;
      this.canUseAiScoring = false;
      this.canPractice = false;
    },

    async register(email, password) {
      const redirectBase = import.meta.env.VITE_APP_URL || window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${redirectBase}/home`
        }
      });

      if (error) throw error;
      return data;
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
      const redirectBase = import.meta.env.VITE_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${redirectBase}/reset-password`
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

    async loadStatus() {
      if (!this.user) {
        this.resetUsageState();
        this.loaded = true;
        return;
      }

      try {
        let { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("is_premium, trial_days, trial_granted_at")
          .eq("id", this.user.id)
          .single();

        if (profileError || !profile) {
          console.warn("Profile not found, retrying in 1s...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          const retry = await supabase
            .from("profiles")
            .select("is_premium, trial_days, trial_granted_at")
            .eq("id", this.user.id)
            .single();
          profile = retry.data;
          profileError = retry.error;
        }

        if (profileError && profileError.code !== "PGRST116") throw profileError;

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

function getAccessStatus(user, profile) {
  const now = new Date();
  const isPremium = Boolean(profile?.is_premium);
  const trialDays = toNonNegativeInteger(profile?.trial_days);
  const registeredAt = parseDateOrFallback(user?.created_at, now);
  const trialStartAt = parseDateOrFallback(profile?.trial_granted_at, registeredAt);
  const trialDaysLeft = trialDays > 0 ? Math.max(0, trialDays - getDaysSince(trialStartAt, now)) : 0;
  const isInTrial = !isPremium && trialDaysLeft > 0;

  let accessStatus = ACCESS_STATUS.NOT_OPENED;
  if (isPremium) accessStatus = ACCESS_STATUS.VIP;
  else if (isInTrial) accessStatus = ACCESS_STATUS.TRIAL;
  else if (trialDays > 0) accessStatus = ACCESS_STATUS.TRIAL_EXPIRED;

  return {
    isPremium,
    isInTrial,
    trialDaysLeft,
    canUseAiScoring: isPremium || isInTrial,
    accessStatus
  };
}

function getDaysSince(fromDate, now = new Date()) {
  const diff = now.getTime() - fromDate.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function parseDateOrFallback(value, fallbackDate) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallbackDate;
  return parsed;
}

function toNonNegativeInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function isAuthLockRaceError(error) {
  const message = String(error?.message || "");
  return message.includes("was released because another request stole it");
}


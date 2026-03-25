import { defineStore } from "pinia";
import { supabase } from "@/lib/supabase";

const TRIAL_DAYS = 3;
const DAILY_LIMIT = 3;

let initPromise = null;
let authSubscription = null;

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    session: null,
    isPremium: false,
    isInTrial: false,
    trialDaysLeft: 0,
    remainingToday: DAILY_LIMIT,
    dailyLimit: DAILY_LIMIT,
    canPractice: true,
    loaded: false,
    initialized: false
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.session && state.user),
    statusText(state) {
      if (state.isPremium) return "已解锁 · 无限练习";
      if (state.isInTrial) return `试用期 · 还剩 ${state.trialDaysLeft} 天`;
      return `今日剩余 ${state.remainingToday} / ${state.dailyLimit} 次`;
    },
    isLimited(state) {
      return !state.isPremium && !state.isInTrial && state.remainingToday <= 0;
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
              // Avoid async-await directly inside onAuthStateChange callback to prevent auth lock contention.
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
      this.remainingToday = DAILY_LIMIT;
      this.dailyLimit = DAILY_LIMIT;
      this.canPractice = true;
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

        if (!profile) {
          this.canPractice = true;
          this.loaded = true;
          return;
        }

        this.isPremium = Boolean(profile?.is_premium);

        const daysSince = getDaysSince(this.user.created_at);
        this.isInTrial = daysSince < TRIAL_DAYS;
        this.trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSince);

        const { count, error: countError } = await supabase
          .from("practice_logs")
          .select("*", { count: "exact", head: true })
          .eq("user_id", this.user.id)
          .gte("created_at", getChinaDayStartIsoString());

        if (countError) throw countError;

        const usedToday = Number(count || 0);
        this.remainingToday = Math.max(0, this.dailyLimit - usedToday);
        this.canPractice = this.isPremium || this.isInTrial || this.remainingToday > 0;
        this.loaded = true;
      } catch (error) {
        console.error("loadStatus error:", error);
        this.canPractice = true;
        this.loaded = true;
      }
    },

    decrementRemaining() {
      if (!this.isPremium && !this.isInTrial) {
        this.remainingToday = Math.max(0, this.remainingToday - 1);
        this.canPractice = this.remainingToday > 0;
      }
    }
  }
});

function getDaysSince(createdAt) {
  const created = new Date(createdAt);
  const diff = Date.now() - created.getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getChinaDayStartIsoString() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const utc8Ms = utcMs + 8 * 60 * 60 * 1000;
  const dayStartUTC8Ms = Math.floor(utc8Ms / 86400000) * 86400000;
  const dayStartUtcMs = dayStartUTC8Ms - 8 * 60 * 60 * 1000;
  return new Date(dayStartUtcMs).toISOString();
}

function isAuthLockRaceError(error) {
  const message = String(error?.message || "");
  return message.includes("was released because another request stole it");
}

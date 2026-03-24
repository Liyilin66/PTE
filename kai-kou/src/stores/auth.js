import { defineStore } from "pinia";

const TOKEN_KEY = "kai_kou_token";
const USER_KEY = "kai_kou_user";

function safeGet(key) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) || "";
}

function safeGetJSON(key) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeSet(key, value) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function safeRemove(key) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: safeGet(TOKEN_KEY),
    user: safeGetJSON(USER_KEY),
    isPremium: false,
    isInTrial: true,
    trialDaysLeft: 3,
    remainingToday: 3,
    dailyLimit: 3,
    canPractice: true,
    loaded: false
  }),

  getters: {
    isLoggedIn: (state) => Boolean(state.token),
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
    setAuth(token, user) {
      this.token = token;
      this.user = user;
      safeSet(TOKEN_KEY, token);
      safeSet(USER_KEY, JSON.stringify(user));
    },

    logout() {
      this.token = "";
      this.user = null;
      this.isPremium = false;
      this.isInTrial = true;
      this.trialDaysLeft = 3;
      this.remainingToday = 3;
      this.dailyLimit = 3;
      this.canPractice = true;
      this.loaded = true;
      safeRemove(TOKEN_KEY);
      safeRemove(USER_KEY);
    },

    async loadStatus() {
      if (!this.token) {
        this.loaded = true;
        return;
      }

      try {
        const res = await fetch("/api/user/status", {
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        });

        if (res.status === 401) {
          this.logout();
          return;
        }

        const data = await res.json();
        this.isPremium = Boolean(data.is_premium);
        this.isInTrial = Boolean(data.is_in_trial);
        this.trialDaysLeft = Number(data.trial_days_left ?? 0);
        this.remainingToday = Number(data.remaining_today ?? 0);
        this.dailyLimit = Number(data.daily_limit ?? 3);
        this.canPractice = Boolean(data.can_practice);
        this.loaded = true;
      } catch {
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

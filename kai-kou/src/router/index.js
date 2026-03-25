import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const routes = [
  { path: "/", redirect: "/home" },
  { path: "/auth", name: "auth", component: () => import("@/views/AuthView.vue") },
  { path: "/forgot-password", name: "forgot-password", component: () => import("@/views/ForgotPasswordView.vue") },
  { path: "/reset-password", name: "reset-password", component: () => import("@/views/ResetPasswordView.vue") },
  { path: "/home", name: "home", component: () => import("@/views/HomeView.vue"), meta: { requiresAuth: true } },
  { path: "/ra", name: "ra", component: () => import("@/views/RAView.vue"), meta: { requiresAuth: true } },
  { path: "/ra/list", name: "ra-list", component: () => import("@/views/RAListView.vue"), meta: { requiresAuth: true } },
  { path: "/ra/result", name: "ra-result", component: () => import("@/views/RAResultView.vue"), meta: { requiresAuth: true } },
  { path: "/rs", name: "rs", component: () => import("@/views/RSView.vue"), meta: { requiresAuth: true } },
  { path: "/rs/result", name: "rs-result", component: () => import("@/views/RSResultView.vue"), meta: { requiresAuth: true } },
  { path: "/rl", name: "rl", component: () => import("@/views/RLView.vue"), meta: { requiresAuth: true } },
  { path: "/rl/result", name: "rl-result", component: () => import("@/views/RLResultView.vue"), meta: { requiresAuth: true } },
  { path: "/we", name: "we", component: () => import("@/views/WEView.vue"), meta: { requiresAuth: true } },
  { path: "/wfd", name: "wfd", component: () => import("@/views/WFDView.vue"), meta: { requiresAuth: true } },
  { path: "/wfd/result", name: "wfd-result", component: () => import("@/views/WFDResultView.vue"), meta: { requiresAuth: true } },
  { path: "/limit", name: "limit", component: () => import("@/views/LimitReachedView.vue"), meta: { requiresAuth: true } },
  { path: "/upgrade", name: "upgrade", component: () => import("@/views/UpgradeView.vue"), meta: { requiresAuth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  await authStore.init();

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    return "/auth";
  }

  if (to.path === "/auth" && authStore.isLoggedIn) {
    return "/home";
  }
});

export default router;

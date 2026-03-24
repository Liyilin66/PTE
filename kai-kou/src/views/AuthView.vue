<template>
  <div class="flex min-h-screen items-center justify-center bg-bg px-4">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold text-navy">开口</h1>
        <p class="mt-1 text-muted">PTE 口语备考，开口就练</p>
      </div>

      <div class="mb-6 flex rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
          :class="mode === 'login' ? 'bg-white text-navy shadow-sm' : 'text-muted'"
          @click="mode = 'login'"
        >
          登录
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
          :class="mode === 'register' ? 'bg-white text-navy shadow-sm' : 'text-muted'"
          @click="mode = 'register'"
        >
          注册
        </button>
      </div>

      <div class="space-y-4 rounded-xl bg-white p-6 shadow-md">
        <div>
          <label class="mb-1 block text-sm font-medium text-navy">邮箱</label>
          <input
            v-model="email"
            type="email"
            placeholder="your@email.com"
            class="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-orange focus:outline-none"
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium text-navy">密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="至少 6 位"
            class="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-orange focus:outline-none"
          />
        </div>

        <p v-if="errorMsg" class="text-sm text-red-500">{{ errorMsg }}</p>

        <button
          type="button"
          :disabled="loading"
          class="w-full rounded-xl py-3 font-bold text-white transition-all"
          :class="loading ? 'cursor-not-allowed bg-gray-300' : 'bg-orange hover:opacity-90'"
          @click="handleSubmit"
        >
          {{ loading ? "处理中..." : mode === "login" ? "登录" : "注册并开始试用" }}
        </button>
      </div>

      <p v-if="mode === 'register'" class="mt-4 text-center text-xs text-muted">注册即开始 3 天无限免费试用</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const mode = ref("register");
const email = ref("");
const password = ref("");
const errorMsg = ref("");
const loading = ref(false);

async function handleSubmit() {
  errorMsg.value = "";
  loading.value = true;

  const endpoint = mode.value === "login" ? "/api/auth/login" : "/api/auth/register";

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    });

    const data = await res.json();
    if (!res.ok) {
      errorMsg.value = data.error || "出错了，请重试";
      return;
    }

    authStore.setAuth(data.token, data.user);
    await authStore.loadStatus();
    router.replace("/home");
  } catch {
    errorMsg.value = "网络错误，请检查连接后重试";
  } finally {
    loading.value = false;
  }
}
</script>

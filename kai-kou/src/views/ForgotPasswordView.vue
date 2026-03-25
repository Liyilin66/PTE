<template>
  <div class="min-h-screen bg-bg flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-navy">忘记密码</h1>
        <p class="text-muted mt-1 text-sm">输入注册邮箱，我们发送重置链接</p>
      </div>

      <div v-if="sent" class="bg-white rounded-xl shadow-md p-6 text-center">
        <div class="text-5xl mb-4">📬</div>
        <h2 class="text-lg font-bold text-navy mb-2">重置邮件已发送</h2>
        <p class="text-muted text-sm leading-relaxed mb-6">
          请查收 <strong>{{ email }}</strong> 的邮件，<br />
          点击链接重置密码。链接 1 小时内有效。
        </p>
        <button
          type="button"
          @click="router.push('/auth')"
          class="w-full py-3 rounded-xl border border-gray-200 text-muted hover:border-navy hover:text-navy transition-all"
        >
          返回登录
        </button>
      </div>

      <div v-else class="bg-white rounded-xl shadow-md p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-navy mb-1">注册邮箱</label>
          <input
            v-model="email"
            type="email"
            placeholder="your@email.com"
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-orange text-sm"
            @keyup.enter="handleSubmit"
          />
        </div>

        <p v-if="errorMsg" class="text-red-500 text-sm">{{ errorMsg }}</p>

        <button
          type="button"
          @click="handleSubmit"
          :disabled="loading"
          class="w-full py-3 rounded-xl font-bold text-white transition-all"
          :class="loading ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange hover:opacity-90'"
        >
          {{ loading ? "发送中..." : "发送重置链接" }}
        </button>

        <button type="button" @click="router.push('/auth')" class="w-full py-2 text-sm text-muted hover:text-navy">
          ← 返回登录
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const authStore = useAuthStore();

const email = ref("");
const errorMsg = ref("");
const loading = ref(false);
const sent = ref(false);

async function handleSubmit() {
  const value = email.value.trim();
  if (!value) {
    errorMsg.value = "请输入邮箱";
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    await authStore.forgotPassword(value);
    email.value = value;
    sent.value = true;
  } catch (error) {
    errorMsg.value = error?.message || "发送失败，请重试";
  } finally {
    loading.value = false;
  }
}
</script>

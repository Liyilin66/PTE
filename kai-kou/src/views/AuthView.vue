<template>
  <div class="flex min-h-screen items-center justify-center bg-bg px-4">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <h1 class="text-3xl font-bold text-navy">开口</h1>
        <p class="mt-1 text-sm text-muted">PTE 口语备考，开口就练</p>
      </div>

      <div v-if="registerSuccess" class="rounded-xl bg-white p-6 text-center shadow-md">
        <div class="mb-4 text-5xl">📧</div>
        <h2 class="mb-2 text-lg font-bold text-navy">验证邮件已发送</h2>
        <p class="mb-4 text-sm leading-relaxed text-muted">
          请查收 <strong>{{ registeredEmail }}</strong> 的邮件，点击验证链接后即可登录。
        </p>
        <p class="mb-4 text-xs text-muted">如果没收到，请检查垃圾邮箱或稍后重试。</p>
        <button
          type="button"
          class="w-full rounded-xl bg-orange py-3 font-bold text-white transition-all hover:opacity-90"
          @click="switchToLogin"
        >
          去登录
        </button>
      </div>

      <div v-else>
        <div class="mb-6 flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
            :class="mode === 'login' ? 'bg-white text-navy shadow-sm' : 'text-muted'"
            @click="switchMode('login')"
          >
            登录
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all"
            :class="mode === 'register' ? 'bg-white text-navy shadow-sm' : 'text-muted'"
            @click="switchMode('register')"
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
            <div class="mb-1 flex items-center justify-between">
              <label class="text-sm font-medium text-navy">密码</label>
              <button
                v-if="mode === 'login'"
                type="button"
                class="text-xs text-orange transition-opacity hover:opacity-75"
                @click="router.push('/forgot-password')"
              >
                忘记密码？
              </button>
            </div>
            <input
              v-model="password"
              type="password"
              placeholder="至少 6 位"
              class="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm focus:border-orange focus:outline-none"
              @keyup.enter="handleSubmit"
            />
          </div>

          <p v-if="errorMsg" class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">
            {{ errorMsg }}
          </p>

          <button
            type="button"
            :disabled="loading"
            class="w-full rounded-xl py-3 font-bold text-white transition-all"
            :class="loading ? 'cursor-not-allowed bg-gray-300' : 'bg-orange hover:opacity-90'"
            @click="handleSubmit"
          >
            {{ loading ? "处理中..." : mode === "login" ? "登录" : "注册" }}
          </button>
        </div>

        <p v-if="mode === 'register'" class="mt-4 text-center text-xs text-muted">注册后可由管理员赠送试用，或开通 VIP 使用 AI 评分</p>
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

const mode = ref("login");
const email = ref("");
const password = ref("");
const errorMsg = ref("");
const loading = ref(false);
const registerSuccess = ref(false);
const registeredEmail = ref("");

function switchMode(nextMode) {
  mode.value = nextMode;
  errorMsg.value = "";
}

function switchToLogin() {
  registerSuccess.value = false;
  mode.value = "login";
  errorMsg.value = "";
}

async function handleSubmit() {
  errorMsg.value = "";

  if (!email.value || !password.value) {
    errorMsg.value = "请输入邮箱和密码";
    return;
  }

  if (password.value.length < 6) {
    errorMsg.value = "密码至少 6 位";
    return;
  }

  loading.value = true;

  try {
    if (mode.value === "register") {
      await authStore.register(email.value.trim(), password.value);
      registeredEmail.value = email.value.trim();
      registerSuccess.value = true;
      password.value = "";
      return;
    }

    await authStore.login(email.value.trim(), password.value);
    router.replace("/home");
  } catch (error) {
    const message = error?.message || "";
    if (message.includes("Invalid login credentials")) {
      errorMsg.value = "邮箱或密码错误";
    } else if (message.includes("Email not confirmed")) {
      errorMsg.value = "邮箱未验证，请先查收验证邮件";
    } else if (message.includes("User already registered")) {
      errorMsg.value = "该邮箱已注册，请直接登录";
    } else if (message.includes("Password should be")) {
      errorMsg.value = "密码至少 6 位";
    } else if (message.includes("Database error saving new user")) {
      errorMsg.value = "注册失败：Supabase 用户资料触发器报错，请先修复数据库触发器";
    } else {
      errorMsg.value = message || "操作失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}
</script>

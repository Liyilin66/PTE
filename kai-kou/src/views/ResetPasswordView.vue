<template>
  <div class="min-h-screen bg-bg flex items-center justify-center px-4">
    <div class="w-full max-w-sm">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-navy">设置新密码</h1>
      </div>

      <div v-if="success" class="bg-white rounded-xl shadow-md p-6 text-center">
        <div class="text-5xl mb-4">✅</div>
        <h2 class="text-lg font-bold text-navy mb-2">密码已重置</h2>
        <p class="text-muted text-sm">正在跳转到登录页...</p>
      </div>

      <div v-else class="bg-white rounded-xl shadow-md p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-navy mb-1">新密码</label>
          <input
            v-model="password"
            type="password"
            placeholder="至少 6 位"
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-orange text-sm"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-navy mb-1">确认新密码</label>
          <input
            v-model="confirmPassword"
            type="password"
            placeholder="再输入一次"
            class="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-orange text-sm"
            @keyup.enter="handleSubmit"
          />
        </div>

        <p v-if="errorMsg" class="text-red-500 text-sm">{{ errorMsg }}</p>

        <button
          @click="handleSubmit"
          :disabled="loading || !sessionReady"
          class="w-full py-3 rounded-xl font-bold text-white transition-all"
          :class="(loading || !sessionReady) ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange hover:opacity-90'"
        >
          {{ loading ? "处理中..." : !sessionReady ? "验证中..." : "确认重置" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { supabase } from "@/lib/supabase";

const router = useRouter();

const password = ref("");
const confirmPassword = ref("");
const errorMsg = ref("");
const loading = ref(false);
const success = ref(false);
const sessionReady = ref(false);

let authSubscription = null;

onMounted(async () => {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session) {
    sessionReady.value = true;
    return;
  }

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session) {
      sessionReady.value = true;
    }
  });

  authSubscription = data?.subscription || null;
});

onUnmounted(() => {
  authSubscription?.unsubscribe();
});

async function handleSubmit() {
  errorMsg.value = "";

  if (password.value.length < 6) {
    errorMsg.value = "密码至少 6 位";
    return;
  }

  if (password.value !== confirmPassword.value) {
    errorMsg.value = "两次密码不一致";
    return;
  }

  if (!sessionReady.value) {
    errorMsg.value = "链接已失效，请重新申请";
    return;
  }

  loading.value = true;

  try {
    const { error } = await supabase.auth.updateUser({
      password: password.value
    });
    if (error) throw error;

    success.value = true;
    setTimeout(async () => {
      await supabase.auth.signOut();
      router.push("/auth");
    }, 2000);
  } catch (error) {
    const message = error?.message || "";
    if (message.includes("Auth session missing")) {
      errorMsg.value = "重置链接已失效，请重新申请";
    } else if (message.includes("was released because another request stole it")) {
      errorMsg.value = "系统繁忙，请稍后重试";
    } else {
      errorMsg.value = message || "重置失败，请重新申请链接";
    }
  } finally {
    loading.value = false;
  }
}
</script>

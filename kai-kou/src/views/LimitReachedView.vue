<template>
  <div class="flex min-h-screen flex-col items-center justify-center bg-bg px-6">
    <div class="max-w-sm text-center">
      <div class="mb-6 text-6xl">🌙</div>
      <h1 class="mb-3 text-2xl font-bold text-navy">今日免费次数已用完</h1>
      <p class="mb-2 leading-relaxed text-muted">每天免费 AI 评分 3 次，明天凌晨 12 点自动重置。</p>
      <p class="mb-8 leading-relaxed text-muted">升级后每天无限练习，冲刺目标分。</p>

      <button
        type="button"
        class="mb-3 w-full rounded-xl bg-orange py-4 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90"
        @click="router.push('/upgrade')"
      >
        解锁无限练习
      </button>

      <button
        type="button"
        class="w-full rounded-xl border border-gray-200 py-3 text-muted transition-all hover:border-navy hover:text-navy"
        @click="router.push('/home')"
      >
        明天再来
      </button>

      <p class="mt-6 text-xs text-muted">距离明天重置还有 {{ timeUntilReset }}</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

const router = useRouter();
const timeUntilReset = ref("");
let timerId = null;

function calc() {
  const now = new Date();
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  const diff = Math.max(0, tomorrow - now);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  timeUntilReset.value = `${h} 小时 ${m} 分钟`;
}

onMounted(() => {
  calc();
  timerId = setInterval(calc, 60000);
});

onUnmounted(() => {
  clearInterval(timerId);
  timerId = null;
});
</script>

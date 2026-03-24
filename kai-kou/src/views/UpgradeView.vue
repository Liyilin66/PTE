<template>
  <div class="min-h-screen bg-bg">
    <div class="mx-auto max-w-2xl px-4 py-8">
      <h1 class="text-2xl font-bold text-navy">升级无限练习</h1>
      <p class="mt-2 text-muted">无限 AI 评分、随时练习、不中断冲分。</p>

      <section class="mt-6 rounded-xl border bg-white p-6 shadow-card">
        <p class="text-sm text-muted">当前页面为升级占位。你可以接入支付 API 后在这里完成订阅流程。</p>
        <button
          type="button"
          class="mt-4 rounded-xl border border-gray-200 px-4 py-2 text-sm text-muted transition-all hover:border-navy hover:text-navy"
          @click="router.push('/home')"
        >
          返回首页
        </button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from "vue-router";

const router = useRouter();
</script>

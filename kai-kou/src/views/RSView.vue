<script setup>
import NavBar from "@/components/NavBar.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import TimerBar from "@/components/TimerBar.vue";
import { usePracticeStore } from "@/stores/practice";

const practiceStore = usePracticeStore();

const tips = [
  "专注记住关键的名词、动词和数字",
  "不需要一字不差，踩中50%关键词就通过",
  "保持流利，不要因为忘词而卡壳"
];
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="RS - 复述句子" back-to="/home" />
    <TimerBar :current="1" :total="3" :progress="33" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-card p-8 shadow-card">
        <div class="space-y-4 text-center">
          <p class="text-base text-[#6B7280]">{{ practiceStore.rsPrompt }}</p>
          <button
            type="button"
            class="mx-auto inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#3565B5] px-6 text-sm font-medium text-white transition hover:bg-[#2D5798]"
          >
            <RecordingWave active color-class="bg-white" />
            🔊 播放音频
          </button>
        </div>
      </section>

      <section class="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h2 class="mb-3 font-bold text-[#1A1A2E]">💡 练习技巧</h2>
        <ul class="space-y-2 text-sm text-[#6B7280]">
          <li v-for="tip in tips" :key="tip">• {{ tip }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>

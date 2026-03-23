<script setup>
import NavBar from "@/components/NavBar.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import { usePracticeStore } from "@/stores/practice";

const practiceStore = usePracticeStore();

const tips = [
  "听音频时专注记住3个关键点",
  "准备时间内在模板中填入你记住的关键词",
  "录音时按照模板流利朗读，不要纠结细节",
  "即使记不全也要说完，保持流利度最重要"
];
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="RL - 复述演讲" back-to="/home" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-card p-8 shadow-card">
        <div class="text-center">
          <p class="text-base text-[#6B7280]">点击播放按钮听完整段演讲</p>
          <button
            type="button"
            class="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#7A1DE6] to-[#BC1CFB] px-6 text-sm font-medium text-white"
          >
            <RecordingWave active color-class="bg-white" />
            🔊 播放音频
          </button>
        </div>

        <article class="mt-6 rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
          <h2 class="mb-4 font-bold text-[#1A1A2E]">📝 万能模板</h2>
          <p class="text-base leading-relaxed text-[#1A1A2E]">
            The lecture mainly discusses <span class="bg-[#1F497D] px-1 font-semibold text-white">[TOPIC]</span>.
            The speaker first mentions <span class="bg-[#1F497D] px-1 font-semibold text-white">[POINT 1]</span>, then explains
            <span class="bg-[#1F497D] px-1 font-semibold text-white">[POINT 2]</span>, and finally concludes that
            <span class="bg-[#1F497D] px-1 font-semibold text-white">[CONCLUSION]</span>.
          </p>
          <p class="sr-only">{{ practiceStore.rlTemplate }}</p>
        </article>
      </section>

      <section class="rounded-xl border border-[#DEC8F8] bg-[#F3EFFA] p-5">
        <h2 class="mb-3 font-bold text-[#1A1A2E]">💡 练习技巧</h2>
        <ul class="space-y-2 text-sm text-[#6B7280]">
          <li v-for="tip in tips" :key="tip">• {{ tip }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>

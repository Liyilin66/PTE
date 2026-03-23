<script setup>
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import TimerBar from "@/components/TimerBar.vue";
import { usePracticeStore } from "@/stores/practice";

const practiceStore = usePracticeStore();

const tips = [
  "眼睛跟随高亮光标，不要提前看后面的词",
  "保持匀速，不要因为难词停顿或重复",
  "录音时即使读错也要继续，流利度比准确度更重要"
];
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="RA - 朗读段落" back-to="/home" timer="PREPARING 00:23" />
    <TimerBar :current="1" :total="3" :progress="33" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-card p-8 shadow-card">
        <p class="mb-8 text-base leading-[1.8] text-[#1A1A2E]">
          {{ practiceStore.raPassage }}
        </p>

        <div class="mb-4 rounded-xl border border-[#D4DCE5] bg-white p-4">
          <div class="flex items-center justify-center gap-4">
            <span class="text-sm text-[#6B7280]">节拍速度</span>
            <button type="button" class="h-9 whitespace-nowrap rounded-lg border border-[#D1D5DB] bg-white px-4 text-sm text-[#6B7280]">慢</button>
            <button type="button" class="h-9 whitespace-nowrap rounded-lg bg-navy px-4 text-sm font-medium text-white">正常</button>
            <button type="button" class="h-9 whitespace-nowrap rounded-lg border border-[#D1D5DB] bg-white px-4 text-sm text-[#6B7280]">快</button>
          </div>
        </div>

        <div class="mb-4 flex justify-center gap-4">
          <OrangeButton>
            <span class="inline-flex items-center gap-2">
              <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none" />
              </svg>
              开始
            </span>
          </OrangeButton>
          <button
            type="button"
            class="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#D1D5DB] bg-white px-8 text-sm font-medium text-[#1A1A2E] transition hover:bg-[#F8FAFC]"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
            重置
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

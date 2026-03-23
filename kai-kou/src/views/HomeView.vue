<script setup>
import { storeToRefs } from "pinia";
import NavBar from "@/components/NavBar.vue";
import PracticeCard from "@/components/PracticeCard.vue";
import { usePracticeStore } from "@/stores/practice";

const practiceStore = usePracticeStore();
const { tasks, todayDone, todayTarget, progressPercent } = storeToRefs(practiceStore);
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="PTE 50+ 极速过线包" home show-login />

    <div class="py-4 text-center text-[#1A1A2E]">
      <p class="text-lg">放弃完美，拥抱流利度</p>
    </div>

    <div class="mx-auto max-w-6xl px-4 pb-8">
      <section class="mb-6 rounded-xl border bg-card p-6 shadow-card">
        <div class="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-[#1A1A2E]">14天逆袭进度</h2>
            <p class="text-sm text-[#6B7280]">完成第一题开始计时</p>
          </div>
          <div class="text-right">
            <p class="text-sm text-[#6B7280]">今日练习</p>
            <p class="text-2xl font-bold leading-none text-orange">{{ todayDone }} / {{ todayTarget }}</p>
          </div>
        </div>
        <div class="h-3 rounded-full bg-[#D5D9E0]">
          <div class="h-full rounded-full bg-[#C5CCD6]" :style="{ width: `${progressPercent}%` }" />
        </div>
      </section>

      <section class="mb-6 space-y-4">
        <PracticeCard v-for="task in tasks" :key="task.id" :task="task" />
      </section>

      <section class="rounded-xl border bg-navy p-6 text-white shadow-card">
        <div class="flex items-start gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
            <svg viewBox="0 0 24 24" class="h-6 w-6 text-[#D6E2FF]" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h3 class="mb-3 text-lg font-bold">开发者的14天逆袭故事</h3>
            <p class="mb-4 leading-relaxed text-white/90">
              作为一名英语基础薄弱的留学生，我曾在PTE考试中屡战屡败。传统软件的严苛AI评分让我越练越焦虑。
              后来我发现，PTE的核心不在于完美，而在于
              <span class="font-bold text-[#FF8A4D]">流利度</span>。
              于是我开发了这套“无脑肌肉记忆”训练法，14天从40+冲到了58分，成功赶上了S2开学。
            </p>
            <p class="text-base font-medium text-[#E8845A]">如果我可以，你也可以 💪</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

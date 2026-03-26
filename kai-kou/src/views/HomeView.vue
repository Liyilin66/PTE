<script setup>
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import PracticeCard from "@/components/PracticeCard.vue";
import { usePracticeStore } from "@/stores/practice";

const router = useRouter();
const practiceStore = usePracticeStore();
const { tasks, todayDone, todayTarget, progressPercent } = storeToRefs(practiceStore);

const raTask = computed(() => tasks.value.find((item) => item.id === "ra") || null);
const wfdTask = computed(() => tasks.value.find((item) => item.id === "wfd") || null);
const otherTasks = computed(() => tasks.value.filter((item) => item.id !== "ra" && item.id !== "wfd"));
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="PTE 50+ 速通训练" home show-login />

    <div class="py-4 text-center text-[#1A1A2E]">
      <p class="text-lg">放弃完美，拥抱流利</p>
    </div>

    <div class="mx-auto max-w-6xl px-4 pb-8">
      <section class="mb-6 rounded-xl border bg-card p-6 shadow-card">
        <div class="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-[#1A1A2E]">14天冲刺进度</h2>
            <p class="text-sm text-[#6B7280]">完成第一题后开始计时</p>
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
        <article v-if="raTask" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1E4A86] text-white">
              <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.1">
                <path d="M12 1v11" />
                <path d="M8 6v5a4 4 0 0 0 8 0V6" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v5" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">{{ raTask.title }}</h3>
              <p class="text-sm font-medium text-orange">{{ raTask.subtitle }}</p>
              <p class="mt-1 text-sm text-[#6B7280]">{{ raTask.description }}</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="flex items-center justify-between pb-3">
              <span class="text-xs text-[#6B7280]">今日: {{ raTask.todayCount }} 题</span>
              <span class="text-sm font-medium text-orange">Read Aloud</span>
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 rounded-lg bg-orange py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                @click="router.push('/ra')"
              >
                随机练习
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg border border-orange py-2 text-sm font-semibold text-orange transition-colors hover:bg-orange/5"
                @click="router.push('/ra/list')"
              >
                选题练习
              </button>
            </div>
          </div>
        </article>

        <article v-if="wfdTask" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F3054E] text-white">
              <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 13v-2a8 8 0 1 1 16 0v2" />
                <path d="M4 13v4a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2z" />
                <path d="M20 13v4a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2z" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">{{ wfdTask.title }}</h3>
              <p class="text-sm font-medium text-orange">{{ wfdTask.subtitle }}</p>
              <p class="mt-1 text-sm text-[#6B7280]">{{ wfdTask.description }}</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="flex items-center justify-between pb-3">
              <span class="text-xs text-[#6B7280]">今日: {{ wfdTask.todayCount }} 题</span>
              <span class="text-sm font-medium text-orange">Write from Dictation</span>
            </div>

            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 rounded-lg bg-orange py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                @click="router.push('/wfd')"
              >
                随机练习
              </button>
              <button
                type="button"
                class="flex-1 rounded-lg border border-orange py-2 text-sm font-semibold text-orange transition-colors hover:bg-orange/5"
                @click="router.push('/wfd/list')"
              >
                选题练习
              </button>
            </div>
          </div>
        </article>

        <PracticeCard v-for="task in otherTasks" :key="task.id" :task="task" />
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
              作为一名英语基础薄弱的留学生，我曾在 PTE 考试里屡战屡败。后来我发现，PTE 的核心不在于完美，而在于
              <span class="font-bold text-[#FF8A4D]">流利度</span>。于是我把练习方式改成高频、稳定、可复盘，14 天把分数从 40+ 提升到 58。
            </p>
            <p class="text-base font-medium text-[#E8845A]">如果我可以，你也可以。</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

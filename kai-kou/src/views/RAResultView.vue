<script setup>
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import FeedbackBubble from "@/components/FeedbackBubble.vue";

const metrics = [
  { title: "内容完整度", score: 4 },
  { title: "流利度", score: 5 },
  { title: "发音清晰度", score: 4 },
  { title: "语法用词", score: 3 }
];
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="练习结果" back-to="/ra" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <FeedbackBubble
        title="流利度很好，比上次进步了！ 💪"
        title-class="text-xl font-medium text-white"
        container-class="p-8 mb-6"
        centered
      />

      <section class="rounded-xl border bg-white p-6 shadow-card">
        <div class="grid grid-cols-2 gap-6">
          <article v-for="item in metrics" :key="item.title">
            <h3 class="text-sm text-[#6B7280]">{{ item.title }}</h3>
            <div class="mt-1 flex items-center gap-3">
              <span class="text-4xl font-bold leading-none text-[#1A1A2E]">{{ item.score }}/5</span>
              <div class="mt-1 flex gap-1">
                <span
                  v-for="index in 5"
                  :key="`${item.title}-${index}`"
                  class="h-3 w-3 rounded-full"
                  :class="index <= item.score ? 'bg-[#3565B5]' : 'bg-[#D1D5DB]'"
                />
              </div>
            </div>
          </article>
        </div>
      </section>

      <section class="mt-6 rounded-xl border border-transparent bg-[#1E2A44] p-6 text-white shadow-card">
        <h2 class="mb-3 flex items-center gap-2 font-bold">🎯 教练建议</h2>
        <p class="leading-relaxed text-gray-100">
          注意保持匀速朗读节奏，遇到生词不要停顿，用自然拼读法快速带过即可。
        </p>
      </section>

      <section class="mt-6 grid grid-cols-2 gap-4">
        <OrangeButton to="/ra" tone="outline">再练一次</OrangeButton>
        <OrangeButton to="/ra">下一题 →</OrangeButton>
      </section>
    </main>
  </div>
</template>

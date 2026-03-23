<script setup>
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import FeedbackBubble from "@/components/FeedbackBubble.vue";

const tips = [
  "专注记忆关键的名词和动词",
  "不用纠结语法，按你记住的顺序说出来",
  "踩中50%以上关键词就能通过",
  "保持自信流利，比完美更重要"
];
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="练习结果" back-to="/rs" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <FeedbackBubble
        title="✅ Pass"
        body="关键词踩到 4/5 个"
        tone="green"
        container-class="p-8 mb-6"
        title-class="text-3xl font-bold text-white flex items-center justify-center gap-2"
        body-class="text-lg text-white"
        centered
      />

      <section class="rounded-xl border bg-white p-6 shadow-card">
        <h2 class="mb-3 flex items-center gap-2 font-bold text-[#1A1A2E]">💡 练习技巧</h2>
        <ul class="space-y-2 text-sm text-[#6B7280]">
          <li v-for="tip in tips" :key="tip">• {{ tip }}</li>
        </ul>
      </section>

      <section class="mt-6 grid grid-cols-2 gap-4">
        <OrangeButton to="/rs" tone="outline">再试一次</OrangeButton>
        <OrangeButton to="/rs">下一题 →</OrangeButton>
      </section>
    </main>
  </div>
</template>

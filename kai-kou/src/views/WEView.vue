<script setup>
import { computed, ref } from "vue";
import NavBar from "@/components/NavBar.vue";
import TaskTypeCard from "@/components/TaskTypeCard.vue";

const activeTab = ref("we");
const content = ref("");

const templateText = `In recent years, [YOUR TOPIC] has become a highly debated issue.\n\nI strongly believe that [YOUR OPINION]. Firstly, [REASON 1]. Secondly, [REASON 2].\n\nIn conclusion, [SUMMARY].`;

const insertTemplate = () => {
  content.value = templateText;
};

const wordCount = computed(() => {
  return content.value.trim() ? content.value.trim().split(/\s+/).length : 0;
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="← 写作练习 - 模板拼装台·结构化写作" back-to="/home" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <section class="mb-6 grid grid-cols-2 gap-2">
        <TaskTypeCard label="WE - 大作文(200-300词)" :active="activeTab === 'we'" @click="activeTab = 'we'" />
        <TaskTypeCard label="SWT - 摘要(50-70词)" :active="activeTab === 'swt'" @click="activeTab = 'swt'" />
      </section>

      <section class="mb-4 rounded-xl border bg-white p-6 shadow-card">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-bold text-[#1A1A2E]">写作内容</h2>

          <div class="flex items-center gap-3">
            <p class="text-2xl font-bold text-orange">{{ wordCount }} / 200-300 词</p>
            <button
              type="button"
              class="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#D1D5DB] bg-white px-4 text-sm font-medium text-[#1A1A2E] hover:bg-[#F8FAFC]"
              @click="insertTemplate"
            >
              📄 插入模板
            </button>
          </div>
        </div>

        <textarea
          v-model="content"
          class="min-h-[400px] w-full resize-none rounded-xl border border-[#D1D5DB] bg-white p-4 text-base text-[#2D3748] outline-none placeholder:text-[#73839A] focus:border-[#9BB7E3]"
          placeholder='在此输入作文内容，或点击"插入模板"使用万能模板...'
        />

        <div class="mt-4 flex justify-end gap-3">
          <button
            type="button"
            class="inline-flex h-12 items-center justify-center rounded-lg border border-[#D1D5DB] bg-white px-10 text-sm font-medium text-[#1A1A2E] hover:bg-[#F8FAFC]"
            @click="content = ''"
          >
            清空
          </button>
          <button
            type="button"
            class="inline-flex h-12 items-center justify-center rounded-lg bg-[#8FBDAE] px-10 text-sm font-medium text-white"
          >
            提交作文
          </button>
        </div>
      </section>

      <section class="mb-4 rounded-xl border bg-white p-6 shadow-card">
        <h2 class="mb-3 font-bold text-[#1A1A2E]">📝 模板使用说明</h2>
        <div class="space-y-2 text-sm text-[#6B7280]">
          <p><span class="rounded bg-[#1F497D] px-2 py-0.5 font-mono text-xs text-white">[YOUR TOPIC]</span> - 将方括号内容替换为你的话题</p>
          <p><span class="rounded bg-[#E8845A] px-2 py-0.5 font-mono text-xs text-white">[REASON 1]</span> - 填入你的论点和理由</p>
          <p class="mt-2 italic">💡 提示：点击方括号内容可快速选中并替换</p>
        </div>
      </section>

      <section class="rounded-xl border border-[#AFE8C7] bg-[#EAF8F0] p-6">
        <h2 class="mb-3 font-bold text-[#1A1A2E]">💡 练习技巧</h2>
        <ul class="space-y-2 text-sm text-[#6B7280]">
          <li>• 使用模板确保文章结构完整</li>
          <li>• 每段写3-4句话，避免过长或过短</li>
          <li>• 浏览器会自动标红拼写错误，注意检查</li>
          <li>• 字数控制在200-300词之间</li>
        </ul>
      </section>
    </main>
  </div>
</template>

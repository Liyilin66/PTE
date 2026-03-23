<script setup>
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import TimerBar from "@/components/TimerBar.vue";

const tips = [
  "可以多次播放音频，直到听清为止",
  "注意单词拼写，拼错也会失分",
  "优先记住关键词（名词、动词、数字）",
  "常见连词（and, the, is）也要写全"
];
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="WFD - 听写句子" back-to="/home" />
    <TimerBar :current="1" :total="3" :progress="33" :show-next="false" />

    <main class="mx-auto max-w-4xl px-4 py-6">
      <section class="mb-4 rounded-xl border bg-white p-8 shadow-card">
        <div class="text-center">
          <p class="text-base text-[#6B7280]">点击播放按钮听音频，可以播放多次</p>
          <button
            type="button"
            class="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-red-600 px-8 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <RecordingWave active color-class="bg-white" />
            🔊 播放音频
          </button>
        </div>

        <div class="mx-auto mt-8 max-w-3xl">
          <label class="mb-2 block text-base text-[#1A1A2E]">输入你听到的句子：</label>
          <input
            type="text"
            disabled
            placeholder="Type what you hear..."
            class="h-14 w-full rounded-md border border-[#D1D5DB] bg-white px-4 text-lg text-[#4A5E7A] placeholder:text-[#4A5E7A]"
          />
        </div>

        <div class="mt-6 flex justify-center">
          <OrangeButton tone="soft">提交答案</OrangeButton>
        </div>
      </section>

      <section class="rounded-xl border border-[#F2BCC9] bg-[#F7EFF2] p-5">
        <h2 class="mb-3 font-bold text-[#1A1A2E]">💡 练习技巧</h2>
        <ul class="space-y-2 text-sm text-[#6B7280]">
          <li v-for="tip in tips" :key="tip">• {{ tip }}</li>
        </ul>
      </section>
    </main>
  </div>
</template>

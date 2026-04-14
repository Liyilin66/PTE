<script setup>
import { useRouter } from "vue-router";

const router = useRouter();

function goBack() {
  router.push("/home");
}

function goRTSHome() {
  router.push("/rts");
}
</script>

<template>
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 transition-opacity hover:opacity-90" @click="goBack">← 返回首页</button>
        <p class="text-base font-semibold">RTS 模版库</p>
        <button type="button" class="text-xs text-white/80 transition-opacity hover:opacity-90" @click="goRTSHome">RTS 首页</button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-6">
      <section class="rounded-[14px] border border-[#E8EDF5] bg-white p-6 text-center">
        <p class="text-base font-semibold text-[#1E293B]">模版库建设中</p>
        <p class="mt-2 text-sm text-[#8CA0C0]">该页面当前为空，后续会补充 RTS 场景模板内容。</p>
      </section>
    </main>
  </div>
</template>


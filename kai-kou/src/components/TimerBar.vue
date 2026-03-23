<script setup>
const props = defineProps({
  current: {
    type: Number,
    default: 1
  },
  total: {
    type: Number,
    default: 3
  },
  progress: {
    type: Number,
    default: 33
  },
  showNext: {
    type: Boolean,
    default: true
  },
  nextLabel: {
    type: String,
    default: "下一题"
  }
});
</script>

<template>
  <div class="border-b border-gray-200 bg-white">
    <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
      <span class="text-sm font-medium text-[#6B7280]">题目 {{ current }} / {{ total }}</span>
      <button
        v-if="showNext"
        type="button"
        class="text-sm font-medium text-[#2E5EA8] transition hover:underline"
      >
        {{ nextLabel }}
      </button>
      <span v-else class="w-10" />
    </div>
    <div class="h-1 bg-gray-200">
      <div class="h-full bg-[#2E5EA8] transition-all duration-300" :style="{ width: `${progress}%` }" />
    </div>
  </div>
</template>

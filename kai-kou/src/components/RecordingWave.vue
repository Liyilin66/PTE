<script setup>
defineProps({
  active: {
    type: Boolean,
    default: false
  },
  colorClass: {
    type: String,
    default: "bg-white"
  }
});

const bars = [10, 14, 8, 18, 12];
</script>

<template>
  <div class="flex h-5 items-end gap-1" :class="active ? 'opacity-100' : 'opacity-40'">
    <span
      v-for="(height, index) in bars"
      :key="index"
      class="inline-block w-1 rounded-full transition-all duration-300"
      :class="[colorClass, active ? 'animate-pulse' : '']"
      :style="{ height: `${height}px`, animationDelay: `${index * 90}ms` }"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import TimerBar from "@/components/TimerBar.vue";
import { useTimer } from "@/composables/useTimer";
import { useUIStore } from "@/stores/ui";

const uiStore = useUIStore();
const timer = useTimer();

const phase = ref("playing");
const answer = ref("");
const replaysLeft = ref(2);
const isPlayback = computed(() => phase.value === "playing");

function startPlayback(isInitial = false) {
  if (phase.value === "playing") return;
  if (!isInitial && replaysLeft.value <= 0) return;

  if (!isInitial) {
    replaysLeft.value -= 1;
  }

  phase.value = "playing";
  timer.start(3, () => {
    phase.value = "typing";
  });
}

function submitAnswer() {
  if (!answer.value.trim()) {
    uiStore.showToast("Please type what you heard first.", "warning");
    return;
  }

  uiStore.showToast("Your answer is received. Scoring will be available soon.", "success");
}

onMounted(() => {
  phase.value = "idle";
  startPlayback(true);
});

onUnmounted(() => {
  timer.stop();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Write From Dictation" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <section class="rounded-xl border bg-white p-6 shadow-card">
        <p class="text-sm text-muted">
          {{ phase === "playing" ? "Audio is playing..." : "Type the sentence you heard." }}
        </p>

        <div class="mt-4">
          <TimerBar label="Playback" :remaining="timer.remaining" :progress="timer.progress" :is-warning="false" />
        </div>

        <div class="mt-5 flex items-center gap-3">
          <button
            type="button"
            class="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="isPlayback || replaysLeft <= 0"
            @click="startPlayback()"
          >
            Replay Audio
          </button>
          <span class="text-sm text-muted">Replays left: {{ replaysLeft }}</span>
        </div>

        <div class="mt-5">
          <label class="mb-2 block text-sm font-medium text-text">Your answer</label>
          <input
            v-model="answer"
            type="text"
            placeholder="Type what you hear..."
            class="h-12 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none"
          />
        </div>

        <div class="mt-5 flex justify-end">
          <OrangeButton @click="submitAnswer">Submit</OrangeButton>
        </div>
      </section>
    </main>
  </div>
</template>

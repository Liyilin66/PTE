<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import TimerBar from "@/components/TimerBar.vue";
import { getRandomQuestion } from "@/lib/questions";
import { useRecorder } from "@/composables/useRecorder";
import { useTimer } from "@/composables/useTimer";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";

const defaultQuestion = {
  id: "RA_FALLBACK",
  content: "Please read the passage aloud.",
  difficulty: 2
};

const router = useRouter();
const practiceStore = usePracticeStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const recorder = useRecorder();
const timer = useTimer();

const questionIndex = ref(1);
const phase = computed(() => practiceStore.phase);
const questionLoading = ref(true);
const question = ref({ ...defaultQuestion });

const wordCount = computed(() => (question.value?.content || "").split(/\s+/).filter(Boolean).length);
const difficultyLabel = computed(() => {
  const difficulty = Number(question.value?.difficulty || 2);
  if (difficulty <= 1) return "Easy";
  if (difficulty >= 3) return "Hard";
  return "Medium";
});

const recordingSeconds = ref(0);
const canSubmit = computed(() => phase.value === "recording" && recordingSeconds.value >= 3);

const tips = [
  "Pause naturally at commas when the sentence is long.",
  "Slow down a little on names and place words for clarity.",
  "Keep your pace stable instead of speeding up when nervous."
];

const historicalStats = {
  bestScore: 79,
  totalAttempts: 12
};

let unmounted = false;
let isSubmitting = false;
let isStartingRecording = false;
let recordingTicker = null;

function startRecordingTicker() {
  stopRecordingTicker();
  recordingSeconds.value = 0;
  recordingTicker = setInterval(() => {
    recordingSeconds.value += 1;
  }, 1000);
}

function stopRecordingTicker() {
  clearInterval(recordingTicker);
  recordingTicker = null;
  recordingSeconds.value = 0;
}

function syncQuestionToStore() {
  practiceStore.setQuestion({
    ...(question.value || {}),
    id: question.value?.id || defaultQuestion.id,
    taskType: "RA",
    content: question.value?.content || defaultQuestion.content
  });
}

async function loadQuestion({ incrementIndex = false } = {}) {
  questionLoading.value = true;

  try {
    const picked = await getRandomQuestion("RA");
    question.value = picked || { ...defaultQuestion };
    syncQuestionToStore();

    if (incrementIndex) {
      questionIndex.value += 1;
    }
  } finally {
    questionLoading.value = false;
  }
}

function startPreparing() {
  isSubmitting = false;
  practiceStore.setPhase("preparing");
  timer.start(30, startRecording);
}

async function startRecording() {
  if (isStartingRecording || phase.value === "recording" || phase.value === "processing") return;
  isStartingRecording = true;

  try {
    if (phase.value === "preparing") {
      timer.stop();
    }
    practiceStore.setPhase("recording");
    const started = await recorder.startRecording();

    if (!started) {
      timer.stop();
      practiceStore.setPhase("idle");
      return;
    }

    startRecordingTicker();
    timer.start(40, handleSubmit);
  } finally {
    isStartingRecording = false;
  }
}

async function handleSubmit() {
  if (questionLoading.value) return;
  if (isSubmitting || phase.value !== "recording") return;
  isSubmitting = true;

  try {
    stopRecordingTicker();
    timer.stop();
    recorder.stopRecording();

    await waitForSpeechFlush();

    const transcript = recorder.transcript.value;
    if (!transcript || transcript.trim().length < 3) {
      uiStore.showToast("No speech detected. Please check your microphone and try again.", "warning");
      if (!unmounted) {
        await restartRecording();
      }
      return;
    }

    practiceStore.setTranscript(transcript);
    practiceStore.setAudioBlob(recorder.audioBlob.value);

    const scoreResult = await practiceStore.submitScore("RA", transcript, question.value?.content || "", question.value?.id || "unknown");

    if (!unmounted && practiceStore.phase === "done" && scoreResult && !scoreResult.error) {
      router.push("/ra/result");
    }
  } finally {
    isSubmitting = false;
  }
}

async function skipQuestion() {
  if (questionLoading.value || phase.value === "processing") return;

  timer.stop();
  stopRecordingTicker();
  recorder.stopRecording();

  await loadQuestion({ incrementIndex: true });
  startPreparing();
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }
  if (!authStore.canPractice) {
    router.replace("/limit");
    return;
  }

  if (practiceStore.selectedQuestion) {
    question.value = {
      ...defaultQuestion,
      ...(practiceStore.selectedQuestion || {})
    };
    syncQuestionToStore();
    practiceStore.clearSelectedQuestion();
    questionLoading.value = false;
  } else {
    await loadQuestion();
  }

  startPreparing();
});

onUnmounted(() => {
  unmounted = true;
  stopRecordingTicker();
  timer.stop();
  recorder.stopRecording();
});

function waitForSpeechFlush() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

async function restartRecording() {
  if (questionLoading.value || isSubmitting || isStartingRecording || phase.value === "processing") return;
  stopRecordingTicker();
  timer.stop();
  recorder.stopRecording();
  practiceStore.setPhase("idle");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await startRecording();
}

async function startRecordingNow() {
  if (questionLoading.value || phase.value !== "preparing") return;
  await startRecording();
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Read Aloud" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <p class="mb-4 text-sm text-muted">Question {{ questionIndex }}</p>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">Loading question...</p>
      </div>

      <template v-else>
        <div v-if="phase === 'preparing'" class="space-y-4">
          <section class="rounded-xl border bg-white p-6 shadow-card">
            <p class="mb-2 text-center text-lg font-bold text-navy">Prepare now. Recording starts automatically.</p>
            <p class="text-center text-sm text-muted">Read the passage carefully before the countdown ends.</p>
          </section>

          <div class="flex items-start gap-3">
            <div class="flex-1">
              <TimerBar label="Preparation" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />
            </div>
            <button type="button" class="pt-1 text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">
              跳过这题 →
            </button>
          </div>

          <button
            type="button"
            class="w-full rounded-xl border-2 border-orange/40 bg-white py-3 text-sm font-semibold text-orange transition-all hover:border-orange hover:bg-orange/5"
            @click="startRecordingNow"
          >
            立即开始录音
          </button>

          <section class="rounded-xl border bg-white p-6 shadow-card">
            <p class="text-lg leading-relaxed text-text">{{ question.content }}</p>
          </section>
        </div>

        <div v-else-if="phase === 'recording'" class="space-y-4">
          <div class="flex items-start gap-3">
            <div class="flex-1">
              <TimerBar label="Recording" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />
            </div>
            <button type="button" class="pt-1 text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">
              跳过这题 →
            </button>
          </div>

          <section class="rounded-xl border bg-white p-4 text-center shadow-card">
            <div v-if="!recorder.isReady" class="flex items-center justify-center gap-2">
              <div class="h-4 w-4 animate-spin rounded-full border-2 border-orange border-t-transparent" />
              <p class="text-sm text-muted">麦克风准备中...</p>
            </div>
            <div v-else class="flex items-center justify-center gap-2">
              <div class="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <p class="font-bold text-navy">请开始朗读</p>
            </div>
          </section>

          <section class="rounded-xl border bg-white p-6 shadow-card">
            <p class="text-lg leading-relaxed text-text">{{ question.content }}</p>
          </section>

          <section class="rounded-xl border bg-white p-4 shadow-card">
            <RecordingWave :is-recording="recorder.isRecording" />

            <div class="mt-4 flex gap-3">
              <button
                type="button"
                class="flex-1 rounded-xl border-2 border-gray-200 py-4 text-sm font-semibold text-muted transition-all hover:border-orange hover:text-orange"
                @click="restartRecording"
              >
                重新录音
              </button>

              <button
                type="button"
                class="flex-1 rounded-xl py-4 text-lg font-bold transition-all"
                :class="canSubmit ? 'bg-orange text-white shadow-md hover:opacity-90 active:scale-95' : 'cursor-not-allowed bg-gray-200 text-gray-400'"
                :disabled="!canSubmit"
                @click="handleSubmit"
              >
                {{ canSubmit ? "Submit Response" : "Recording..." }}
              </button>
            </div>
          </section>
        </div>

        <section v-else-if="phase === 'processing'" class="py-10 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10">
            <div class="h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
          </div>
          <p class="text-xl font-bold text-navy">Analyzing your response</p>
          <p class="mt-2 text-sm text-muted">AI coach is generating feedback...</p>
        </section>

        <section v-else class="rounded-xl border bg-white p-6 shadow-card">
          <p class="text-sm text-muted">Ready to try again after permission or device checks.</p>
          <div class="mt-4">
            <OrangeButton @click="startPreparing">Start Again</OrangeButton>
          </div>
        </section>

        <section v-if="phase === 'preparing' || phase === 'recording'" class="mt-4 rounded-xl border-l-4 border-orange bg-white p-4 shadow-sm">
          <p class="mb-2 text-sm font-semibold text-navy">Read Aloud Tips</p>
          <ul class="space-y-1 text-sm text-muted">
            <li v-for="tip in tips" :key="tip">- {{ tip }}</li>
          </ul>
        </section>

        <section v-if="phase === 'preparing' || phase === 'recording'" class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article class="rounded-xl bg-white p-3 text-center shadow-sm">
            <p class="text-xs text-muted">Difficulty</p>
            <p class="mt-1 font-bold text-navy">{{ difficultyLabel }}</p>
          </article>
          <article class="rounded-xl bg-white p-3 text-center shadow-sm">
            <p class="text-xs text-muted">Estimated Time</p>
            <p class="mt-1 font-bold text-navy">~25s</p>
          </article>
          <article class="rounded-xl bg-white p-3 text-center shadow-sm">
            <p class="text-xs text-muted">Word Count</p>
            <p class="mt-1 font-bold text-navy">{{ wordCount }} words</p>
          </article>
        </section>

        <section v-if="recorder.error" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <p class="text-sm text-red-600">{{ recorder.error }}</p>
        </section>

        <section class="mb-8 mt-3 flex items-center justify-between gap-4 rounded-xl bg-white p-4 shadow-sm">
          <div>
            <p class="text-xs text-muted">My Best</p>
            <p class="mt-0.5 text-2xl font-bold text-navy">
              {{ historicalStats.bestScore }} <span class="text-sm font-normal text-muted">pts</span>
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs text-muted">Total Practice</p>
            <p class="mt-0.5 text-2xl font-bold text-navy">
              {{ historicalStats.totalAttempts }} <span class="text-sm font-normal text-muted">times</span>
            </p>
          </div>
          <div class="text-3xl text-orange">TOP</div>
        </section>
      </template>
    </main>
  </div>
</template>

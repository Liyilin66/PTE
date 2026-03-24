<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import TimerBar from "@/components/TimerBar.vue";
import { getRandomQuestion } from "@/data/questions";
import { useRecorder } from "@/composables/useRecorder";
import { useTimer } from "@/composables/useTimer";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";

const router = useRouter();
const practiceStore = usePracticeStore();
const uiStore = useUIStore();
const timer = useTimer();
const recorder = useRecorder();

const phase = computed(() => practiceStore.phase);
const showTemplate = ref(false);
const notes = ref("");
const question = ref(
  getRandomQuestion("RL") || {
    id: "RL_FALLBACK",
    content: "Retell the lecture with key topic and supporting points."
  }
);

const recordingSeconds = ref(0);
const canSubmit = computed(() => phase.value === "recording" && recordingSeconds.value >= 3);

const historicalStats = {
  bestScore: 75,
  totalAttempts: 9
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

function initializeQuestion() {
  const picked = getRandomQuestion("RL");
  question.value = picked || question.value;

  practiceStore.setQuestion({
    id: question.value?.id || "RL_FALLBACK",
    taskType: "RL",
    content: question.value?.content || "Retell the lecture with key topic and supporting points."
  });
}

function startPlaying() {
  isSubmitting = false;
  showTemplate.value = false;
  notes.value = "";
  practiceStore.setPhase("playing");
  timer.start(8, startPreparing);
}

function startPreparing() {
  practiceStore.setPhase("preparing");
  timer.start(10, startRecording);
}

async function startRecording() {
  if (isStartingRecording || phase.value === "recording" || phase.value === "processing") return;
  isStartingRecording = true;
  try {
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
  if (isSubmitting || phase.value !== "recording") return;
  isSubmitting = true;

  try {
    stopRecordingTicker();
    timer.stop();
    recorder.stopRecording();

    await waitForSpeechFlush();

    const transcript = recorder.transcript.value;
    if (!transcript || transcript.trim().length < 3) {
      uiStore.showToast("没有识别到语音，请检查麦克风后重试。", "warning");
      if (!unmounted) {
        await restartRecording();
      }
      return;
    }

    practiceStore.setTranscript(transcript);
    practiceStore.setAudioBlob(recorder.audioBlob.value);

    await practiceStore.submitScore("RL", transcript, question.value?.content || "");

    if (!unmounted) {
      router.push("/rl/result");
    }
  } finally {
    isSubmitting = false;
  }
}

async function skipQuestion() {
  if (phase.value === "playing" || phase.value === "preparing") {
    timer.stop();
    await startRecording();
    return;
  }

  if (phase.value === "recording" && canSubmit.value) {
    await handleSubmit();
  }
}

onMounted(() => {
  initializeQuestion();
  startPlaying();
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
  practiceStore.setPhase("idle");
  await startRecording();
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Re-tell Lecture" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <section v-if="phase !== 'processing'" class="rounded-xl border bg-white p-6 shadow-card">
        <p v-if="phase === 'playing'" class="text-base text-muted">Simulated lecture playback in progress...</p>
        <p v-else-if="phase === 'preparing'" class="text-base text-muted">Prepare your key points before speaking.</p>
        <p v-else-if="phase === 'recording'" class="text-base text-muted">Speak now using your summary structure.</p>
        <p v-else class="text-base text-muted">Ready after permission or device checks.</p>

        <div class="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p class="mb-1 text-xs text-muted">Lecture Topic Hint</p>
          <p class="text-sm leading-relaxed text-[#1A1A2E]">{{ question?.content || "Retell the lecture with key topic and supporting points." }}</p>
        </div>

        <div v-if="phase === 'playing' || phase === 'preparing' || phase === 'recording'" class="mt-4 flex items-start gap-3">
          <div class="flex-1">
            <TimerBar
              :label="phase === 'playing' ? 'Playback' : phase === 'preparing' ? 'Preparation' : 'Recording'"
              :remaining="timer.remaining"
              :progress="timer.progress"
              :is-warning="timer.isWarning"
            />
          </div>
          <button type="button" class="pt-1 text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">
            Skip
          </button>
        </div>

        <div class="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p class="text-sm text-[#1A1A2E]">
            The lecture mainly discusses <span class="font-semibold">[TOPIC]</span>. The speaker first mentions
            <span class="font-semibold">[POINT 1]</span>, then explains <span class="font-semibold">[POINT 2]</span>, and
            finally concludes <span class="font-semibold">[CONCLUSION]</span>.
          </p>
        </div>

        <div v-if="phase === 'recording'" class="mt-3">
          <button type="button" class="text-sm text-orange underline transition-opacity hover:opacity-75" @click="showTemplate = !showTemplate">
            {{ showTemplate ? 'Hide Template' : 'Show Re-tell Template' }}
          </button>
          <div v-if="showTemplate" class="mt-2 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p class="mb-2 text-xs text-muted">Re-tell Template</p>
            <p class="text-sm leading-relaxed text-navy">
              The lecture mainly discusses <span class="font-bold text-orange">[TOPIC]</span>. The speaker first mentions
              <span class="font-bold text-orange">[POINT 1]</span>, then explains
              <span class="font-bold text-orange">[POINT 2]</span>, and finally concludes
              <span class="font-bold text-orange">[CONCLUSION]</span>.
            </p>
          </div>
        </div>

        <div class="mt-4">
          <RecordingWave :is-recording="recorder.isRecording" />

          <button
            v-if="phase === 'recording'"
            type="button"
            class="mt-4 w-full rounded-xl py-4 text-lg font-bold transition-all"
            :class="canSubmit ? 'bg-orange text-white shadow-md hover:opacity-90 active:scale-95' : 'cursor-not-allowed bg-gray-200 text-gray-400'"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            {{ canSubmit ? 'Submit Response' : 'Recording...' }}
          </button>
        </div>
      </section>

      <section v-else class="py-10 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        </div>
        <p class="text-xl font-bold text-navy">Analyzing your response</p>
        <p class="mt-2 text-sm text-muted">AI coach is generating feedback...</p>
      </section>

      <section class="mt-4 rounded-xl bg-white p-4 shadow-sm">
        <p class="mb-2 text-sm font-semibold text-navy">Keyword Notes</p>
        <textarea
          v-model="notes"
          placeholder="Write quick keywords while listening, such as topic, numbers, names..."
          class="h-20 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-text focus:border-orange focus:outline-none"
        />
      </section>

      <section class="mt-3 rounded-xl border-l-4 border-orange bg-white p-4 shadow-sm">
        <p class="mb-2 text-sm font-semibold text-navy">Retell Structure</p>
        <div class="flex flex-col gap-1.5 text-sm text-muted">
          <div class="flex items-center gap-2">
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-orange text-xs font-bold text-white">1</span>
            <span>State the topic first: "The lecture is about..."</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-orange text-xs font-bold text-white">2</span>
            <span>Mention key points: "The speaker mentions..."</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="flex h-5 w-5 items-center justify-center rounded-full bg-orange text-xs font-bold text-white">3</span>
            <span>Finish with conclusion: "In conclusion..."</span>
          </div>
        </div>
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
    </main>
  </div>
</template>

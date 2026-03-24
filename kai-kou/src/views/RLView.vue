<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import RecordingWave from "@/components/RecordingWave.vue";
import TimerBar from "@/components/TimerBar.vue";
import { useRecorder } from "@/composables/useRecorder";
import { useTTS } from "@/composables/useTTS";
import { useTimer } from "@/composables/useTimer";
import { useAuthStore } from "@/stores/auth";
import { getRandomQuestion } from "@/data/questions";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";

const router = useRouter();
const practiceStore = usePracticeStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const timer = useTimer();
const recorder = useRecorder();
const tts = useTTS();

const phase = ref("playing");
const notes = ref("");
const showTemplate = ref(false);
const recordingSeconds = ref(0);
const questionIndex = ref(1);
const question = ref(
  getRandomQuestion("RL") || {
    id: "RL_FALLBACK",
    topic: "General Topic",
    imageKeyword: "education lecture",
    audioScript: "The lecture discusses a general academic topic.",
    keyPoints: ["main idea", "supporting detail"],
    content: "Topic: General lecture."
  }
);

const canSubmit = computed(() => recordingSeconds.value >= 3);

const barHeights = [10, 16, 24, 34, 28, 22, 30, 20, 14];
const imageUrl = computed(() => `https://source.unsplash.com/800x400/?${encodeURIComponent(question.value.imageKeyword || "education lecture")}`);

let isSubmitting = false;
let isStartingRecording = false;
let recordingTicker = null;
let unmounted = false;
let playbackDelayTimer = null;

function initializeQuestion() {
  const picked = getRandomQuestion("RL");
  question.value = picked || question.value;
  practiceStore.setQuestion({
    id: question.value.id,
    taskType: "RL",
    content: question.value.audioScript
  });
}

function startLecturePlayback(delay = 700) {
  cleanupPlaybackDelay();
  stopRecordingTicker();
  timer.stop();
  tts.stop();
  recorder.stopRecording();

  phase.value = "playing";
  notes.value = "";
  showTemplate.value = false;
  recordingSeconds.value = 0;

  playbackDelayTimer = setTimeout(() => {
    if (unmounted) return;
    if (!tts.isSupported.value) {
      startPreparing();
      return;
    }
    tts.speak(question.value.audioScript, startPreparing);
  }, delay);
}

function startPreparing() {
  phase.value = "preparing";
  timer.start(10, startRecording);
}

async function startRecording() {
  if (isStartingRecording || phase.value === "recording" || phase.value === "processing") return;
  isStartingRecording = true;

  try {
    phase.value = "recording";
    const started = await recorder.startRecording();
    if (!started) {
      phase.value = "idle";
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
      uiStore.showToast("No speech detected. Please check your microphone and try again.", "warning");
      if (!unmounted) {
        await startRecording();
      }
      return;
    }

    phase.value = "processing";
    const scoreResult = await practiceStore.submitScore("RL", transcript, question.value.audioScript, question.value.id);

    if (!unmounted && practiceStore.phase === "done" && scoreResult && !scoreResult.error) {
      router.push("/rl/result");
    }
  } finally {
    isSubmitting = false;
  }
}

function skipQuestion() {
  initializeQuestion();
  questionIndex.value += 1;
  startLecturePlayback(400);
}

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
}

function waitForSpeechFlush() {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

function cleanupPlaybackDelay() {
  clearTimeout(playbackDelayTimer);
  playbackDelayTimer = null;
}

onMounted(async () => {
  if (!authStore.loaded) {
    await authStore.loadStatus();
  }
  if (!authStore.canPractice) {
    router.replace("/limit");
    return;
  }
  initializeQuestion();
  startLecturePlayback();
});

onUnmounted(() => {
  unmounted = true;
  cleanupPlaybackDelay();
  stopRecordingTicker();
  timer.stop();
  tts.stop();
  recorder.stopRecording();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Re-tell Lecture" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <p class="mb-4 text-sm text-muted">Question {{ questionIndex }}</p>

      <section v-if="phase === 'playing'" class="space-y-4">
        <article class="overflow-hidden rounded-xl border bg-white shadow-card">
          <img :src="imageUrl" :alt="question.topic" class="h-48 w-full object-cover" @error="(e) => (e.target.style.display = 'none')" />
          <div class="p-4">
            <p class="text-xs text-muted">Topic</p>
            <p class="font-bold text-navy">{{ question.topic }}</p>
          </div>
        </article>

        <section class="rounded-xl border bg-white p-4 shadow-card">
          <div class="mb-3 flex items-center justify-between text-sm">
            <span class="text-muted">Lecture Playback</span>
            <span :class="tts.isPlaying ? 'font-semibold text-orange' : 'text-muted'">
              {{ tts.isPlaying ? "Playing..." : "Loading..." }}
            </span>
          </div>
          <div class="flex h-10 items-end justify-center gap-1.5">
            <div
              v-for="(h, i) in barHeights"
              :key="i"
              class="w-1.5 rounded-full bg-orange transition-all"
              :class="tts.isPlaying ? 'animate-pulse' : 'opacity-25'"
              :style="{ height: `${h}px`, animationDelay: `${i * 0.08}s` }"
            />
          </div>
        </section>

        <section class="rounded-xl border bg-white p-4 shadow-card">
          <p class="mb-2 text-sm font-semibold text-navy">Quick Notes (not scored)</p>
          <textarea
            v-model="notes"
            placeholder="Write key words while listening..."
            class="h-20 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-text focus:border-orange focus:outline-none"
          />
        </section>

        <button type="button" class="w-full text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">Skip</button>
      </section>

      <section v-else-if="phase === 'preparing'" class="space-y-4">
        <article class="rounded-xl border bg-white p-6 text-center shadow-card">
          <p class="text-lg font-bold text-navy">Get ready to re-tell the lecture</p>
          <p class="mt-1 text-sm text-muted">Recording starts automatically</p>
        </article>

        <TimerBar label="Preparation" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />

        <section class="rounded-xl border-l-4 border-orange bg-white p-4 shadow-sm">
          <p class="mb-2 text-sm font-semibold text-navy">Structure template</p>
          <p class="text-sm leading-relaxed text-muted">
            The lecture mainly discusses <span class="font-bold text-orange">[topic]</span>. The speaker mentions
            <span class="font-bold text-orange">[point 1]</span>, then explains
            <span class="font-bold text-orange">[point 2]</span>, and finally concludes
            <span class="font-bold text-orange">[conclusion]</span>.
          </p>
        </section>

        <section v-if="notes" class="rounded-xl border bg-white p-4 shadow-sm">
          <p class="mb-1 text-xs text-muted">Your notes</p>
          <p class="text-sm text-navy">{{ notes }}</p>
        </section>
      </section>

      <section v-else-if="phase === 'recording'" class="space-y-4">
        <div class="flex items-start gap-3">
          <div class="flex-1">
            <TimerBar label="Recording" :remaining="timer.remaining" :progress="timer.progress" :is-warning="timer.isWarning" />
          </div>
          <button type="button" class="pt-1 text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">Skip</button>
        </div>

        <section class="rounded-xl border bg-white p-4 shadow-card">
          <RecordingWave :is-recording="recorder.isRecording" />
          <button
            type="button"
            class="mt-4 w-full rounded-xl py-4 text-lg font-bold transition-all"
            :class="canSubmit ? 'bg-orange text-white shadow-md hover:opacity-90 active:scale-95' : 'cursor-not-allowed bg-gray-200 text-gray-400'"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            {{ canSubmit ? "Submit Response" : "Recording..." }}
          </button>
        </section>

        <section>
          <button type="button" class="text-sm text-orange underline transition-opacity hover:opacity-75" @click="showTemplate = !showTemplate">
            {{ showTemplate ? "Hide template" : "Show template" }}
          </button>
          <div v-if="showTemplate" class="mt-2 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p class="text-sm leading-relaxed text-navy">
              The lecture mainly discusses <strong>{{ question.topic }}</strong>. The speaker mentions
              <strong>{{ question.keyPoints[0] }}</strong> and explains <strong>{{ question.keyPoints[1] }}</strong>.
            </p>
          </div>
        </section>
      </section>

      <section v-else-if="phase === 'processing'" class="py-10 text-center">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10">
          <div class="h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        </div>
        <p class="text-xl font-bold text-navy">Analysing your response...</p>
      </section>

      <section v-else class="rounded-xl border bg-white p-6 text-center shadow-card">
        <p class="text-sm text-muted">Microphone permission or speech recognition is required.</p>
        <button type="button" class="mt-4 text-sm text-orange underline" @click="startLecturePlayback(200)">Try again</button>
      </section>

      <section v-if="recorder.error" class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <p class="text-sm text-red-600">{{ recorder.error }}</p>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import { useTTS } from "@/composables/useTTS";
import { getRandomQuestion } from "@/lib/questions";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { useUIStore } from "@/stores/ui";

const defaultQuestion = {
  id: "WFD_FALLBACK",
  content: "The university library is closed on public holidays."
};

const router = useRouter();
const practiceStore = usePracticeStore();
const authStore = useAuthStore();
const uiStore = useUIStore();
const tts = useTTS();

const phase = ref("active");
const playbackStatus = ref("before");
const userInput = ref("");
const replaysLeft = ref(2);
const questionIndex = ref(1);
const questionLoading = ref(true);
const question = ref({ ...defaultQuestion });

const canSubmit = computed(() => userInput.value.trim().length >= 3);
const playbackText = computed(() => {
  if (playbackStatus.value === "before") return "Playback will start shortly. You can start typing now.";
  if (playbackStatus.value === "playing" || tts.isPlaying.value) return "Playing...";
  return "Playback complete. You can keep editing before submit.";
});

const barHeights = [12, 20, 28, 36, 44, 36, 28, 20, 12];

let unmounted = false;
let playbackDelayTimer = null;
let audioPlayer = null;

function getQuestionContent() {
  return question.value?.content || defaultQuestion.content;
}

function getQuestionAudioScript() {
  return question.value?.audioScript || question.value?.audio_script || getQuestionContent();
}

function getQuestionAudioUrl() {
  return question.value?.audioUrl || question.value?.audio_url || "";
}

function syncQuestionToStore() {
  practiceStore.setQuestion({
    ...(question.value || {}),
    id: question.value?.id || defaultQuestion.id,
    taskType: "WFD",
    content: getQuestionContent()
  });
}

async function loadQuestion({ incrementIndex = false } = {}) {
  questionLoading.value = true;

  try {
    const picked = await getRandomQuestion("WFD");
    question.value = picked || { ...defaultQuestion };
    syncQuestionToStore();

    if (incrementIndex) {
      questionIndex.value += 1;
    }
  } finally {
    questionLoading.value = false;
  }
}

function stopAudioPlayer() {
  if (!audioPlayer) return;

  audioPlayer.onended = null;
  audioPlayer.onerror = null;
  audioPlayer.pause();
  audioPlayer.currentTime = 0;
  audioPlayer = null;
  tts.isPlaying.value = false;
}

function playTextToSpeech(onEnd) {
  const text = getQuestionAudioScript();
  if (!tts.isSupported.value || !text) {
    if (onEnd) onEnd();
    return;
  }

  tts.speak(text, onEnd);
}

function playRealAudio(url, onEnd) {
  stopAudioPlayer();

  const audio = new Audio(url);
  audioPlayer = audio;
  tts.isPlaying.value = true;

  const finish = () => {
    if (audioPlayer !== audio) return;
    stopAudioPlayer();
    if (onEnd) onEnd();
  };

  const fail = () => {
    if (audioPlayer !== audio) return;
    stopAudioPlayer();
    playTextToSpeech(onEnd);
  };

  audio.onended = finish;
  audio.onerror = fail;
  audio.play().catch(fail);
}

function playQuestionAudio(onEnd) {
  const realAudioUrl = getQuestionAudioUrl();
  if (realAudioUrl) {
    playRealAudio(realAudioUrl, onEnd);
    return;
  }

  playTextToSpeech(onEnd);
}

function playCurrentQuestion(delay = 700) {
  cleanupPlaybackDelay();
  stopAudioPlayer();
  tts.stop();
  playbackStatus.value = "before";

  playbackDelayTimer = setTimeout(() => {
    if (unmounted || phase.value === "processing" || questionLoading.value) return;

    if (!getQuestionAudioUrl() && !tts.isSupported.value) {
      uiStore.showToast("Speech synthesis is unavailable. You can still type manually.", "warning");
      playbackStatus.value = "after";
      return;
    }

    playbackStatus.value = "playing";
    playQuestionAudio(() => {
      if (!unmounted) {
        playbackStatus.value = "after";
      }
    });
  }, delay);
}

function replayAudio() {
  if (questionLoading.value) return;
  if (replaysLeft.value <= 0 || tts.isPlaying.value || phase.value === "processing") return;
  replaysLeft.value -= 1;
  playCurrentQuestion(100);
}

async function handleSubmit() {
  if (questionLoading.value) return;
  if (!canSubmit.value) {
    uiStore.showToast("Please type what you heard first.", "warning");
    return;
  }

  phase.value = "processing";
  const scoreResult = await practiceStore.submitScore("WFD", userInput.value, getQuestionContent(), question.value?.id || "unknown");
  if (practiceStore.phase === "done" && scoreResult && !scoreResult.error) {
    router.push("/wfd/result");
  }
}

async function skipQuestion() {
  if (questionLoading.value || phase.value === "processing") return;

  cleanupPlaybackDelay();
  stopAudioPlayer();
  tts.stop();

  userInput.value = "";
  replaysLeft.value = 2;
  playbackStatus.value = "before";

  await loadQuestion({ incrementIndex: true });
  playCurrentQuestion(250);
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

  await loadQuestion();
  playCurrentQuestion();
});

onUnmounted(() => {
  unmounted = true;
  cleanupPlaybackDelay();
  stopAudioPlayer();
  tts.stop();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Write From Dictation" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <p class="mb-4 text-sm text-muted">Question {{ questionIndex }}</p>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">Loading question...</p>
      </div>

      <template v-else>
        <section v-if="phase !== 'processing'" class="space-y-4">
          <article class="rounded-xl border bg-white p-6 text-center shadow-card">
            <p class="text-lg font-bold text-navy">Listen and type what you hear</p>
            <p class="mt-1 text-sm text-muted">You can type before, during, and after playback.</p>
          </article>

          <section class="rounded-xl border bg-white p-4 shadow-card text-center">
            <div class="mb-3 flex h-10 items-end justify-center gap-1.5">
              <div
                v-for="(h, i) in barHeights"
                :key="i"
                class="w-2 rounded-full bg-orange"
                :class="tts.isPlaying ? 'animate-pulse' : 'opacity-25'"
                :style="{ height: `${h}px`, animationDelay: `${i * 0.08}s` }"
              />
            </div>
            <p class="text-sm" :class="tts.isPlaying ? 'font-semibold text-orange' : 'text-muted'">
              {{ playbackText }}
            </p>
          </section>

          <article class="rounded-xl border bg-white p-5 shadow-card">
            <p class="mb-3 text-sm font-semibold text-navy">Type what you heard</p>
            <input
              v-model="userInput"
              type="text"
              placeholder="Type the sentence here..."
              class="h-12 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 text-sm text-text focus:border-orange focus:outline-none"
              autofocus
            />
            <p class="mt-2 text-right text-xs text-muted">{{ userInput.split(/\s+/).filter(Boolean).length }} words</p>
          </article>

          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
            <button
              type="button"
              class="rounded-lg border-2 border-orange px-4 py-2 text-sm font-semibold text-orange transition-all hover:bg-orange hover:text-white disabled:opacity-50"
              :disabled="tts.isPlaying || replaysLeft <= 0"
              @click="replayAudio"
            >
              Listen again ({{ replaysLeft }} left)
            </button>
            <button type="button" class="text-sm text-muted underline transition-colors hover:text-navy" @click="skipQuestion">Skip</button>
          </div>

          <button
            type="button"
            class="w-full rounded-xl py-4 text-lg font-bold transition-all"
            :class="canSubmit ? 'bg-orange text-white shadow-md hover:opacity-90' : 'cursor-not-allowed bg-gray-200 text-gray-400'"
            :disabled="!canSubmit"
            @click="handleSubmit"
          >
            Submit
          </button>
        </section>

        <section v-else class="py-12 text-center">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange/10">
            <div class="h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
          </div>
          <p class="text-xl font-bold text-navy">Checking your answer...</p>
        </section>
      </template>
    </main>
  </div>
</template>

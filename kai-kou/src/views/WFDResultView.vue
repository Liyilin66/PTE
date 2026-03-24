<script setup>
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { usePracticeStore } from "@/stores/practice";

const router = useRouter();
const store = usePracticeStore();

const correctSentence = computed(() => store.currentQuestion?.content || "");
const userSentence = computed(() => store.transcript || "");

const correctWords = computed(() => splitWords(correctSentence.value));
const userWords = computed(() => splitWords(userSentence.value));

const wordComparison = computed(() =>
  correctWords.value.map((expected, idx) => {
    const actual = userWords.value[idx] || "";
    const match = normalizeWord(actual) === normalizeWord(expected);
    return {
      expected,
      actual,
      match,
      missing: !actual
    };
  })
);

const extraWords = computed(() => userWords.value.slice(correctWords.value.length));

const accuracy = computed(() => {
  if (!correctWords.value.length) return 0;
  const matched = wordComparison.value.filter((item) => item.match).length;
  return Math.round((matched / correctWords.value.length) * 100);
});

const feedback = computed(() => {
  if (accuracy.value >= 85) return "Excellent dictation. Keep this precision and maintain spelling consistency.";
  if (accuracy.value >= 60) return "Good attempt. Focus on short function words and word endings for a higher score.";
  return "Nice effort. Replay once more and capture every small word, including articles and prepositions.";
});

const resultTitle = computed(() => {
  if (accuracy.value >= 85) return "Excellent dictation accuracy";
  if (accuracy.value >= 60) return "Solid dictation attempt";
  return "Keep building dictation precision";
});

onMounted(() => {
  if (!store.currentQuestion || !store.transcript) {
    router.replace("/wfd");
  }
});

function splitWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeWord(word) {
  return String(word)
    .toLowerCase()
    .replace(/[^a-z0-9']/g, "");
}
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="WFD Result" back-to="/wfd" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <section class="mb-6 text-center">
        <p class="text-sm font-semibold uppercase tracking-wide text-orange">Result</p>
        <h1 class="mt-1 text-2xl font-bold text-navy">{{ resultTitle }}</h1>
        <p class="mt-1 text-muted">
          Accuracy <span class="text-xl font-bold text-orange">{{ accuracy }}%</span>
        </p>
      </section>

      <section class="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p class="mb-2 text-sm font-semibold text-navy">Correct Sentence</p>
        <p class="leading-relaxed text-text">{{ correctSentence }}</p>
      </section>

      <section class="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p class="mb-2 text-sm font-semibold text-navy">Your Input</p>
        <p class="leading-relaxed text-text">{{ userSentence }}</p>
      </section>

      <section class="mb-4 rounded-xl bg-white p-4 shadow-sm">
        <p class="mb-3 text-sm font-semibold text-navy">Word-by-Word Comparison</p>
        <div class="flex flex-wrap gap-2">
          <span
            v-for="(item, idx) in wordComparison"
            :key="`${idx}-${item.expected}`"
            class="rounded-full border px-3 py-1 text-xs font-semibold"
            :class="item.match ? 'border-green-200 bg-green-100 text-green-700' : 'border-red-200 bg-red-50 text-red-600'"
          >
            <template v-if="item.match">
              {{ item.expected }}
            </template>
            <template v-else-if="item.missing">
              missed: {{ item.expected }}
            </template>
            <template v-else>
              {{ item.actual }} -> {{ item.expected }}
            </template>
          </span>
          <span
            v-for="(word, idx) in extraWords"
            :key="`extra-${idx}-${word}`"
            class="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"
          >
            extra: {{ word }}
          </span>
        </div>
      </section>

      <section class="mb-6 rounded-xl bg-white p-4 shadow-sm">
        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">AI</div>
          <div>
            <p class="mb-1 text-xs text-muted">Coach Feedback</p>
            <p class="leading-relaxed text-text">{{ feedback }}</p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <OrangeButton full @click="router.push('/wfd')">Practice Another WFD</OrangeButton>
        <button
          type="button"
          class="w-full rounded-xl border border-gray-200 py-3 text-muted transition-all hover:border-navy hover:text-navy"
          @click="router.push('/home')"
        >
          Back Home
        </button>
      </section>
    </main>
  </div>
</template>

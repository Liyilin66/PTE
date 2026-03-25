<script setup>
import { computed, onMounted, ref } from "vue";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { getRandomQuestion } from "@/lib/questions";
import { useUIStore } from "@/stores/ui";

const defaultQuestion = {
  id: "WE_FALLBACK",
  topic: "General Essay",
  content:
    "Some people think online learning should replace traditional classroom teaching, while others disagree. Discuss both views and give your own opinion.",
  difficulty: 2
};

const uiStore = useUIStore();

const questionLoading = ref(true);
const questionIndex = ref(1);
const question = ref({ ...defaultQuestion });

const subject = ref("");
const body = ref("");

const wordCount = computed(() => {
  return body.value.trim() ? body.value.trim().split(/\s+/).length : 0;
});

const difficultyLabel = computed(() => {
  const difficulty = Number(question.value?.difficulty || 2);
  if (difficulty <= 1) return "Easy";
  if (difficulty >= 3) return "Hard";
  return "Medium";
});

const questionTopic = computed(() => {
  return question.value?.topic || "Essay Task";
});

const questionContent = computed(() => {
  return question.value?.content || defaultQuestion.content;
});

async function loadQuestion({ incrementIndex = false, resetDraft = false } = {}) {
  questionLoading.value = true;

  try {
    const picked = await getRandomQuestion("WE");
    question.value = picked || { ...defaultQuestion };

    if (incrementIndex) {
      questionIndex.value += 1;
    }

    if (resetDraft) {
      body.value = "";
      subject.value = questionTopic.value;
    } else if (!subject.value.trim()) {
      subject.value = questionTopic.value;
    }
  } finally {
    questionLoading.value = false;
  }
}

async function nextQuestion() {
  await loadQuestion({ incrementIndex: true, resetDraft: true });
}

function submitEssay() {
  if (questionLoading.value) return;

  if (!subject.value.trim() || !body.value.trim()) {
    uiStore.showToast("Please complete subject and body before submission.", "warning");
    return;
  }

  uiStore.showToast("Your answer is received. Scoring will be available soon.", "success");
}

function clearAll() {
  subject.value = "";
  body.value = "";
}

onMounted(async () => {
  await loadQuestion();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Write Essay" back-to="/home" />

    <main class="mx-auto max-w-3xl px-4 py-6">
      <p class="mb-4 text-sm text-muted">Question {{ questionIndex }}</p>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">Loading question...</p>
      </div>

      <template v-else>
        <section class="mb-4 rounded-xl border-l-4 border-orange bg-white p-5 shadow-sm">
          <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-navy">{{ questionTopic }}</p>
            <span class="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">{{ difficultyLabel }}</span>
          </div>
          <p class="text-sm leading-relaxed text-text">{{ questionContent }}</p>
        </section>

        <section class="rounded-xl border bg-white p-6 shadow-card">
          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-text">Subject</label>
            <input
              v-model="subject"
              type="text"
              class="h-11 w-full rounded-lg border border-[#D1D5DB] px-3 text-sm outline-none focus:border-[#9BB7E3]"
              placeholder="Enter your email subject"
            />
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <label class="block text-sm font-medium text-text">Body</label>
              <span class="text-sm text-orange">Words: {{ wordCount }}</span>
            </div>
            <textarea
              v-model="body"
              class="min-h-[320px] w-full resize-y rounded-lg border border-[#D1D5DB] p-3 text-sm outline-none focus:border-[#9BB7E3]"
              placeholder="Write your response here..."
            />
          </div>

          <div class="mt-5 flex flex-wrap justify-end gap-3">
            <OrangeButton tone="outline" @click="nextQuestion">Next Prompt</OrangeButton>
            <OrangeButton tone="outline" @click="clearAll">Clear</OrangeButton>
            <OrangeButton @click="submitEssay">Submit</OrangeButton>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

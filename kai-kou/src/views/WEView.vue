<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import OrangeButton from "@/components/OrangeButton.vue";
import { useUIStore } from "@/stores/ui";
import {
  getDefaultWETemplate,
  getRandomWEQuestion,
  getRelatedWEQuestions,
  getUniversalWETemplates,
  getWEQuestionById,
  getWETemplateById
} from "@/lib/we-data";

const route = useRoute();
const router = useRouter();
const uiStore = useUIStore();
const ACTIVE_TEMPLATE_STORAGE_KEY = "we.activeTemplateId";

const defaultQuestion = {
  id: "WE_FALLBACK",
  sourceNumberLabel: "#0",
  displayTitle: "General Essay",
  promptText:
    "Some people think online learning should replace traditional classroom teaching, while others disagree. Discuss both views and give your own opinion.",
  promptType: "agree_disagree",
  primaryTopic: "education_learning",
  difficulty: 2
};

const questionLoading = ref(true);
const question = ref({ ...defaultQuestion });
const relatedQuestions = ref([]);
const universalTemplates = ref(getUniversalWETemplates());
const currentTemplateId = ref(getDefaultWETemplate()?.id || universalTemplates.value[0]?.id || "");
const showTemplateSwitcher = ref(false);

const body = ref("");

const wordCount = computed(() => (body.value.trim() ? body.value.trim().split(/\s+/).length : 0));

const difficultyLabel = computed(() => {
  const difficulty = Number(question.value?.difficulty || 2);
  if (difficulty <= 1) return "Easy";
  if (difficulty >= 3) return "Hard";
  return "Medium";
});

const questionTitle = computed(() => question.value?.displayTitle || defaultQuestion.displayTitle);
const questionPromptText = computed(() => question.value?.promptText || defaultQuestion.promptText);
const questionType = computed(() => question.value?.promptType || "agree_disagree");
const questionTopic = computed(() => question.value?.primaryTopic || "education_learning");
const questionNumberLabel = computed(() => question.value?.sourceNumberLabel || "#0");
const currentTemplate = computed(() => {
  const key = String(currentTemplateId.value || "").trim();
  if (!key) return null;
  return universalTemplates.value.find((item) => item.id === key) || null;
});

function getPersistedTemplateId() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(ACTIVE_TEMPLATE_STORAGE_KEY) || "").trim();
}

function persistTemplateId(templateId) {
  const key = String(templateId || "").trim();
  if (!key || typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_TEMPLATE_STORAGE_KEY, key);
}

function applyTemplateFromRoute() {
  const templateIdFromRoute = String(route.query?.template || "").trim();
  const persistedTemplateId = getPersistedTemplateId();
  const candidateTemplateId = templateIdFromRoute || persistedTemplateId;

  if (candidateTemplateId && universalTemplates.value.some((item) => item.id === candidateTemplateId)) {
    currentTemplateId.value = candidateTemplateId;
    persistTemplateId(candidateTemplateId);
    return;
  }

  if (!currentTemplate.value) {
    currentTemplateId.value = universalTemplates.value[0]?.id || "";
    persistTemplateId(currentTemplateId.value);
  }
}

function applyQuestion(nextQuestion, { resetDraft = false } = {}) {
  question.value = nextQuestion || { ...defaultQuestion };
  relatedQuestions.value = getRelatedWEQuestions(question.value?.id).slice(0, 3);

  if (resetDraft) {
    body.value = "";
  }

  applyTemplateFromRoute();
}

function loadQuestionByRoute() {
  questionLoading.value = true;

  try {
    const routeQuestionId = String(route.params?.id || "").trim();
    if (routeQuestionId) {
      const selected = getWEQuestionById(routeQuestionId);
      if (selected) {
        applyQuestion(selected, { resetDraft: true });
        return;
      }
      uiStore.showToast("Question not found. Loaded a random prompt instead.", "warning");
    }

    applyQuestion(getRandomWEQuestion(), { resetDraft: routeQuestionId.length > 0 });
  } finally {
    questionLoading.value = false;
  }
}

function goSelectPractice() {
  const templateId = String(currentTemplateId.value || "").trim();
  router.push({
    path: "/we/select",
    query: templateId ? { template: templateId } : {}
  });
}

function goTemplateLibrary() {
  const templateId = String(currentTemplateId.value || "").trim();
  router.push({
    path: "/we/templates",
    query: templateId ? { template: templateId } : {}
  });
}

function toggleTemplateSwitcher() {
  showTemplateSwitcher.value = !showTemplateSwitcher.value;
}

function selectTemplate(templateId) {
  const key = String(templateId || "").trim();
  if (!key) return;
  if (!universalTemplates.value.some((item) => item.id === key)) return;

  currentTemplateId.value = key;
  persistTemplateId(key);
  showTemplateSwitcher.value = false;
}

function importCurrentTemplate() {
  const key = String(currentTemplateId.value || "").trim();
  const template = getWETemplateById(key) || currentTemplate.value;
  const content = String(template?.content || "").trim();
  if (!content) {
    uiStore.showToast("Template is empty.", "warning");
    return;
  }

  if (body.value.trim()) {
    body.value = `${body.value.trim()}\n\n${content}`;
  } else {
    body.value = content;
  }

  uiStore.showToast("Template inserted into body.", "success");
}

function nextQuestion() {
  if (questionLoading.value) return;

  const templateId = String(currentTemplateId.value || "").trim();
  if (route.params?.id) {
    router.push({ path: "/we", query: templateId ? { template: templateId } : {} });
    return;
  }
  applyQuestion(getRandomWEQuestion(question.value?.id), { resetDraft: true });
}

function submitEssay() {
  if (questionLoading.value) return;

  if (!body.value.trim()) {
    uiStore.showToast("Please complete body before submission.", "warning");
    return;
  }

  uiStore.showToast("Your answer is saved locally. AI scoring will be added in a later phase.", "success");
}

function clearAll() {
  body.value = "";
}

watch(
  () => route.params?.id,
  () => {
    loadQuestionByRoute();
  }
);

watch(
  () => route.query?.template,
  () => {
    applyTemplateFromRoute();
  }
);

onMounted(() => {
  loadQuestionByRoute();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Write Essay" back-to="/home" />

    <main class="mx-auto max-w-3xl px-4 py-6">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">Question {{ questionNumberLabel }}</p>
        <div class="flex flex-wrap gap-2">
          <OrangeButton tone="outline" @click="goTemplateLibrary">看模板</OrangeButton>
          <OrangeButton tone="outline" @click="goSelectPractice">选题练习</OrangeButton>
        </div>
      </div>

      <div v-if="questionLoading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">Loading question...</p>
      </div>

      <template v-else>
        <section class="mb-4 rounded-xl border-l-4 border-orange bg-white p-5 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-navy">{{ questionTitle }}</p>
            <span class="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange">{{ difficultyLabel }}</span>
          </div>

          <p class="mb-3 text-sm leading-relaxed text-text">{{ questionPromptText }}</p>

          <div class="flex flex-wrap gap-2">
            <span class="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{{ questionType }}</span>
            <span class="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">{{ questionTopic }}</span>
          </div>
        </section>

        <section v-if="relatedQuestions.length" class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
          <p class="mb-2 text-sm font-semibold text-navy">Related Questions</p>
          <div class="space-y-2">
            <button
              v-for="related in relatedQuestions"
              :key="related.id"
              type="button"
              class="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-text transition-colors hover:border-orange hover:bg-orange/5"
              @click="router.push({
                path: `/we/practice/${related.id}`,
                query: currentTemplateId ? { template: currentTemplateId } : {}
              })"
            >
              {{ related.sourceNumberLabel }} · {{ related.displayTitle }}
            </button>
          </div>
        </section>

        <section class="mb-4 rounded-xl border bg-white p-4 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-navy">当前模板预览</p>
              <p class="text-xs text-muted">10 个全文通用模板（默认模板 1）</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-1 text-xs font-semibold text-muted transition-colors hover:border-orange hover:text-orange"
                @click="toggleTemplateSwitcher"
              >
                切换模板
              </button>
              <button
                type="button"
                class="rounded-lg bg-orange px-3 py-1 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                @click="importCurrentTemplate"
              >
                一键导入模板
              </button>
            </div>
          </div>

          <div v-if="currentTemplate" class="rounded-lg border border-gray-200 p-3">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-semibold text-navy">{{ currentTemplate.title }}</p>
              <span class="text-xs text-muted">{{ currentTemplate.shortLabel || currentTemplate.id }}</span>
            </div>
            <pre class="overflow-auto whitespace-pre-wrap rounded-md bg-[#F8FAFC] p-3 text-xs leading-relaxed text-text">{{ currentTemplate.content }}</pre>
          </div>

          <p v-else class="text-sm text-muted">暂无可用模板。</p>

          <div v-if="showTemplateSwitcher" class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <button
              v-for="template in universalTemplates"
              :key="template.id"
              type="button"
              class="rounded-lg border px-3 py-2 text-left text-xs transition-colors"
              :class="template.id === currentTemplateId
                ? 'border-orange bg-orange/10 text-orange'
                : 'border-gray-200 text-text hover:border-orange hover:bg-orange/5'"
              @click="selectTemplate(template.id)"
            >
              <span class="font-semibold">{{ template.shortLabel || template.title }}</span>
              <span class="ml-1 text-muted">({{ template.id }})</span>
            </button>
          </div>
        </section>

        <section class="rounded-xl border bg-white p-6 shadow-card">
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
            <OrangeButton tone="outline" @click="nextQuestion">Next Question</OrangeButton>
            <OrangeButton tone="outline" @click="clearAll">Clear</OrangeButton>
            <OrangeButton @click="submitEssay">Submit</OrangeButton>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

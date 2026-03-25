<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import { fetchQuestions } from "@/lib/questions";
import { usePracticeStore } from "@/stores/practice";

const router = useRouter();
const practiceStore = usePracticeStore();

const allQuestions = ref([]);
const loading = ref(true);
const searchText = ref("");
const selectedDifficulty = ref("all");

const difficultyOptions = [
  { value: "all", label: "全部" },
  { value: 1, label: "⭐ 简单" },
  { value: 2, label: "⭐⭐ 中等" },
  { value: 3, label: "⭐⭐⭐ 难" }
];

const filteredQuestions = computed(() => {
  let list = [...allQuestions.value];

  if (selectedDifficulty.value !== "all") {
    list = list.filter((item) => Number(item?.difficulty || 2) === selectedDifficulty.value);
  }

  const keyword = searchText.value.trim().toLowerCase();
  if (keyword) {
    list = list.filter(
      (item) =>
        String(item?.content || "")
          .toLowerCase()
          .includes(keyword) ||
        String(item?.id || "")
          .toLowerCase()
          .includes(keyword)
    );
  }

  return list;
});

function difficultyLabel(level) {
  if (Number(level) <= 1) return "简单";
  if (Number(level) >= 3) return "难";
  return "中等";
}

async function startPractice(question) {
  practiceStore.setSelectedQuestion(question);
  router.push("/ra");
}

onMounted(async () => {
  try {
    allQuestions.value = await fetchQuestions("RA");
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="Read Aloud 题库" back-to="/home" />

    <main class="mx-auto max-w-2xl px-4 py-6">
      <div class="relative mb-4">
        <input
          v-model="searchText"
          type="text"
          placeholder="搜索题目内容..."
          class="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm focus:border-orange focus:outline-none"
        />
        <span class="absolute left-3 top-3.5 text-sm text-muted">Q</span>
      </div>

      <div class="mb-4 flex flex-wrap gap-2">
        <button
          v-for="option in difficultyOptions"
          :key="option.value"
          type="button"
          class="rounded-full px-4 py-1.5 text-sm font-medium transition-all"
          :class="
            selectedDifficulty === option.value
              ? 'bg-orange text-white'
              : 'border border-gray-200 bg-white text-muted hover:border-orange'
          "
          @click="selectedDifficulty = option.value"
        >
          {{ option.label }}
        </button>
      </div>

      <p class="mb-4 text-sm text-muted">共 {{ filteredQuestions.length }} 道题</p>

      <div v-if="loading" class="py-16 text-center">
        <div class="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange border-t-transparent" />
        <p class="mt-3 text-sm text-muted">加载题库中...</p>
      </div>

      <div v-else-if="filteredQuestions.length > 0" class="space-y-3">
        <button
          v-for="question in filteredQuestions"
          :key="question.id"
          type="button"
          class="w-full rounded-xl border border-transparent bg-white p-4 text-left shadow-sm transition-all hover:border-orange hover:shadow-md"
          @click="startPractice(question)"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="text-xs font-bold text-orange">{{ question.id }}</span>
                <span
                  class="rounded-full px-2 py-0.5 text-xs"
                  :class="{
                    'bg-green-100 text-green-700': Number(question.difficulty) === 1,
                    'bg-orange/10 text-orange': Number(question.difficulty) === 2 || !question.difficulty,
                    'bg-red-100 text-red-600': Number(question.difficulty) === 3
                  }"
                >
                  {{ difficultyLabel(question.difficulty) }}
                </span>
                <span v-if="question.word_count || question.wordCount" class="text-xs text-muted">
                  {{ question.word_count || question.wordCount }} 词
                </span>
              </div>

              <p class="text-sm leading-relaxed text-text">
                {{ question.content }}
              </p>
            </div>

            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange/10 text-sm font-semibold text-orange">
              GO
            </span>
          </div>
        </button>
      </div>

      <div v-else class="py-16 text-center">
        <p class="text-lg font-bold text-navy">没有找到匹配的题目</p>
        <p class="mt-1 text-sm text-muted">试试其他关键词</p>
      </div>
    </main>
  </div>
</template>

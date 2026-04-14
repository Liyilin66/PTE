<script setup>
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { supabase } from "@/lib/supabase";
import { RTS_TOPIC_META, useRTSData } from "@/composables/useRTSData";

const router = useRouter();
const authStore = useAuthStore();
const { loadQuestions, getTopicStats, getUserRTSStats } = useRTSData();

const loading = ref(true);
const topicCards = ref([]);
const stats = ref({
  todayPracticed: 0,
  totalQuestions: 0,
  averageRating: 0
});
const recentPractices = ref([]);

function goHome() {
  router.push("/home");
}

function goList() {
  router.push("/rts/list");
}

function startRandomPractice() {
  router.push("/rts/practice");
}

function goCategory(topic) {
  const normalized = `${topic || ""}`.trim();
  if (!normalized) return;
  router.push({
    path: "/rts/list",
    query: { category: normalized }
  });
}

function replayQuestion(questionId) {
  const normalized = `${questionId || ""}`.trim();
  if (!normalized) return;
  router.push({
    path: "/rts/practice",
    query: { id: normalized }
  });
}

function renderStars(value) {
  const rating = Math.max(0, Math.min(5, Math.round(Number(value || 0))));
  return "★".repeat(rating).padEnd(5, "☆");
}

function formatDuration(seconds) {
  const normalized = Math.max(0, Math.round(Number(seconds || 0)));
  if (!normalized) return "0:00";
  const m = Math.floor(normalized / 60);
  const s = `${normalized % 60}`.padStart(2, "0");
  return `${m}:${s}`;
}

function topicLabel(topic) {
  return RTS_TOPIC_META[`${topic || ""}`.trim()]?.label || "日常生活";
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function loadDashboard() {
  loading.value = true;
  try {
    const questions = await loadQuestions();
    topicCards.value = getTopicStats(questions);
    const userId = await resolveCurrentUserId();
    if (!userId) {
      stats.value = {
        todayPracticed: 0,
        totalQuestions: questions.length,
        averageRating: 0
      };
      recentPractices.value = [];
      return;
    }

    const userStats = await getUserRTSStats(userId, {
      recentLimit: 3,
      logsLimit: 400
    });
    stats.value = {
      todayPracticed: userStats.todayPracticed,
      totalQuestions: userStats.totalQuestions,
      averageRating: userStats.averageRating
    };
    recentPractices.value = userStats.recentLogs;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void loadDashboard();
});
</script>

<template>
  <div class="min-h-screen bg-[#F0F4F8] [font-family:'DM_Sans',-apple-system,'PingFang_SC',sans-serif]">
    <header class="bg-[#1B3A6B] text-white">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <button type="button" class="text-sm text-white/90 transition-opacity hover:opacity-90" @click="goHome">← 返回</button>
        <p class="text-base font-semibold">RTS 情景回应</p>
        <button
          type="button"
          class="rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-white/10"
          @click="goList"
        >
          题库
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-5">
      <section class="rounded-[14px] bg-[#1B3A6B] p-5 text-white">
        <p class="text-xs uppercase tracking-[0.15em] text-white/75">Respond to a situation</p>
        <h1 class="mt-2 text-3xl font-bold">听懂场景，开口回应</h1>
        <p class="mt-3 text-sm leading-relaxed text-white/90">
          系统播放情景+文字，你需要代入角色给出得体口语回应。系统强调语气与场景匹配，并帮助你快速形成结构化表达。
        </p>

        <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <article class="rounded-xl bg-white/10 px-4 py-3">
            <p class="text-2xl font-bold">{{ stats.todayPracticed }}</p>
            <p class="mt-1 text-xs text-white/80">今日已练</p>
          </article>
          <article class="rounded-xl bg-white/10 px-4 py-3">
            <p class="text-2xl font-bold">{{ stats.totalQuestions }}</p>
            <p class="mt-1 text-xs text-white/80">题库总量</p>
          </article>
          <article class="rounded-xl bg-white/10 px-4 py-3">
            <p class="text-2xl font-bold">{{ stats.averageRating || "0.0" }}</p>
            <p class="mt-1 text-xs text-white/80">平均评分</p>
          </article>
        </div>
      </section>

      <section class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="rounded-[14px] bg-[#E8845A] p-5 text-left text-white transition-transform hover:-translate-y-0.5"
          @click="startRandomPractice"
        >
          <p class="text-sm font-semibold">随机练习</p>
          <p class="mt-2 text-xs text-white/90">从题库随机抽题</p>
        </button>
        <button
          type="button"
          class="rounded-[14px] border border-[#E8EDF5] bg-white p-5 text-left text-[#1B3A6B] transition-colors hover:bg-[#F8FAFD]"
          @click="goList"
        >
          <p class="text-sm font-semibold">选题练习</p>
          <p class="mt-2 text-xs text-[#8CA0C0]">按场景/难度筛选</p>
        </button>
      </section>

      <section class="mt-5">
        <p class="mb-2 text-sm font-semibold text-[#1B3A6B]">按场景分类练习</p>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            v-for="topic in topicCards"
            :key="topic.key"
            type="button"
            class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-left transition-colors hover:bg-[#F8FAFD]"
            @click="goCategory(topic.key)"
          >
            <p class="text-xl">{{ topic.emoji }}</p>
            <p class="mt-1 text-base font-semibold text-[#1E293B]">{{ topic.label }}</p>
            <p class="mt-1 text-xs text-[#8CA0C0]">{{ topic.count }} 题</p>
            <span class="mt-2 inline-flex rounded-full px-2.5 py-1 text-xs" :class="topic.badgeClass">{{ topic.tag }}</span>
          </button>
        </div>
      </section>

      <section class="mt-5">
        <div class="mb-2 flex items-center justify-between">
          <p class="text-sm font-semibold text-[#1B3A6B]">最近练习</p>
          <button type="button" class="text-xs text-[#8CA0C0] hover:text-[#1B3A6B]" @click="goList">查看全部题库</button>
        </div>

        <div v-if="loading" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
          正在读取练习记录...
        </div>

        <div v-else-if="!recentPractices.length" class="rounded-[14px] border border-[#E8EDF5] bg-white p-4 text-sm text-[#8CA0C0]">
          还没有 RTS 练习记录，先来一题随机练习吧。
        </div>

        <div v-else class="space-y-2">
          <button
            v-for="item in recentPractices"
            :key="item.id"
            type="button"
            class="w-full rounded-[14px] border border-[#E8EDF5] bg-white px-4 py-3 text-left transition-colors hover:bg-[#F8FAFD]"
            @click="replayQuestion(item.questionId)"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="line-clamp-1 text-sm font-medium text-[#1E293B]">{{ item.summary }}</p>
              <p class="text-sm text-[#1B3A6B]">[{{ renderStars(item.rating) }}]</p>
            </div>
            <p class="mt-1 text-xs text-[#8CA0C0]">
              {{ topicLabel(item.topic) }} · {{ formatDuration(item.durationSec) }}
            </p>
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

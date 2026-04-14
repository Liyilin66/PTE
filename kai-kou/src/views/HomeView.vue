<script setup>
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import NavBar from "@/components/NavBar.vue";
import { useAuthStore } from "@/stores/auth";
import { usePracticeStore } from "@/stores/practice";
import { supabase } from "@/lib/supabase";
import { getDIQuestionCatalog } from "@/lib/di-data";
import { isDIEnabled } from "@/lib/di-feature";

const router = useRouter();
const authStore = useAuthStore();
const practiceStore = usePracticeStore();
const { tasks } = storeToRefs(practiceStore);

const raTask = computed(() => tasks.value.find((item) => item.id === "ra") || null);
const weTask = computed(() => tasks.value.find((item) => item.id === "we") || null);
const wfdTask = computed(() => tasks.value.find((item) => item.id === "wfd") || null);
const rtsTask = computed(() => tasks.value.find((item) => item.id === "rts") || null);
const otherTaskOrder = {
  rs: 0,
  rl: 1
};
const otherTasks = computed(() =>
  tasks.value
    .filter((item) => item.id !== "ra" && item.id !== "we" && item.id !== "wfd" && item.id !== "rts")
    .sort((a, b) => {
      const aOrder = Number.isFinite(otherTaskOrder[a.id]) ? otherTaskOrder[a.id] : 99;
      const bOrder = Number.isFinite(otherTaskOrder[b.id]) ? otherTaskOrder[b.id] : 99;
      return aOrder - bOrder;
    })
);
const diEnabled = computed(() => isDIEnabled());
const showDIFavorites = ref(false);
const diFavoriteQuestionIds = ref([]);
const loadingDIFavorites = ref(false);
const rtsFavoriteQuestionIds = ref([]);
const loadingRTSFavorites = ref(false);
const rtsFavoriteCount = computed(() => rtsFavoriteQuestionIds.value.length);
const diQuestionCatalog = getDIQuestionCatalog();
const diQuestionMap = new Map(diQuestionCatalog.map((item) => [item.id, item]));
const diFavoriteQuestions = computed(() =>
  diFavoriteQuestionIds.value
    .map((id) => {
      const found = diQuestionMap.get(id);
      if (!found) return { id, sourceNumberLabel: id, displayTitle: id, imageType: "" };
      return found;
    })
    .filter(Boolean)
);

const buttonBaseClass =
  "w-full cursor-pointer rounded-[10px] py-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#1B3A6B]";
const buttonPrimaryClass = `${buttonBaseClass} border-0 bg-[#1B3A6B] text-white hover:bg-[#16326A]`;
const buttonSecondaryClass = `${buttonBaseClass} border-[1.5px] border-[#C8D5E8] bg-white text-[#1B3A6B] hover:border-[#1B3A6B] hover:bg-[#F0F4F8]`;
const buttonTertiaryClass = `${buttonBaseClass} border-[1.5px] border-[#C8D5E8] bg-white text-[#1B3A6B] hover:border-[#1B3A6B] hover:bg-[#F0F4F8]`;
const buttonFeatureTertiaryClass = `${buttonBaseClass} border-[1.5px] border-[#C8D5E8] bg-[#EBF0FA] text-[#1B3A6B] hover:border-[#1B3A6B] hover:bg-[#F0F4F8]`;
const buttonTertiaryHighlightClass =
  `${buttonBaseClass} border-[1.5px] border-[#C8D5E8] bg-white text-[#1B3A6B] hover:border-[#1B3A6B] hover:bg-[#F0F4F8]`;

const otherTaskSelectPathMap = {
  rs: "/rs",
  rl: "/rl"
};

const otherTaskTertiaryMap = {
  rs: {
    label: "句型强化",
    to: "/rs"
  },
  rl: {
    label: "结构模板",
    to: "/rl"
  }
};

function favoriteLocalStorageKey(userId, taskType = "DI") {
  const normalizedTaskType = `${taskType || "DI"}`.trim().toLowerCase();
  return `kai_kou_${normalizedTaskType}_favorites_${userId}`;
}

function readLocalFavorites(userId, taskType = "DI") {
  const key = favoriteLocalStorageKey(userId, taskType);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => `${item || ""}`.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function writeLocalFavorites(userId, ids, taskType = "DI") {
  const key = favoriteLocalStorageKey(userId, taskType);
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // no-op
  }
}

function isMissingFavoritesTableError(error) {
  const code = `${error?.code || ""}`.toUpperCase();
  const message = `${error?.message || ""}`.toLowerCase();
  if (code === "42P01") return true;
  return message.includes("relation") && message.includes("favorites");
}

async function resolveCurrentUserId() {
  const authUserId = `${authStore.user?.id || ""}`.trim();
  if (authUserId) return authUserId;
  const { data } = await supabase.auth.getSession();
  return `${data?.session?.user?.id || ""}`.trim();
}

async function loadDIFavorites() {
  if (!diEnabled.value || !authStore.canPractice) {
    diFavoriteQuestionIds.value = [];
    return;
  }

  loadingDIFavorites.value = true;
  try {
    const userId = await resolveCurrentUserId();
    if (!userId) {
      diFavoriteQuestionIds.value = [];
      return;
    }

    const localFavorites = readLocalFavorites(userId, "DI");
    let orderedIds = [...localFavorites];

    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("question_id, created_at")
        .eq("user_id", userId)
        .eq("task_type", "DI")
        .order("created_at", { ascending: false });

      if (error) {
        if (!isMissingFavoritesTableError(error)) throw error;
      } else {
        const remoteIds = (Array.isArray(data) ? data : [])
          .map((item) => `${item?.question_id || ""}`.trim())
          .filter(Boolean);
        const merged = [...remoteIds, ...localFavorites];
        orderedIds = [...new Set(merged)];
        writeLocalFavorites(userId, orderedIds, "DI");
      }
    } catch {
      // keep local fallback
    }

    diFavoriteQuestionIds.value = orderedIds;
  } finally {
    loadingDIFavorites.value = false;
  }
}

async function loadRTSFavorites() {
  if (!rtsTask.value) {
    rtsFavoriteQuestionIds.value = [];
    return;
  }

  loadingRTSFavorites.value = true;
  try {
    const userId = await resolveCurrentUserId();
    if (!userId) {
      rtsFavoriteQuestionIds.value = [];
      return;
    }

    const localFavorites = readLocalFavorites(userId, "RTS");
    let orderedIds = [...localFavorites];

    try {
      const { data, error } = await supabase
        .from("favorites")
        .select("question_id, created_at")
        .eq("user_id", userId)
        .eq("task_type", "RTS")
        .order("created_at", { ascending: false });

      if (error) {
        if (!isMissingFavoritesTableError(error)) throw error;
      } else {
        const remoteIds = (Array.isArray(data) ? data : [])
          .map((item) => `${item?.question_id || ""}`.trim())
          .filter(Boolean);
        const merged = [...remoteIds, ...localFavorites];
        orderedIds = [...new Set(merged)];
        writeLocalFavorites(userId, orderedIds, "RTS");
      }
    } catch {
      // keep local fallback
    }

    rtsFavoriteQuestionIds.value = orderedIds;
  } finally {
    loadingRTSFavorites.value = false;
  }
}

function startDIRandomPractice() {
  router.push("/di");
}

function startRTSRandomPractice() {
  router.push("/rts/practice");
}

function openRTSSelectPractice() {
  router.push("/rts/list");
}

function openRTSTemplateLibrary() {
  router.push("/rts/templates");
}

function openRTSFavorites() {
  router.push("/rts/favorites");
}

function openDIFavoriteQuestion(questionId) {
  const id = `${questionId || ""}`.trim();
  if (!id) return;
  router.push({
    path: "/di",
    query: { qid: id }
  });
}

function openOtherTaskRandom(task) {
  const to = `${task?.to || ""}`.trim();
  if (!to) return;
  router.push(to);
}

function openOtherTaskSelect(task) {
  const taskId = `${task?.id || ""}`.trim();
  const to = `${otherTaskSelectPathMap[taskId] || task?.to || ""}`.trim();
  if (!to) return;
  router.push(to);
}

function otherTaskTertiaryLabel(task) {
  const taskId = `${task?.id || ""}`.trim();
  return otherTaskTertiaryMap[taskId]?.label || "";
}

function openOtherTaskTertiary(task) {
  const taskId = `${task?.id || ""}`.trim();
  const to = `${otherTaskTertiaryMap[taskId]?.to || task?.to || ""}`.trim();
  if (!to) return;
  router.push(to);
}

onMounted(() => {
  void loadDIFavorites();
  void loadRTSFavorites();
});
</script>

<template>
  <div class="min-h-screen bg-bg">
    <NavBar title="PTE 50+ 速通训练营" home show-login />

    <div class="py-4 text-center text-[#1A1A2E]">
      <p class="text-lg">放弃完美，拥抱流利</p>
    </div>

    <div class="mx-auto max-w-6xl px-4 pb-8">
      <section class="mb-6 rounded-xl border bg-card p-6 shadow-card">
        <div class="flex items-center justify-between gap-4">
          <div>
            <h2 class="text-lg font-bold text-[#1A1A2E]">账号权限状态</h2>
            <p class="text-sm text-[#6B7280]">权限统一由 VIP 或管理员赠送试用控制</p>
          </div>
          <span
            class="rounded-full px-3 py-1 text-sm font-medium"
            :class="authStore.isPremium ? 'bg-green-100 text-green-700' : authStore.isInTrial ? 'bg-orange/10 text-orange' : 'bg-gray-100 text-gray-500'"
          >
            {{ authStore.statusText }}
          </span>
        </div>
      </section>

      <section class="mb-6 space-y-4">
        <article v-if="raTask" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1E4A86] text-white">
              <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.1">
                <path d="M12 1v11" />
                <path d="M8 6v5a4 4 0 0 0 8 0V6" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v5" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">{{ raTask.title }}</h3>
              <p class="text-sm font-medium text-orange">{{ raTask.subtitle }}</p>
              <p class="mt-1 text-sm text-[#6B7280]">{{ raTask.description }}</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="buttonPrimaryClass"
                @click="router.push('/ra')"
              >
                随机练习
              </button>
              <button
                type="button"
                :class="buttonSecondaryClass"
                @click="router.push('/ra/list')"
              >
                选题练习
              </button>
            </div>
          </div>
        </article>

        <article v-if="wfdTask" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F3054E] text-white">
              <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 13v-2a8 8 0 1 1 16 0v2" />
                <path d="M4 13v4a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2z" />
                <path d="M20 13v4a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2z" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">{{ wfdTask.title }}</h3>
              <p class="text-sm font-medium text-orange">{{ wfdTask.subtitle }}</p>
              <p class="mt-1 text-sm text-[#6B7280]">{{ wfdTask.description }}</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="mt-1 flex flex-col gap-2">
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  :class="buttonPrimaryClass"
                  @click="router.push('/wfd')"
                >
                  随机练习
                </button>
                <button
                  type="button"
                  :class="buttonSecondaryClass"
                  @click="router.push('/wfd/list')"
                >
                  选题练习
                </button>
              </div>
              <button
                type="button"
                :class="buttonFeatureTertiaryClass"
                @click="router.push('/wfd/listen')"
              >
                <span class="inline-flex items-center justify-center gap-1.5">
                  <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 13v-2a8 8 0 1 1 16 0v2" />
                    <path d="M4 13v4a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2z" />
                    <path d="M20 13v4a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>磨耳朵模式</span>
                </span>
              </button>
            </div>
          </div>
        </article>

        <article v-if="weTask" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#00AA45] text-white">
              <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M7 3h8l4 4v14H7z" />
                <path d="M15 3v5h5" />
                <path d="M10 12h6M10 16h6" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">{{ weTask.title }}</h3>
              <p class="text-sm font-medium text-orange">{{ weTask.subtitle }}</p>
              <p class="mt-1 text-sm text-[#6B7280]">{{ weTask.description }}</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="flex flex-col gap-2">
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  :class="buttonPrimaryClass"
                  @click="router.push('/we')"
                >
                  随机练习
                </button>
                <button
                  type="button"
                  :class="buttonSecondaryClass"
                  @click="router.push('/we/select')"
                >
                  选题练习
                </button>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  :class="buttonTertiaryClass"
                  @click="router.push('/we/templates')"
                >
                  看模板
                </button>
                <button
                  type="button"
                  :class="buttonTertiaryClass"
                  @click="router.push('/we/opinions')"
                >
                  观点句
                </button>
              </div>
            </div>
          </div>
        </article>

        <article v-if="rtsTask" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1B3A6B] text-white">
              <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 5h14v9H9l-4 4z" />
                <path d="M12 9h4" />
                <path d="M8 12h8" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">{{ rtsTask.title }}</h3>
              <p class="text-sm font-medium text-orange">{{ rtsTask.subtitle }}</p>
              <p class="mt-1 text-sm text-[#6B7280]">{{ rtsTask.description }}</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="buttonPrimaryClass"
                @click="startRTSRandomPractice"
              >
                随机练习
              </button>
              <button
                type="button"
                :class="buttonSecondaryClass"
                @click="openRTSSelectPractice"
              >
                选题练习
              </button>
              <button
                type="button"
                :class="buttonFeatureTertiaryClass"
                @click="openRTSTemplateLibrary"
              >
                模版库
              </button>
              <button
                type="button"
                :class="buttonTertiaryHighlightClass"
                @click="openRTSFavorites"
              >
                <span class="inline-flex items-center justify-center gap-1.5">
                  <span>RTS 收藏</span>
                  <span class="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#E8845A] px-1.5 py-[1px] text-[11px] font-medium leading-4 text-white">
                    {{ rtsFavoriteCount }}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </article>

        <article v-if="diEnabled" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#7A1DE6] text-white">
              <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16v12H4z" />
                <path d="M8 20h8" />
                <path d="M12 16v4" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">DI - 图片描述</h3>
              <p class="text-sm font-medium text-orange">口语起步器 · 结构稳定器</p>
              <p class="mt-1 text-sm text-[#6B7280]">不看分数，先把“看图开口”练成肌肉记忆。</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :class="buttonPrimaryClass"
                @click="startDIRandomPractice"
              >
                随机练习
              </button>
              <button
                type="button"
                :class="buttonSecondaryClass"
                @click="router.push('/di/select')"
              >
                选题练习
              </button>
              <button
                type="button"
                :class="buttonFeatureTertiaryClass"
                @click="router.push('/di/templates')"
              >
                模板库
              </button>
              <button
                type="button"
                :class="buttonTertiaryHighlightClass"
                @click="showDIFavorites = !showDIFavorites"
              >
                <span class="inline-flex items-center justify-center gap-1.5">
                  <span>{{ showDIFavorites ? "收起收藏" : "DI 收藏" }}</span>
                  <span class="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[#E8845A] px-1.5 py-[1px] text-[11px] font-medium leading-4 text-white">
                    {{ diFavoriteQuestions.length }}
                  </span>
                </span>
              </button>
            </div>

            <div v-if="showDIFavorites" class="mt-3 rounded-lg border border-[#E8EDF5] bg-[#F8FAFD] p-3">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-xs font-semibold text-[#1A1A2E]">DI 全部收藏</p>
                <span class="text-xs text-[#6B7280]">{{ diFavoriteQuestions.length }} 题</span>
              </div>

              <div v-if="loadingDIFavorites" class="text-xs text-[#6B7280]">收藏加载中...</div>
              <div v-else-if="diFavoriteQuestions.length" class="max-h-48 space-y-2 overflow-y-auto">
                <button
                  v-for="item in diFavoriteQuestions"
                  :key="item.id"
                  type="button"
                  class="flex w-full items-center justify-between rounded-md border border-[#E8EDF5] bg-white px-2 py-2 text-left text-xs text-[#1A1A2E] transition-colors hover:bg-[#F4F7FB]"
                  @click="openDIFavoriteQuestion(item.id)"
                >
                  <span class="min-w-0 truncate">{{ item.sourceNumberLabel || item.id }} · {{ item.displayTitle || item.id }}</span>
                  <span class="ml-2 shrink-0 rounded bg-[#EEF2FF] px-2 py-0.5 text-[11px] text-[#1E40AF]">{{ item.imageType || "-" }}</span>
                </button>
              </div>
              <p v-else class="text-xs text-[#6B7280]">暂无 DI 收藏题目。</p>
            </div>
          </div>
        </article>

        <article v-for="task in otherTasks" :key="task.id" class="overflow-hidden rounded-xl border bg-card shadow-card">
          <div class="flex items-center gap-4 p-4">
            <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" :class="task.iconBg">
              <svg v-if="task.icon === 'ra'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2.1">
                <path d="M12 1v11" />
                <path d="M8 6v5a4 4 0 0 0 8 0V6" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v5" />
              </svg>
              <svg v-else-if="task.icon === 'rs'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 6h14v9H9l-4 4z" />
              </svg>
              <svg v-else-if="task.icon === 'rl'" viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 9a6 6 0 0 1 6-6v12a6 6 0 0 1-6-6z" />
                <path d="M13 8a4 4 0 0 1 0 8" />
                <path d="M17 6a7 7 0 0 1 0 12" />
              </svg>
              <svg v-else viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 13v-2a8 8 0 1 1 16 0v2" />
                <path d="M4 13v4a2 2 0 0 0 2 2h2v-6H6a2 2 0 0 0-2 2z" />
                <path d="M20 13v4a2 2 0 0 1-2 2h-2v-6h2a2 2 0 0 1 2 2z" />
              </svg>
            </div>

            <div class="min-w-0 flex-1">
              <h3 class="text-base font-bold text-[#1A1A2E]">{{ task.title }}</h3>
              <p class="text-sm font-medium text-orange">{{ task.subtitle }}</p>
              <p class="mt-1 text-sm text-[#6B7280]">{{ task.description }}</p>
            </div>
          </div>

          <div class="px-4 pb-4">
            <div class="grid grid-cols-2 gap-2">
              <button type="button" :class="buttonPrimaryClass" @click="openOtherTaskRandom(task)">随机练习</button>
              <button type="button" :class="buttonSecondaryClass" @click="openOtherTaskSelect(task)">选题练习</button>
            </div>
            <div v-if="otherTaskTertiaryLabel(task)" class="mt-2">
              <button type="button" :class="buttonTertiaryClass" @click="openOtherTaskTertiary(task)">
                {{ otherTaskTertiaryLabel(task) }}
              </button>
            </div>
          </div>
        </article>
      </section>

      <section class="rounded-xl border bg-navy p-6 text-white shadow-card">
        <div class="flex items-start gap-4">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
            <svg viewBox="0 0 24 24" class="h-6 w-6 text-[#D6E2FF]" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="8" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h3 class="mb-3 text-lg font-bold">开发者的 14 天逆袭故事</h3>
            <p class="mb-4 leading-relaxed text-white/90">
              实不相瞒，做这个网站的初衷，是因为我曾是被移民局不幸抽查语言成绩的‘天选大冤种’😭！官方限死28天内必须交成绩，当时天都要塌了... 
              绝望中我悟了：短期提分，关键根本不是追求完美，而是把最基础的输出练到稳定、流利、可复盘。调整策略后我死磕了14天，结果不仅顺利上岸，
              甚至还超了目标10分！🔥 这才有了现在这个拒绝焦虑、只抓核心的‘开口’。
            </p>
            <p class="text-base font-medium text-[#E8845A]">如果我可以，你也可以。</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

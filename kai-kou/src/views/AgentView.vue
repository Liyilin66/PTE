<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { parseAgentContent } from "@/lib/agent-rich-content";
import { loadAgentOverview, requestDailyAiSuggestion, sendAgentMessage } from "@/lib/agent";
import { useAuthStore } from "@/stores/auth";

const DESIGN_WIDTH = 2560;
const DESIGN_HEIGHT = 1399;
const MAX_DESKTOP_SCALE = 0.67;
const MAX_RECENT_MESSAGES = 10;

const router = useRouter();
const authStore = useAuthStore();

const draft = ref("");
const pending = ref(false);
const messagesBodyRef = ref(null);
const conversationId = ref(`agent_${Date.now().toString(36)}`);
const messages = ref([]);
const agentOverview = ref(null);
const autoScrollEnabled = ref(false);
const dailySuggestionState = ref({
  loading: false,
  source: "mock",
  suggestion: null
});
const replicaScale = ref(MAX_DESKTOP_SCALE);
const avatarLoadFailed = ref(false);

const navItems = [
  { key: "home", label: "首页", icon: "home", target: "/home" },
  { key: "practice", label: "练习中心", icon: "list", target: "/home#quick" },
  { key: "agent", label: "AI 私教", icon: "spark", target: "/agent", active: true },
  { key: "plan", label: "学习计划", icon: "square", target: "/home#goal" },
  { key: "report", label: "学习报告", icon: "report", target: "/home#report" },
  { key: "library", label: "题库", icon: "box", target: "/home#quick" },
  { key: "profile", label: "个人中心", icon: "circle", target: "/profile" }
];

const quickActions = [
  {
    id: "weakness",
    label: "分析我的弱项",
    prompt: "根据我最近的练习记录，帮我分析当前最弱的题型和原因。",
    icon: "trend"
  },
  {
    id: "today-plan",
    label: "生成今日计划",
    prompt: "根据我最近的练习记录，帮我生成今天的训练计划。",
    icon: "calendar"
  },
  {
    id: "explain-score",
    label: "解释这次低分",
    prompt: "为什么这次 DI 分低？请结合我最近的记录，直接告诉我主要问题和改进方向。",
    icon: "question"
  },
  {
    id: "training",
    label: "安排 40 分钟训练",
    prompt: "帮我安排今晚 40 分钟训练，按题型和时间拆成可执行步骤。",
    icon: "clock"
  },
  {
    id: "encourage",
    label: "给我鼓励一下",
    prompt: "我有点没信心了，请根据我的备考情况鼓励我一下，并给我一个马上能做的小任务。",
    icon: "heart"
  }
];

const emptyFeatureActions = quickActions.slice(0, 4);

const emptyInfoCards = [
  {
    id: "ask",
    title: "你可以这样问",
    icon: "message",
    items: ["我口语流利度总是扣分，怎么办？", "写作 Task 2 如何提高逻辑性？", "Describe Image 的高分技巧？"]
  },
  {
    id: "help",
    title: "它可以帮你做什么",
    icon: "star",
    items: ["分析练习数据，定位薄弱项", "提供个性化学习建议与方法", "制定计划并跟踪学习进度"]
  },
  {
    id: "recommend",
    title: "根据最近练习推荐",
    icon: "like",
    items: ["为什么阅读选择题正确率低？", "听力填空总丢分，如何突破？", "口语发音如何快速改善？"]
  }
];

const recommendedQuestions = [
  {
    text: "我在 DI 上有哪些具体弱点？",
    prompt: "我在 DI 上有哪些具体弱点？请结合我的练习记录给出优先级。"
  },
  {
    text: "如何提升 RTS 复述流畅度？",
    prompt: "如何提升 RTS 复述流畅度？请给我 3 个可以今天执行的训练动作。"
  },
  {
    text: "WFD 写作如何拿高分？",
    prompt: "WFD 写作如何拿高分？请按听写、拼写、复盘三个阶段说明。"
  },
  {
    text: "口语发音如何改进？",
    prompt: "口语发音如何改进？请指出最容易提分的练习方式。"
  }
];

const planItems = [
  { id: "ra", type: "RA", label: "复述题训练", minutes: 10, path: "/ra", color: "#34c9a2" },
  { id: "di", type: "DI", label: "图表专项练习", minutes: 15, path: "/di", color: "#49c9a7" },
  { id: "rts", type: "RTS", label: "复述句子", minutes: 10, path: "/rts", color: "#ff9142" },
  { id: "we", type: "WE", label: "学术短文写作", minutes: 5, path: "/we", color: "#a7adb8" }
];

const fallbackConclusion = {
  title: "DI 是当前提分关键点，主要问题是信息抓取不完整和时间分配不均。专注图表分析和关键信息表达，可快速提升分数上限。",
  cta: "查看详情"
};

watch(
  () => [messages.value.length, pending.value],
  async () => {
    if (!autoScrollEnabled.value) return;
    await nextTick();
    scrollToBottom(pending.value ? "auto" : "smooth");
  }
);

const scaledSlotStyle = computed(() => ({
  width: `${Math.ceil(DESIGN_WIDTH * replicaScale.value)}px`,
  height: `${Math.ceil(DESIGN_HEIGHT * replicaScale.value)}px`
}));

const canvasScaleStyle = computed(() => ({
  transform: `scale(${replicaScale.value})`
}));

const userDisplayName = computed(() => {
  if (!authStore.isLoggedIn && authStore.loaded) return "未登录";
  return authStore.displayName || "yli71641";
});

const userAvatarUrl = computed(() => `${authStore.avatarUrl || ""}`.trim());
const showUserAvatar = computed(() => Boolean(userAvatarUrl.value) && !avatarLoadFailed.value);
const userInitial = computed(() => {
  const first = `${userDisplayName.value || ""}`.trim().charAt(0);
  return first ? first.toUpperCase() : "Y";
});

const recentTaskSnapshot = computed(() => agentOverview.value?.recentTaskSnapshot || null);
const dailyConclusion = computed(() => {
  const suggestion = dailySuggestionState.value.suggestion;
  const headline = normalizeReadableText(suggestion?.headline);
  const reason = normalizeReadableText(suggestion?.reason);
  const advice = normalizeReadableText(suggestion?.advice);

  if (suggestion && (headline || reason || advice)) {
    return {
      title: [headline, reason, advice].filter(Boolean).join(" "),
      cta: normalizeReadableText(suggestion?.cta_text) || fallbackConclusion.cta
    };
  }

  return fallbackConclusion;
});

const totalPlanMinutes = computed(() => planItems.reduce((total, item) => total + item.minutes, 0));
const isConversationEmpty = computed(() => messages.value.length === 0);

onMounted(async () => {
  updateReplicaScale();
  window.addEventListener("resize", updateReplicaScale);

  await authStore.init();
  if (authStore.isLoggedIn && !authStore.loaded) {
    await authStore.loadStatus();
  }

  await loadOverview();

  await nextTick();
  void loadDailySuggestion();
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateReplicaScale);
});

function updateReplicaScale() {
  if (typeof window === "undefined") return;
  const widthScale = window.innerWidth / DESIGN_WIDTH;
  const heightScale = window.innerHeight / DESIGN_HEIGHT;
  replicaScale.value = Number(Math.max(0.1, Math.min(widthScale, heightScale, MAX_DESKTOP_SCALE)).toFixed(4));
}

async function loadOverview() {
  try {
    agentOverview.value = await loadAgentOverview(authStore);
  } catch {
    agentOverview.value = null;
  }
}

async function loadDailySuggestion() {
  dailySuggestionState.value = {
    loading: true,
    source: "mock",
    suggestion: null
  };

  try {
    const result = await requestDailyAiSuggestion({
      force: false,
      practiceSignature: buildPracticeSignature()
    });
    if (result?.ok && result?.suggestion) {
      dailySuggestionState.value = {
        loading: false,
        source: normalizeText(result.source) || "backend",
        suggestion: result.suggestion
      };
      return;
    }
  } catch {
    // Keep the screenshot-accurate static content when the AI summary endpoint is not available.
  }

  dailySuggestionState.value = {
    loading: false,
    source: "mock",
    suggestion: null
  };
}

function buildPracticeSignature() {
  const snapshot = recentTaskSnapshot.value;
  if (!snapshot) return "";
  return [
    snapshot.recentAttempts,
    snapshot.recent7DayAttempts,
    snapshot.averageScore,
    snapshot.weakTaskType
  ].map((item) => normalizeText(item)).join(":");
}

async function handleSubmit(rawMessage = draft.value) {
  const message = normalizeText(rawMessage);
  if (!message || pending.value) return;

  autoScrollEnabled.value = true;
  messages.value.push(createMessage("user", message));
  const recentMessages = buildRecentMessagesPayload(messages.value);
  if (normalizeText(draft.value) === message) {
    draft.value = "";
  }

  pending.value = true;

  try {
    const result = await sendAgentMessage(message, conversationId.value, recentMessages);
    if (result.ok) {
      messages.value.push(
        createMessage(
          "assistant",
          normalizeText(result.reply) || "我已经收到你的问题，接下来会给你更具体的训练建议。"
        )
      );
      return;
    }

    messages.value.push(
      createMessage("assistant", createFallbackReply(message), {
        metaLabel: "AI 私教 · fallback"
      })
    );
  } catch {
    messages.value.push(
      createMessage("assistant", createFallbackReply(message), {
        metaLabel: "AI 私教 · fallback"
      })
    );
  } finally {
    pending.value = false;
  }
}

function handleQuickAction(action) {
  const prompt = normalizeText(action?.prompt);
  if (!prompt) return;
  void handleSubmit(prompt);
}

function createFallbackReply(message) {
  const topic = normalizeText(message) || "这个问题";
  return `（前端 fallback）我已经收到你的问题：「${topic}」。当前 AI 私教接口暂时不可用，所以先给你一个安全占位建议：先选一个最想提升的题型，完成 10 分钟练习，再回来让我根据结果继续拆解。`;
}

function handleRecommendedQuestion(item) {
  const prompt = normalizeText(item?.prompt || item?.text);
  if (!prompt) return;
  void handleSubmit(prompt);
}

function handleConclusionDetail() {
  void handleSubmit("请展开说明今天 AI 结论里的问题，并给我一个可以马上执行的提分步骤。");
}

function handleStartTraining() {
  const firstPath = planItems[0]?.path || "/ra";
  openPath(firstPath);
}

function handleNav(item) {
  if (!item?.target) return;
  openPath(item.target);
}

function openPath(path) {
  const normalized = normalizeText(path);
  if (!normalized) return;

  if (normalized.includes("#")) {
    const [routePath, hash] = normalized.split("#");
    router.push(routePath || "/home").then(() => {
      if (hash) {
        window.setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
      }
    });
    return;
  }

  router.push(normalized);
}

function scrollToBottom(behavior = "smooth") {
  const container = messagesBodyRef.value;
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior
  });
}

function createMessage(role, content, options = {}) {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: normalizeText(content),
    time: normalizeText(options.time) || formatCurrentTime(),
    tone: options.tone || "default",
    metaLabel: normalizeText(options.metaLabel || (role === "assistant" ? "AI 私教" : "你"))
  };
}

function buildRecentMessagesPayload(sourceMessages) {
  return (Array.isArray(sourceMessages) ? sourceMessages : [])
    .filter((item) => item?.tone !== "error")
    .map((item) => ({
      role: normalizeText(item?.role).toLowerCase(),
      content: normalizeText(item?.content)
    }))
    .filter((item) => (item.role === "user" || item.role === "assistant") && item.content)
    .slice(-MAX_RECENT_MESSAGES);
}

function formatCurrentTime(date = new Date()) {
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${hour}:${minute}`;
}

function renderMessageContent(value) {
  return parseAgentContent(value);
}

function handleComposerKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey) return;

  event.preventDefault();
  if (pending.value || !draft.value.trim()) return;
  void handleSubmit();
}

function handleAvatarError() {
  avatarLoadFailed.value = true;
}

function normalizeReadableText(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (/[�]/.test(normalized)) return "";
  if (/(?:绉|璇|寤|浠|鍒|鏃|鐢|缁|浜|鍙|噺)/.test(normalized)) return "";
  return normalized;
}

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}
</script>

<template>
  <div class="agent-replica-page">
    <div class="agent-scale-slot" :style="scaledSlotStyle">
      <div class="agent-canvas" :style="canvasScaleStyle">
        <aside class="agent-sidebar">
          <div class="agent-brand">
            <div class="agent-brand-mark" aria-hidden="true"></div>
            <div class="agent-brand-text">开口</div>
          </div>

          <nav class="agent-nav" aria-label="AI 私教页面导航">
            <button
              v-for="item in navItems"
              :key="item.key"
              class="agent-nav-item"
              :class="{ 'agent-nav-item--active': item.active }"
              type="button"
              @click="handleNav(item)"
            >
              <span class="agent-nav-icon" :class="`agent-nav-icon--${item.icon}`" aria-hidden="true"></span>
              <span>{{ item.label }}</span>
            </button>
          </nav>

          <section class="agent-resource-card">
            <p class="agent-resource-title">PTE 备考资料包</p>
            <p class="agent-resource-copy">真题 · 高频词汇 · 模板</p>
            <button class="agent-resource-button" type="button">免费领取</button>
            <div class="agent-gift" aria-hidden="true">
              <span class="agent-gift-box"></span>
              <span class="agent-gift-lid"></span>
              <span class="agent-gift-ribbon"></span>
            </div>
          </section>
        </aside>

        <main class="agent-main">
          <header class="agent-topbar">
            <div class="agent-greeting">
              <h1>你好，{{ userDisplayName }} <span>👋</span></h1>
              <p>坚持每天进步一点点，PTE 梦想更进一步！</p>
            </div>

            <div class="agent-top-actions">
              <label class="agent-search" aria-label="搜索">
                <input type="search" placeholder="搜索练习、题库、报告..." />
                <span aria-hidden="true"></span>
              </label>

              <button class="agent-profile" type="button" @click="openPath('/profile')">
                <span class="agent-profile-avatar" aria-hidden="true">
                  <img v-if="showUserAvatar" :src="userAvatarUrl" :alt="`${userDisplayName}头像`" @error="handleAvatarError" />
                  <b v-else>{{ userInitial }}</b>
                </span>
                <strong>{{ userDisplayName }}</strong>
                <svg class="agent-profile-chevron" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5.5 7.5 10 12l4.5-4.5" />
                </svg>
              </button>
            </div>
          </header>

          <section class="agent-content">
            <section class="agent-chat-card" :class="{ 'agent-chat-card--empty': isConversationEmpty }">
              <div v-if="!isConversationEmpty" class="agent-hero">
                <img class="agent-hero-bot" src="/agent/hero-bot.png" alt="AI 私教机器人" />
                <div class="agent-hero-copy">
                  <div class="agent-hero-title-row">
                    <h2>AI 私教</h2>
                    <span>智能陪练 · 精准提分</span>
                  </div>
                  <p>根据你的练习记录，给你更具体、更可执行的备考建议</p>
                </div>
                <span class="agent-hero-star agent-hero-star--left" aria-hidden="true">✦</span>
                <span class="agent-hero-star agent-hero-star--mid" aria-hidden="true">✦</span>
                <span class="agent-hero-star agent-hero-star--right" aria-hidden="true">✦</span>
                <span class="agent-hero-wave" aria-hidden="true"></span>
              </div>

              <div class="agent-chat-body" :class="{ 'agent-empty-panel': isConversationEmpty }">
                <div v-if="isConversationEmpty" class="agent-empty-state">
                  <div class="agent-empty-inner">
                    <section class="agent-empty-intro" aria-label="AI 私教空状态欢迎">
                      <h2>开始和 <span>AI 私教</span> 对话</h2>
                      <p>基于你的练习记录，我会为你分析问题、提供建议并帮你制定提升计划。</p>
                    </section>

                    <div class="agent-empty-feature-grid" aria-label="AI 私教快捷功能">
                      <button
                        v-for="action in emptyFeatureActions"
                        :key="action.id"
                        type="button"
                        class="agent-empty-feature-card"
                        :class="`agent-empty-feature-card--${action.icon}`"
                        :disabled="pending"
                        @click="handleQuickAction(action)"
                      >
                        <span class="agent-empty-feature-icon">
                          <span class="agent-quick-icon" :class="`agent-quick-icon--${action.icon}`" aria-hidden="true"></span>
                        </span>
                        <span class="agent-empty-feature-copy">
                          <strong>{{ action.label }}</strong>
                          <em v-if="action.id === 'weakness'">精准找出薄弱环节<br />针对性提升</em>
                          <em v-else-if="action.id === 'today-plan'">根据你的时间与目标<br />定制专属计划</em>
                          <em v-else-if="action.id === 'explain-score'">深入解析失分原因<br />理解得分要点</em>
                          <em v-else>智能搭配题型组合<br />高效利用时间</em>
                        </span>
                      </button>
                    </div>

                    <div class="agent-empty-info-grid" aria-label="AI 私教说明卡片">
                      <section v-for="card in emptyInfoCards" :key="card.id" class="agent-empty-info-card">
                        <h3>
                          <span class="agent-empty-info-icon" :class="`agent-empty-info-icon--${card.icon}`" aria-hidden="true"></span>
                          {{ card.title }}
                        </h3>
                        <ul>
                          <li v-for="item in card.items" :key="item">{{ item }}</li>
                        </ul>
                        <button type="button" :disabled="pending" @click="handleSubmit(card.items[0])" aria-label="发送示例问题">
                          <span aria-hidden="true">→</span>
                        </button>
                      </section>
                    </div>
                  </div>
                </div>

                <div v-else ref="messagesBodyRef" class="agent-message-list">
                  <div
                    v-for="message in messages"
                    :key="message.id"
                    class="agent-message"
                    :class="message.role === 'user' ? 'agent-message--user' : 'agent-message--assistant'"
                  >
                    <img
                      v-if="message.role === 'assistant'"
                      class="agent-message-avatar agent-message-avatar--assistant"
                      src="/agent/assistant-avatar.png"
                      alt="AI 私教头像"
                    />

                    <div class="agent-message-stack">
                      <label v-if="message.role === 'assistant'" class="agent-message-label">{{ message.metaLabel }}</label>
                      <div class="agent-bubble" :class="{ 'agent-bubble--error': message.tone === 'error' }">
                        <div class="agent-bubble-content">
                          <template v-for="(block, blockIndex) in renderMessageContent(message.content)" :key="`${message.id}-${blockIndex}`">
                            <p v-if="block.type === 'paragraph'" class="agent-bubble-paragraph">
                              {{ block.text }}
                            </p>

                            <div v-else-if="block.type === 'table'" class="agent-table-wrap">
                              <table class="agent-table">
                                <thead>
                                  <tr>
                                    <th
                                      v-for="(header, headerIndex) in block.headers"
                                      :key="`${message.id}-${blockIndex}-header-${headerIndex}`"
                                    >
                                      {{ header }}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr
                                    v-for="(row, rowIndex) in block.rows"
                                    :key="`${message.id}-${blockIndex}-row-${rowIndex}`"
                                  >
                                    <td
                                      v-for="(cell, cellIndex) in row"
                                      :key="`${message.id}-${blockIndex}-row-${rowIndex}-cell-${cellIndex}`"
                                    >
                                      {{ cell }}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </template>
                        </div>
                        <time>{{ message.time }}</time>
                      </div>
                    </div>

                    <span v-if="message.role === 'user'" class="agent-message-avatar agent-message-avatar--user" aria-hidden="true">
                      {{ userInitial }}
                    </span>
                  </div>

                  <div v-if="pending" class="agent-message agent-message--assistant">
                    <img class="agent-message-avatar agent-message-avatar--assistant" src="/agent/assistant-avatar.png" alt="AI 私教头像" />
                    <div class="agent-message-stack">
                      <label class="agent-message-label">AI 私教</label>
                      <div class="agent-bubble agent-bubble--pending">
                        <p class="agent-bubble-paragraph">我正在思考，马上给你更具体的回答。</p>
                        <time>{{ formatCurrentTime() }}</time>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="agent-composer-zone">
                  <form class="agent-composer" @submit.prevent="handleSubmit()">
                    <textarea
                      v-model="draft"
                      rows="1"
                      class="agent-composer-input"
                      placeholder="输入你的问题，或选择下方快捷操作..."
                      :disabled="pending"
                      @keydown="handleComposerKeydown"
                    ></textarea>
                    <button class="agent-composer-send" type="submit" :disabled="pending || !draft.trim()" aria-label="发送">
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12 19 5l-4.6 14-3.2-5.3L5 12Z" />
                        <path d="m11.2 13.7 7.5-8" />
                      </svg>
                    </button>
                  </form>

                  <div class="agent-quick-actions" aria-label="快捷操作">
                    <button
                      v-for="action in quickActions"
                      :key="action.id"
                      class="agent-quick-button"
                      type="button"
                      :disabled="pending"
                      @click="handleQuickAction(action)"
                    >
                      <span class="agent-quick-icon" :class="`agent-quick-icon--${action.icon}`" aria-hidden="true"></span>
                      <span>{{ action.label }}</span>
                    </button>
                  </div>

                  <p class="agent-disclaimer">AI 内容仅供参考，请结合个人实际情况判断。</p>
                </div>
              </div>
            </section>

            <aside class="agent-right-rail">
              <section class="agent-side-card agent-conclusion-card">
                <div class="agent-side-title">
                  <span class="agent-title-icon agent-title-icon--spark" aria-hidden="true">✦</span>
                  <h3>今日 AI 结论</h3>
                </div>

                <div class="agent-conclusion-box">
                  <p>{{ dailyConclusion.title }}</p>
                  <button type="button" @click="handleConclusionDetail">
                    <span>{{ dailyConclusion.cta }}</span>
                    <i aria-hidden="true">›</i>
                  </button>
                </div>
              </section>

              <section class="agent-side-card agent-question-card">
                <div class="agent-side-title">
                  <span class="agent-title-icon agent-title-icon--chat" aria-hidden="true">•••</span>
                  <h3>推荐追问</h3>
                </div>

                <div class="agent-question-list">
                  <button
                    v-for="item in recommendedQuestions"
                    :key="item.text"
                    type="button"
                    class="agent-question-item"
                    @click="handleRecommendedQuestion(item)"
                  >
                    <span>{{ item.text }}</span>
                    <i aria-hidden="true">›</i>
                  </button>
                </div>
              </section>

              <section class="agent-side-card agent-plan-card">
                <div class="agent-plan-head">
                  <div class="agent-side-title">
                    <span class="agent-title-icon agent-title-icon--plan" aria-hidden="true"></span>
                    <h3>AI 可执行计划</h3>
                  </div>
                  <div class="agent-progress-ring" aria-label="计划完成度 0%">0%</div>
                </div>

                <p class="agent-plan-subtitle">今日计划 · 剩余 {{ totalPlanMinutes }} 分钟</p>
                <div class="agent-plan-list">
                  <div v-for="item in planItems" :key="item.id" class="agent-plan-row">
                    <span class="agent-plan-check" aria-hidden="true"></span>
                    <span class="agent-plan-tag" :style="{ backgroundColor: item.color }">{{ item.type }}</span>
                    <strong>{{ item.label }}</strong>
                    <time>{{ item.minutes }} 分钟</time>
                  </div>
                </div>

                <button class="agent-start-button" type="button" @click="handleStartTraining">开始训练</button>
              </section>
            </aside>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.agent-replica-page {
  box-sizing: border-box;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
  overflow-y: auto;
  background: #f6f9ff;
}

.agent-scale-slot {
  position: relative;
  overflow: visible;
}

.agent-canvas,
.agent-canvas * {
  box-sizing: border-box;
}

.agent-canvas {
  position: relative;
  display: grid;
  grid-template-columns: 360px 1fr;
  width: 2560px;
  height: 1399px;
  overflow: hidden;
  transform-origin: top left;
  color: #132044;
  background:
    radial-gradient(circle at 72% -8%, rgba(232, 236, 255, 0.86), transparent 28%),
    linear-gradient(180deg, #fbfdff 0%, #f6f9ff 54%, #f8fbff 100%);
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", Arial, sans-serif;
}

.agent-sidebar {
  position: relative;
  height: 1399px;
  padding: 32px 30px 0;
  border-right: 1px solid #e6edf8;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(247, 250, 255, 0.98));
  box-shadow: 26px 0 58px rgba(60, 88, 150, 0.055);
}

.agent-brand {
  display: flex;
  align-items: center;
  gap: 22px;
  padding-left: 26px;
}

.agent-brand-mark {
  position: relative;
  width: 54px;
  height: 54px;
  border-radius: 16px;
  background: linear-gradient(135deg, #1674ff 0%, #1662ee 100%);
  box-shadow: 0 18px 32px rgba(26, 105, 245, 0.2);
}

.agent-brand-mark::before {
  content: "";
  position: absolute;
  left: 15px;
  top: 13px;
  width: 21px;
  height: 27px;
  border: 11px solid #fff;
  border-right: 0;
  border-radius: 14px 0 0 14px;
}

.agent-brand-mark::after {
  content: "";
  position: absolute;
  right: 11px;
  bottom: 11px;
  width: 19px;
  height: 19px;
  border-radius: 6px;
  background: #fff;
}

.agent-brand-text {
  color: #111629;
  font-size: 42px;
  font-weight: 900;
  line-height: 1;
  letter-spacing: 0;
}

.agent-nav {
  display: grid;
  gap: 24px;
  margin-top: 67px;
}

.agent-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  width: 306px;
  height: 72px;
  gap: 24px;
  border: 0;
  border-radius: 10px;
  padding: 0 28px;
  background: transparent;
  color: #6c7897;
  font: inherit;
  font-size: 25px;
  font-weight: 800;
  text-align: left;
  cursor: pointer;
}

.agent-nav-item--active {
  color: #176cff;
  background: linear-gradient(90deg, #e9efff 0%, rgba(242, 246, 255, 0.82) 100%);
}

.agent-nav-item--active::after {
  content: "";
  position: absolute;
  top: 0;
  right: -1px;
  width: 6px;
  height: 100%;
  border-radius: 10px 0 0 10px;
  background: #236cff;
}

.agent-nav-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: currentColor;
  flex: 0 0 auto;
}

.agent-nav-icon::before,
.agent-nav-icon::after {
  content: "";
  position: absolute;
}

.agent-nav-icon--home::before {
  width: 18px;
  height: 16px;
  border: 3px solid currentColor;
  border-top: 0;
  border-radius: 3px;
  top: 11px;
}

.agent-nav-icon--home::after {
  width: 17px;
  height: 17px;
  border-left: 3px solid currentColor;
  border-top: 3px solid currentColor;
  transform: rotate(45deg);
  top: 3px;
}

.agent-nav-icon--list::before {
  width: 16px;
  height: 18px;
  border: 3px solid currentColor;
  border-radius: 3px;
}

.agent-nav-icon--list::after {
  width: 11px;
  height: 3px;
  top: 9px;
  background: currentColor;
  box-shadow: 0 7px 0 currentColor;
}

.agent-nav-icon--spark::before {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  background: currentColor;
  transform: rotate(45deg);
}

.agent-nav-icon--square::before,
.agent-nav-icon--box::before {
  width: 14px;
  height: 14px;
  border: 3px solid currentColor;
  border-radius: 3px;
}

.agent-nav-icon--report::before {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  border: 3px solid currentColor;
  background:
    linear-gradient(45deg, transparent 0 34%, currentColor 34% 42%, transparent 42% 58%, currentColor 58% 66%, transparent 66%);
}

.agent-nav-icon--circle::before {
  width: 13px;
  height: 13px;
  border: 3px solid currentColor;
  border-radius: 999px;
}

.agent-resource-card {
  position: absolute;
  left: 33px;
  bottom: 125px;
  width: 304px;
  height: 265px;
  overflow: hidden;
  padding: 26px 24px;
  border: 1px solid #edf2fb;
  border-radius: 16px;
  background: linear-gradient(180deg, #f4f7ff 0%, #eef2ff 100%);
}

.agent-resource-title {
  margin: 0;
  color: #2a365a;
  font-size: 23px;
  font-weight: 900;
}

.agent-resource-copy {
  margin: 18px 0 0;
  color: #7f8aaa;
  font-size: 17px;
  font-weight: 700;
}

.agent-resource-button {
  position: relative;
  z-index: 2;
  height: 47px;
  margin-top: 38px;
  border: 0;
  border-radius: 999px;
  padding: 0 25px;
  background: linear-gradient(135deg, #7363ff, #8b72ff);
  box-shadow: 0 18px 32px rgba(116, 101, 255, 0.24);
  color: #fff;
  font-size: 17px;
  font-weight: 800;
}

.agent-gift {
  position: absolute;
  right: 22px;
  bottom: 24px;
  width: 92px;
  height: 88px;
  transform: rotate(-12deg);
}

.agent-gift-box,
.agent-gift-lid {
  position: absolute;
  display: block;
  border-radius: 12px;
  background: linear-gradient(135deg, #5e88ff, #8a6bff);
  box-shadow: 0 16px 24px rgba(93, 117, 255, 0.2);
}

.agent-gift-box {
  left: 18px;
  bottom: 0;
  width: 56px;
  height: 54px;
}

.agent-gift-lid {
  left: 10px;
  top: 17px;
  width: 72px;
  height: 20px;
}

.agent-gift-ribbon {
  position: absolute;
  left: 40px;
  top: 14px;
  width: 13px;
  height: 70px;
  border-radius: 999px;
  background: #ff9d3b;
}

.agent-gift::before,
.agent-gift::after {
  content: "";
  position: absolute;
  top: 0;
  width: 28px;
  height: 22px;
  border: 7px solid #686cff;
  border-radius: 999px 999px 4px 999px;
}

.agent-gift::before {
  left: 23px;
  transform: rotate(28deg);
}

.agent-gift::after {
  right: 21px;
  transform: rotate(-28deg) scaleX(-1);
}

.agent-main {
  position: relative;
  height: 1399px;
}

.agent-topbar {
  position: absolute;
  inset: 0 0 auto 0;
  height: 130px;
  border-bottom: 1px solid #e8eef8;
  background: rgba(255, 255, 255, 0.44);
}

.agent-greeting {
  position: absolute;
  left: 126px;
  top: 29px;
}

.agent-greeting h1 {
  margin: 0;
  color: #16213f;
  font-size: 31px;
  font-weight: 900;
  line-height: 1.24;
  letter-spacing: 0;
}

.agent-greeting h1 span {
  font-size: 26px;
}

.agent-greeting p {
  margin: 9px 0 0;
  color: #8996b4;
  font-size: 18px;
  font-weight: 700;
}

.agent-top-actions {
  position: absolute;
  top: 28px;
  right: 78px;
  display: flex;
  align-items: center;
  gap: 52px;
}

.agent-search {
  display: flex;
  align-items: center;
  width: 556px;
  height: 62px;
  border: 1px solid #e4eaf6;
  border-radius: 999px;
  padding: 0 25px 0 31px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 12px 34px rgba(83, 103, 151, 0.055);
}

.agent-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: #536382;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
}

.agent-search input::placeholder {
  color: #98a5c3;
}

.agent-search span {
  position: relative;
  width: 28px;
  height: 28px;
  color: #9aa7c2;
  flex: 0 0 auto;
}

.agent-search span::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 2px;
  width: 16px;
  height: 16px;
  border: 3px solid currentColor;
  border-radius: 999px;
}

.agent-search span::after {
  content: "";
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 11px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
  transform: rotate(45deg);
}

.agent-profile {
  display: flex;
  align-items: center;
  gap: 18px;
  border: 0;
  background: transparent;
  color: #16213f;
  font: inherit;
  cursor: pointer;
}

.agent-profile-avatar {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 999px;
  overflow: hidden;
  background: linear-gradient(135deg, #eef3ff 0%, #dfe7ff 100%);
  color: #496aff;
  font-size: 22px;
  font-weight: 950;
  box-shadow: 0 0 0 4px #fff;
}

.agent-profile-avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-profile-avatar b {
  font: inherit;
  line-height: 1;
}

.agent-profile strong {
  max-width: 190px;
  overflow: hidden;
  font-size: 21px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-profile-chevron {
  width: 16px;
  height: 16px;
  color: #7180a1;
}

.agent-profile-chevron path {
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.1;
}

.agent-content {
  position: absolute;
  left: 130px;
  top: 160px;
  display: grid;
  grid-template-columns: 1358px 610px;
  gap: 45px;
  width: 2013px;
}

.agent-chat-card {
  height: 1206px;
  overflow: hidden;
  border: 1px solid #e9eef8;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 22px 60px rgba(67, 83, 126, 0.07);
}

.agent-hero {
  position: relative;
  display: flex;
  align-items: center;
  height: 145px;
  overflow: hidden;
  border-radius: 18px 18px 0 0;
  background: #eef3ff url("/agent/ai-tutor-hero-bg.png") center center / cover no-repeat;
}

.agent-hero-bot,
.agent-hero-copy,
.agent-hero-star,
.agent-hero-wave {
  display: none;
}

.agent-hero-bot {
  position: absolute;
  left: 105px;
  bottom: -4px;
  width: 134px;
  height: auto;
  object-fit: contain;
  filter: drop-shadow(0 18px 22px rgba(96, 107, 166, 0.12));
}

.agent-hero-copy {
  position: relative;
  z-index: 2;
  margin-left: 330px;
}

.agent-hero-title-row {
  display: flex;
  align-items: center;
  gap: 33px;
}

.agent-hero-title-row h2 {
  margin: 0;
  color: #08153d;
  font-size: 46px;
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0;
}

.agent-hero-title-row span {
  display: inline-flex;
  align-items: center;
  height: 34px;
  border-radius: 9px;
  padding: 0 18px;
  background: #dde5ff;
  color: #6370b4;
  font-size: 17px;
  font-weight: 900;
}

.agent-hero-copy p {
  margin: 22px 0 0;
  color: #47567e;
  font-size: 20px;
  font-weight: 850;
}

.agent-hero-star {
  position: absolute;
  color: #657dff;
  font-size: 30px;
  line-height: 1;
}

.agent-hero-star--left {
  left: 49px;
  top: 64px;
  font-size: 22px;
}

.agent-hero-star--mid {
  left: 825px;
  top: 44px;
  font-size: 18px;
}

.agent-hero-star--right {
  right: 176px;
  top: 45px;
}

.agent-hero-wave {
  position: absolute;
  right: -15px;
  top: -18px;
  width: 620px;
  height: 170px;
  border: 2px solid rgba(154, 171, 255, 0.16);
  border-color: rgba(142, 161, 255, 0.16) transparent transparent transparent;
  border-radius: 50%;
  transform: rotate(-5deg);
}

.agent-chat-body {
  display: flex;
  height: calc(100% - 145px);
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%),
    radial-gradient(circle at 72% 36%, rgba(245, 247, 255, 0.72), transparent 36%);
}

.agent-chat-card--empty .agent-chat-body {
  height: 100%;
  background: transparent;
}

.agent-empty-panel {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  padding: 0 31px 18px;
  background:
    linear-gradient(180deg, rgba(239, 238, 255, 0.94) 0%, rgba(247, 249, 255, 0.96) 55%, rgba(255, 255, 255, 0.96) 100%),
    radial-gradient(circle at 50% 22%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.56) 24%, rgba(244, 247, 255, 0.15) 55%, transparent 70%);
}

.agent-empty-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  background: url("/agent/ai-tutor-empty-bg.png") center top / 100% 100% no-repeat;
  opacity: 0.96;
  pointer-events: none;
}

.agent-empty-panel::after {
  content: "";
  position: absolute;
  right: 24px;
  bottom: 14px;
  left: 24px;
  z-index: 0;
  height: 210px;
  border-radius: 0 0 18px 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.48) 52%, rgba(255, 255, 255, 0.78) 100%);
  pointer-events: none;
}

.agent-empty-state {
  position: relative;
  z-index: 1;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  padding: 0;
  background: transparent;
}

.agent-empty-inner {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  padding-top: 318px;
}

.agent-empty-intro {
  text-align: center;
}

.agent-empty-intro h2 {
  margin: 0;
  color: #07163c;
  font-size: 43px;
  font-weight: 950;
  line-height: 1.12;
  letter-spacing: 0;
}

.agent-empty-intro h2 span {
  color: #2f71ff;
}

.agent-empty-intro p {
  margin: 18px 0 0;
  color: #4f628e;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.4;
}

.agent-empty-feature-grid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 28px;
  margin-top: 36px;
}

.agent-empty-feature-card {
  display: flex;
  align-items: center;
  height: 132px;
  border: 1px solid #e7edf9;
  border-radius: 16px;
  padding: 0 20px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 16px 36px rgba(58, 76, 123, 0.07);
  color: #13264f;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.agent-empty-feature-card:disabled {
  opacity: 0.62;
  cursor: default;
}

.agent-empty-feature-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  margin-right: 18px;
  border-radius: 16px;
  flex: 0 0 auto;
}

.agent-empty-feature-card--trend .agent-empty-feature-icon {
  background: linear-gradient(180deg, #f3e5ff 0%, #f8f0ff 100%);
  color: #8e55ee;
}

.agent-empty-feature-card--calendar .agent-empty-feature-icon {
  background: linear-gradient(180deg, #edf3ff 0%, #f4f7ff 100%);
  color: #2f7dff;
}

.agent-empty-feature-card--question .agent-empty-feature-icon {
  background: linear-gradient(180deg, #fff0e5 0%, #fff7ef 100%);
  color: #ff8b2d;
}

.agent-empty-feature-card--clock .agent-empty-feature-icon {
  background: linear-gradient(180deg, #e4f8f1 0%, #f0fbf7 100%);
  color: #26c39a;
}

.agent-empty-feature-icon .agent-quick-icon {
  width: 31px;
  height: 31px;
  color: currentColor;
}

.agent-empty-feature-icon .agent-quick-icon--trend::before {
  width: 24px;
  height: 18px;
  border-left-width: 4px;
  border-bottom-width: 4px;
}

.agent-empty-feature-icon .agent-quick-icon--trend::after {
  width: 20px;
  height: 13px;
  border-left-width: 4px;
  border-top-width: 4px;
}

.agent-empty-feature-icon .agent-quick-icon--calendar::before {
  width: 25px;
  height: 22px;
  border-width: 4px;
}

.agent-empty-feature-icon .agent-quick-icon--calendar::after {
  width: 17px;
  height: 4px;
  top: 12px;
}

.agent-empty-feature-icon .agent-quick-icon--question::before,
.agent-empty-feature-icon .agent-quick-icon--clock::before {
  width: 24px;
  height: 24px;
  border-width: 4px;
}

.agent-empty-feature-icon .agent-quick-icon--question::after {
  top: 0;
  font-size: 20px;
}

.agent-empty-feature-icon .agent-quick-icon--clock::after {
  width: 9px;
  height: 9px;
  border-left-width: 4px;
  border-bottom-width: 4px;
  top: 8px;
}

.agent-empty-feature-copy {
  display: grid;
  gap: 13px;
  min-width: 0;
}

.agent-empty-feature-copy strong {
  color: #12234f;
  font-size: 21px;
  font-weight: 950;
  line-height: 1;
  white-space: nowrap;
}

.agent-empty-feature-copy em {
  color: #66759e;
  font-size: 17px;
  font-style: normal;
  font-weight: 800;
  line-height: 1.5;
}

.agent-empty-info-grid {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 22px;
  margin-top: 42px;
}

.agent-empty-info-card {
  position: relative;
  min-height: 212px;
  border: 1px solid #e4ebf8;
  border-radius: 16px;
  padding: 29px 31px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 18px 38px rgba(58, 76, 123, 0.055);
}

.agent-empty-info-card h3 {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 0;
  color: #4e66ff;
  font-size: 23px;
  font-weight: 950;
  line-height: 1;
}

.agent-empty-info-icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: #6172ff;
  flex: 0 0 auto;
}

.agent-empty-info-icon::before,
.agent-empty-info-icon::after {
  position: absolute;
}

.agent-empty-info-icon--message::before {
  content: "";
  width: 19px;
  height: 15px;
  border: 4px solid currentColor;
  border-radius: 3px;
}

.agent-empty-info-icon--message::after {
  content: "";
  left: 7px;
  bottom: 1px;
  border-width: 5px 5px 0 0;
  border-style: solid;
  border-color: currentColor transparent transparent transparent;
  transform: rotate(20deg);
}

.agent-empty-info-icon--star::before {
  content: "★";
  color: currentColor;
  font-size: 27px;
  line-height: 1;
}

.agent-empty-info-icon--like::before {
  content: "";
  left: 8px;
  top: 8px;
  width: 15px;
  height: 14px;
  border-radius: 4px 4px 5px 5px;
  background: currentColor;
  transform: rotate(2deg);
}

.agent-empty-info-icon--like::after {
  content: "";
  left: 3px;
  top: 12px;
  width: 8px;
  height: 10px;
  border-radius: 3px;
  background: currentColor;
  box-shadow: 9px -10px 0 -2px currentColor;
  transform: rotate(-15deg);
}

.agent-empty-info-card ul {
  display: grid;
  gap: 20px;
  margin: 30px 0 0;
  padding: 0;
  list-style: none;
}

.agent-empty-info-card li {
  position: relative;
  margin: 0;
  padding-left: 28px;
  color: #5f6f96;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.25;
}

.agent-empty-info-card li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 5px;
  width: 8px;
  height: 8px;
  border-top: 3px solid #b8c5e7;
  border-right: 3px solid #b8c5e7;
  transform: rotate(45deg);
}

.agent-empty-info-card button {
  position: absolute;
  right: 24px;
  bottom: 24px;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 0;
  border-radius: 999px;
  background: #edf3ff;
  color: #5d82ff;
  font: inherit;
  font-size: 25px;
  font-weight: 900;
  line-height: 1;
  cursor: pointer;
}

.agent-empty-info-card button:disabled {
  opacity: 0.62;
  cursor: default;
}

.agent-message-list {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  padding: 18px 36px 18px 39px;
  overflow-y: auto;
}

.agent-message-list::-webkit-scrollbar {
  width: 0;
}

.agent-message {
  display: flex;
  align-items: flex-end;
  gap: 19px;
}

.agent-message--assistant {
  justify-content: flex-start;
}

.agent-message--user {
  justify-content: flex-end;
  gap: 22px;
  margin: -12px 34px -7px 0;
}

.agent-message-avatar {
  display: grid;
  place-items: center;
  width: 45px;
  height: 45px;
  border-radius: 999px;
  color: #5369ff;
  font-size: 20px;
  font-weight: 900;
  flex: 0 0 auto;
  object-fit: cover;
  box-shadow: 0 10px 20px rgba(127, 142, 184, 0.16);
}

.agent-message-avatar--assistant {
  width: 42px;
  height: 42px;
}

.agent-message-avatar--user {
  background: linear-gradient(135deg, #eef2ff 0%, #dfe7ff 100%);
}

.agent-message-stack {
  min-width: 0;
}

.agent-message-label {
  display: block;
  margin: 0 0 7px 2px;
  color: #9ba8c3;
  font-size: 15px;
  font-weight: 800;
  line-height: 1;
}

.agent-bubble {
  width: fit-content;
  max-width: 820px;
  min-width: 780px;
  border: 1px solid #dbe3f3;
  border-radius: 14px;
  padding: 12px 18px 9px;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 10px 26px rgba(56, 75, 125, 0.055);
}

.agent-message--user .agent-bubble {
  min-width: 210px;
  max-width: 310px;
  border-color: #e4e8fb;
  background: linear-gradient(180deg, #f1f3ff 0%, #edf1ff 100%);
  box-shadow: 0 10px 22px rgba(86, 101, 189, 0.055);
}

.agent-bubble--pending {
  min-width: 300px;
}

.agent-bubble--error {
  border-color: #f5d0c7;
  background: #fff6f3;
}

.agent-bubble-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-bubble-paragraph {
  margin: 0;
  color: #263b70;
  font-size: 17px;
  font-weight: 750;
  line-height: 1.34;
  white-space: pre-wrap;
}

.agent-bubble--error .agent-bubble-paragraph {
  color: #9a4e3b;
}

.agent-bubble time {
  display: block;
  margin-top: 4px;
  color: #8b98ba;
  font-size: 14px;
  font-weight: 750;
  line-height: 1;
  text-align: right;
}

.agent-table-wrap {
  max-width: 100%;
  overflow-x: auto;
  border: 1px solid rgba(229, 233, 245, 0.96);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.88);
}

.agent-table {
  min-width: 100%;
  border-collapse: collapse;
  color: #263b70;
  font-size: 16px;
}

.agent-table thead {
  background: rgba(238, 242, 251, 0.96);
}

.agent-table th,
.agent-table td {
  padding: 9px 10px;
  border-bottom: 1px solid rgba(235, 239, 247, 0.96);
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
}

.agent-composer-zone {
  flex: 0 0 auto;
  padding: 0 39px 14px;
}

.agent-empty-panel .agent-composer-zone {
  position: relative;
  z-index: 1;
  padding: 0 8px 0;
}

.agent-composer {
  display: flex;
  align-items: center;
  height: 58px;
  border: 2px solid #d2dcff;
  border-radius: 999px;
  padding: 0 10px 0 34px;
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(244, 246, 255, 0.9);
}

.agent-empty-panel .agent-composer {
  border-color: rgba(203, 214, 255, 0.92);
  background: rgba(255, 255, 255, 0.84);
  box-shadow:
    inset 0 0 0 1px rgba(248, 250, 255, 0.92),
    0 16px 32px rgba(91, 105, 174, 0.08);
  backdrop-filter: blur(5px);
}

.agent-composer-input {
  width: 100%;
  min-width: 0;
  height: 32px;
  border: 0;
  outline: 0;
  resize: none;
  background: transparent;
  color: #1e315d;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  line-height: 32px;
}

.agent-composer-input::placeholder {
  color: #9ca9c6;
}

.agent-composer-send {
  display: grid;
  place-items: center;
  width: 47px;
  height: 47px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #6c70ff 0%, #5962f5 100%);
  color: #fff;
  box-shadow: 0 12px 22px rgba(90, 98, 245, 0.24);
  flex: 0 0 auto;
}

.agent-composer-send:disabled {
  opacity: 0.62;
  box-shadow: none;
}

.agent-composer-send svg {
  width: 25px;
  height: 25px;
}

.agent-composer-send path:first-child {
  fill: currentColor;
}

.agent-composer-send path:last-child {
  fill: none;
  stroke: #fff;
  stroke-linecap: round;
  stroke-width: 1.8;
}

.agent-quick-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin-top: 14px;
}

.agent-empty-panel .agent-quick-actions {
  margin-top: 17px;
}

.agent-quick-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 221px;
  height: 48px;
  gap: 12px;
  border: 1px solid #e0e6f4;
  border-radius: 13px;
  padding: 0 22px;
  background: linear-gradient(180deg, #fbfcff 0%, #f6f8ff 100%);
  color: #6271ab;
  font: inherit;
  font-size: 18px;
  font-weight: 900;
  box-shadow: 0 8px 20px rgba(92, 107, 156, 0.04);
  white-space: nowrap;
  cursor: pointer;
}

.agent-empty-panel .agent-quick-button {
  background: rgba(255, 255, 255, 0.72);
  border-color: rgba(220, 226, 247, 0.92);
  box-shadow:
    0 12px 26px rgba(85, 99, 157, 0.055),
    inset 0 0 0 1px rgba(255, 255, 255, 0.54);
  backdrop-filter: blur(4px);
}

.agent-quick-button:disabled {
  opacity: 0.6;
}

.agent-quick-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: #6877ff;
  flex: 0 0 auto;
}

.agent-quick-icon::before,
.agent-quick-icon::after {
  content: "";
  position: absolute;
}

.agent-quick-icon--trend::before {
  width: 19px;
  height: 14px;
  border-left: 3px solid currentColor;
  border-bottom: 3px solid currentColor;
}

.agent-quick-icon--trend::after {
  width: 16px;
  height: 10px;
  border-left: 3px solid currentColor;
  border-top: 3px solid currentColor;
  transform: rotate(135deg);
  right: 1px;
  top: 5px;
}

.agent-quick-icon--calendar::before {
  width: 19px;
  height: 17px;
  border: 3px solid currentColor;
  border-radius: 3px;
}

.agent-quick-icon--calendar::after {
  width: 13px;
  height: 3px;
  top: 8px;
  background: currentColor;
}

.agent-quick-icon--question::before {
  width: 18px;
  height: 18px;
  border: 3px solid currentColor;
  border-radius: 999px;
}

.agent-quick-icon--question::after {
  content: "?";
  top: 1px;
  color: currentColor;
  font-size: 14px;
  font-weight: 900;
}

.agent-quick-icon--clock::before {
  width: 18px;
  height: 18px;
  border: 3px solid currentColor;
  border-radius: 999px;
}

.agent-quick-icon--clock::after {
  width: 7px;
  height: 7px;
  border-left: 3px solid currentColor;
  border-bottom: 3px solid currentColor;
  transform: rotate(-45deg);
  top: 5px;
}

.agent-quick-icon--heart::before {
  content: "♡";
  top: -6px;
  color: #ff5c87;
  font-size: 30px;
  font-weight: 900;
}

.agent-disclaimer {
  margin: 10px 0 0;
  color: #a1aec7;
  font-size: 15px;
  font-weight: 700;
  text-align: center;
}

.agent-empty-panel .agent-disclaimer {
  margin-top: 13px;
  color: #9faac1;
}

.agent-right-rail {
  display: grid;
  gap: 28px;
}

.agent-side-card {
  overflow: hidden;
  border: 1px solid #edf1fa;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 48px rgba(67, 83, 126, 0.075);
}

.agent-conclusion-card {
  height: 350px;
  padding: 40px 35px 0;
}

.agent-question-card {
  height: 350px;
  padding: 39px 33px 0;
}

.agent-plan-card {
  height: 450px;
  padding: 37px 33px 0;
}

.agent-side-title {
  display: flex;
  align-items: center;
  gap: 17px;
}

.agent-side-title h3 {
  margin: 0;
  color: #101d3f;
  font-size: 27px;
  font-weight: 950;
  line-height: 1;
  letter-spacing: 0;
}

.agent-title-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: #5e70ff;
  flex: 0 0 auto;
}

.agent-title-icon--spark {
  font-size: 35px;
  line-height: 1;
}

.agent-title-icon--chat {
  border-radius: 999px;
  background: linear-gradient(135deg, #6275ff, #7b82ff);
  color: #fff;
  font-size: 14px;
  font-weight: 900;
}

.agent-title-icon--plan {
  position: relative;
  border: 3px solid #5d71ff;
  border-radius: 5px;
}

.agent-title-icon--plan::before,
.agent-title-icon--plan::after {
  content: "";
  position: absolute;
  top: -7px;
  width: 4px;
  height: 9px;
  border-radius: 999px;
  background: #5d71ff;
}

.agent-title-icon--plan::before {
  left: 6px;
}

.agent-title-icon--plan::after {
  right: 6px;
}

.agent-conclusion-box {
  margin-top: 41px;
  overflow: hidden;
  border: 1px solid #f0ddc9;
  border-radius: 14px;
  background: linear-gradient(180deg, #fffaf5 0%, #fffdfb 100%);
}

.agent-conclusion-box p {
  min-height: 132px;
  margin: 0;
  padding: 30px 31px 22px;
  color: #20345f;
  font-size: 23px;
  font-weight: 900;
  line-height: 1.64;
}

.agent-conclusion-box button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 62px;
  border: 0;
  border-top: 1px solid #e8edf8;
  padding: 0 28px 0 31px;
  background: rgba(255, 255, 255, 0.9);
  color: #5b72ff;
  font: inherit;
  font-size: 20px;
  font-weight: 950;
  cursor: pointer;
}

.agent-conclusion-box i,
.agent-question-item i {
  color: #6c7da7;
  font-style: normal;
  font-size: 34px;
  font-weight: 400;
  line-height: 1;
}

.agent-question-list {
  display: grid;
  gap: 13px;
  margin-top: 39px;
}

.agent-question-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 49px;
  border: 1px solid #e6ebf8;
  border-radius: 11px;
  padding: 0 20px 0 22px;
  background: linear-gradient(180deg, #f6f8ff 0%, #f1f4ff 100%);
  color: #465887;
  font: inherit;
  font-size: 18px;
  font-weight: 800;
  cursor: pointer;
}

.agent-plan-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agent-progress-ring {
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  border-radius: 999px;
  background:
    linear-gradient(#fff, #fff) padding-box,
    conic-gradient(#e9edff 0deg, #e9edff 360deg) border-box;
  border: 6px solid transparent;
  color: #64708e;
  font-size: 16px;
  font-weight: 950;
}

.agent-plan-subtitle {
  margin: 22px 0 0;
  color: #40527d;
  font-size: 19px;
  font-weight: 900;
}

.agent-plan-list {
  display: grid;
  gap: 0;
  margin-top: 24px;
  border: 1px solid #e6ebf6;
  border-radius: 14px;
  padding: 15px 17px;
  background: rgba(255, 255, 255, 0.95);
}

.agent-plan-row {
  display: grid;
  grid-template-columns: 32px 42px minmax(0, 1fr) 70px;
  align-items: center;
  min-height: 40px;
  gap: 13px;
}

.agent-plan-check {
  width: 26px;
  height: 26px;
  border: 3px solid #cfd7e8;
  border-radius: 999px;
}

.agent-plan-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 25px;
  border-radius: 7px;
  padding: 0 6px;
  color: #fff;
  font-size: 14px;
  font-weight: 950;
}

.agent-plan-row strong {
  overflow: hidden;
  color: #314673;
  font-size: 18px;
  font-weight: 900;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-plan-row time {
  color: #6f7b9d;
  font-size: 18px;
  font-weight: 800;
  text-align: right;
  white-space: nowrap;
}

.agent-start-button {
  display: block;
  width: 100%;
  height: 62px;
  margin-top: 28px;
  border: 0;
  border-radius: 11px;
  background: linear-gradient(135deg, #6374ff 0%, #4d5df3 100%);
  color: #fff;
  font: inherit;
  font-size: 20px;
  font-weight: 950;
  box-shadow: 0 18px 32px rgba(82, 97, 246, 0.22);
  cursor: pointer;
}
</style>

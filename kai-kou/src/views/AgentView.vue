<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { parseAgentContent } from "@/lib/agent-rich-content";
import { sendAgentMessage } from "@/lib/agent";

const router = useRouter();

const draft = ref("");
const pending = ref(false);
const messagesBodyRef = ref(null);
const conversationId = ref(`mobile_${Date.now().toString(36)}`);
const messages = ref([]);
const MAX_RECENT_MESSAGES = 10;

const quickActions = [
  {
    id: "weakness",
    label: "分析我的弱项",
    prompt: "根据我最近的练习记录，帮我分析当前最弱的题型和原因。",
    icon: "insight"
  },
  {
    id: "today-plan",
    label: "生成今日计划",
    prompt: "根据我最近的练习记录，帮我生成今天的训练计划。",
    icon: "calendar"
  },
  {
    id: "seven-day-table",
    label: "7天计划表",
    prompt: "给我一个7天练习计划，然后给我用表格做出来。",
    icon: "calendar"
  },
  {
    id: "di-why",
    label: "为什么这次 DI 分低",
    prompt: "为什么这次 DI 分低？请结合我最近的记录，直接告诉我主要问题和改进方向。",
    icon: "question"
  },
  {
    id: "today-what",
    label: "今天练什么",
    prompt: "我今天该练什么？请给我一个明确顺序。",
    icon: "fire"
  }
];

watch(
  () => [messages.value.length, pending.value],
  async () => {
    await nextTick();
    scrollToBottom(pending.value ? "auto" : "smooth");
  }
);

onMounted(async () => {
  if (!messages.value.length) {
    messages.value.push(
      createMessage(
        "assistant",
        "你好，我是开口的 PTE AI 私教。你可以像平时问老师一样直接问我题型方法，也可以让我结合你的练习记录帮你做计划、复盘和找弱项。",
        {
          metaLabel: "AI 私教"
        }
      )
    );
  }
  await nextTick();
  scrollToBottom("auto");
});

async function handleSubmit(rawMessage = draft.value) {
  const message = normalizeText(rawMessage);
  if (!message || pending.value) return;

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
          normalizeText(result.reply) || "我已经收到你的问题，接下来会给你更具体的训练建议。",
          {
            metaLabel: "AI 私教"
          }
        )
      );
      return;
    }

    messages.value.push(
      createMessage("assistant", normalizeText(result.message) || "AI 私教暂时不可用，请稍后再试。", {
        tone: "error",
        metaLabel: "AI 私教"
      })
    );
  } catch {
    messages.value.push(
      createMessage("assistant", "网络连接有点不稳定，请稍后再试。", {
        tone: "error",
        metaLabel: "AI 私教"
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

function goHome() {
  router.push("/home");
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

function normalizeText(value) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return `${value}`.trim();
}

function renderMessageContent(value) {
  return parseAgentContent(value);
}

function handleComposerKeydown(event) {
  if (event.key !== "Enter") return;
  if (event.shiftKey) return;

  event.preventDefault();
  if (pending.value || !draft.value.trim()) return;
  void handleSubmit();
}
</script>

<template>
  <div class="agent-page">
    <main class="agent-shell">
      <button type="button" class="agent-back" @click="goHome">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M11.5 4.5 6 10l5.5 5.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
        </svg>
        <span>返回首页</span>
      </button>

      <section class="agent-hero">
        <div class="agent-hero__copy">
          <div class="agent-hero__title">
            <h1>AI 私教</h1>
            <span class="agent-hero__sparkles">✦</span>
          </div>
          <p class="agent-hero__subtitle">你的专属学习助手，陪你科学备考，高效提分</p>

          <div class="agent-hero__tip-card">
            <span class="agent-hero__tip-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8" />
                <path d="M12 7.4v5.4l3.8-2.7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" />
              </svg>
            </span>
            <p>不知道从哪开始也没关系，直接问一句“今天练什么”就行。</p>
          </div>
        </div>

        <img class="agent-hero__bot" src="/agent/hero-bot.png" alt="AI 私教机器人" />
      </section>

      <section class="agent-chat-panel">
        <div class="agent-chat-head">
          <div class="agent-chat-head__identity">
            <img class="agent-chat-head__avatar" src="/agent/assistant-avatar.png" alt="AI 私教头像" />
            <div class="agent-chat-head__copy">
              <strong>和 AI 私教对话</strong>
              <span>自然问答 · 训练计划 · 薄弱项分析</span>
            </div>
          </div>
          <span class="agent-chat-head__status">
            <i></i>
            在线
          </span>
        </div>

        <div ref="messagesBodyRef" class="agent-chat-list">
          <div
            v-for="message in messages"
            :key="message.id"
            class="agent-message"
            :class="message.role === 'user' ? 'agent-message--user' : 'agent-message--assistant'"
          >
            <img
              v-if="message.role === 'assistant'"
              class="agent-avatar agent-avatar--assistant"
              src="/agent/assistant-avatar.png"
              alt="AI 私教头像"
            />

            <div class="agent-bubble" :class="{ 'agent-bubble--error': message.tone === 'error' }">
              <label class="agent-bubble__label">{{ message.metaLabel }}</label>
              <div class="agent-bubble__content">
                <template v-for="(block, blockIndex) in renderMessageContent(message.content)" :key="`${message.id}-${blockIndex}`">
                  <p
                    v-if="block.type === 'paragraph'"
                    class="agent-bubble__paragraph"
                  >
                    {{ block.text }}
                  </p>

                  <div
                    v-else-if="block.type === 'table'"
                    class="agent-table-wrap"
                  >
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
              <span>{{ message.time }}</span>
            </div>

            <img
              v-if="message.role === 'user'"
              class="agent-avatar agent-avatar--user"
              src="/agent/user-avatar.png"
              alt="用户头像"
            />
          </div>

          <div v-if="pending" class="agent-message agent-message--assistant">
            <img class="agent-avatar agent-avatar--assistant" src="/agent/assistant-avatar.png" alt="AI 私教头像" />
            <div class="agent-bubble agent-bubble--pending">
              <label class="agent-bubble__label">AI 私教</label>
              <p>我正在思考，马上给你更具体的回答。</p>
              <span>{{ formatCurrentTime() }}</span>
            </div>
          </div>
        </div>

        <div class="agent-bottom">
          <div class="agent-chips">
            <button
              v-for="action in quickActions"
              :key="action.id"
              type="button"
              class="agent-chip"
              :disabled="pending"
              @click="handleQuickAction(action)"
            >
              <span class="agent-chip__icon" :class="`agent-chip__icon--${action.icon}`" aria-hidden="true">
                <template v-if="action.icon === 'calendar'">⌘</template>
                <template v-else-if="action.icon === 'question'">?</template>
                <template v-else-if="action.icon === 'fire'">✦</template>
                <template v-else>◔</template>
              </span>
              <span>{{ action.label }}</span>
            </button>
          </div>

          <p class="agent-composer__tip">按 Enter 发送，Shift + Enter 换行</p>

          <form class="agent-composer" @submit.prevent="handleSubmit()">
            <textarea
              v-model="draft"
              class="agent-composer__input"
              rows="2"
              placeholder="问 AI 私教：DI 怎么提高？我最近哪项最弱？今天练什么？"
              :disabled="pending"
              @keydown="handleComposerKeydown"
            ></textarea>

            <button
              type="submit"
              class="agent-composer__send"
              :disabled="pending || !draft.trim()"
              aria-label="发送消息"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 11.6 18.7 5.5c.8-.4 1.6.4 1.2 1.2L13.8 20.4c-.4.8-1.5.8-1.8-.1l-1.7-4.9-4.9-1.7C4.5 13.1 4.4 12 5 11.6Z" fill="currentColor" />
                <path d="M10.1 15.4 19.3 6.2" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-width="1.7" />
              </svg>
            </button>
          </form>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.agent-page {
  min-height: 100vh;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.96) 0%, rgba(245, 248, 255, 0.92) 38%, #eef3ff 100%);
  color: #1f2432;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif;
}

.agent-shell {
  box-sizing: border-box;
  display: flex;
  min-height: 100vh;
  max-width: 521px;
  flex-direction: column;
  gap: 8px;
  margin: 0 auto;
  padding: 8px 12px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(250, 251, 255, 0.96));
  box-shadow: 0 18px 58px rgba(116, 134, 182, 0.18);
}

.agent-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  margin-top: 2px;
  padding: 9px 13px 9px 10px;
  border: 1px solid rgba(228, 233, 246, 0.9);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  color: #61677a;
  font-size: 14px;
  line-height: 1;
  box-shadow: 0 6px 20px rgba(153, 167, 205, 0.12);
}

.agent-back svg {
  width: 16px;
  height: 16px;
}

.agent-hero {
  position: relative;
  overflow: hidden;
  display: flex;
  min-height: 156px;
  padding: 18px 18px 16px;
  border-radius: 24px;
  background:
    radial-gradient(circle at 16% 100%, rgba(255, 255, 255, 0.58) 0%, rgba(255, 255, 255, 0) 42%),
    linear-gradient(135deg, #eef4ff 0%, #dbe6ff 52%, #cfd6ff 100%);
  box-shadow: 0 16px 34px rgba(111, 132, 199, 0.15);
}

.agent-hero::before,
.agent-hero::after {
  content: "";
  position: absolute;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.36);
  filter: blur(1px);
}

.agent-hero::before {
  width: 150px;
  height: 150px;
  top: -40px;
  right: -20px;
}

.agent-hero::after {
  width: 200px;
  height: 200px;
  right: -60px;
  bottom: -90px;
}

.agent-hero__copy {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  flex-direction: column;
  max-width: 252px;
}

.agent-hero__title {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.agent-hero__title h1 {
  margin: 0;
  color: #4a53ff;
  font-size: 25px;
  font-weight: 700;
  letter-spacing: 1px;
  line-height: 1.15;
}

.agent-hero__sparkles {
  color: #7081ff;
  font-size: 18px;
  line-height: 1.2;
  padding-top: 4px;
}

.agent-hero__subtitle {
  margin: 6px 0 0;
  color: #55639f;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.55;
}

.agent-hero__tip-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  margin-top: auto;
  padding: 11px 13px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 14px 28px rgba(127, 145, 210, 0.15);
}

.agent-hero__tip-card p {
  margin: 0;
  color: #2d3448;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.58;
}

.agent-hero__tip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  color: #5f67ff;
  flex-shrink: 0;
}

.agent-hero__tip-icon svg {
  width: 18px;
  height: 18px;
}

.agent-hero__bot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 196px;
  height: auto;
  pointer-events: none;
  user-select: none;
}

.agent-chat-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(229, 234, 246, 0.96);
  border-radius: 24px;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.98) 0%, rgba(247, 249, 255, 0.98) 100%);
  box-shadow: 0 16px 34px rgba(131, 146, 193, 0.1);
}

.agent-chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  border-bottom: 1px solid rgba(230, 235, 247, 0.92);
  background: rgba(255, 255, 255, 0.84);
}

.agent-chat-head__identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.agent-chat-head__avatar {
  width: 38px;
  height: 38px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(136, 145, 180, 0.18);
  flex-shrink: 0;
}

.agent-chat-head__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.agent-chat-head__copy strong {
  color: #232a3b;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.agent-chat-head__copy span {
  color: #8f9ab4;
  font-size: 12px;
  line-height: 1.35;
}

.agent-chat-head__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #5b6a89;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.agent-chat-head__status i {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #28c76f;
  box-shadow: 0 0 0 4px rgba(40, 199, 111, 0.16);
}

.agent-chat-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  padding: 14px 12px 18px;
  overflow-y: auto;
}

.agent-message {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.agent-message--assistant {
  justify-content: flex-start;
}

.agent-message--user {
  justify-content: flex-end;
}

.agent-avatar {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(136, 145, 180, 0.2);
  flex-shrink: 0;
}

.agent-avatar--user {
  width: 35px;
  height: 35px;
}

.agent-bubble {
  max-width: calc(100% - 74px);
  padding: 12px 15px 9px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 26px rgba(141, 153, 184, 0.14);
}

.agent-message--assistant .agent-bubble {
  border-top-left-radius: 7px;
}

.agent-message--user .agent-bubble {
  min-width: 142px;
  border-top-right-radius: 7px;
  background: linear-gradient(180deg, rgba(243, 244, 255, 0.98) 0%, rgba(238, 239, 255, 0.98) 100%);
}

.agent-bubble--pending {
  background: rgba(255, 255, 255, 0.93);
}

.agent-bubble--error {
  background: #fff2ef;
}

.agent-bubble__label {
  display: inline-flex;
  align-items: center;
  margin-bottom: 7px;
  color: #7583a3;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.02em;
}

.agent-bubble__content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.agent-bubble__paragraph {
  margin: 0;
  color: #2b3143;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.66;
  white-space: pre-wrap;
}

.agent-bubble--error .agent-bubble__paragraph {
  color: #97513d;
}

.agent-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(229, 233, 245, 0.96);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
}

.agent-table {
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  color: #2b3143;
}

.agent-table thead {
  background: rgba(238, 242, 251, 0.96);
}

.agent-table th,
.agent-table td {
  padding: 9px 10px;
  text-align: left;
  vertical-align: top;
  white-space: nowrap;
  border-bottom: 1px solid rgba(235, 239, 247, 0.96);
}

.agent-table th {
  color: #44506d;
  font-size: 12px;
  font-weight: 700;
}

.agent-table td {
  color: #2b3143;
  line-height: 1.5;
}

.agent-bubble span {
  display: block;
  margin-top: 6px;
  color: #a2acc4;
  font-size: 12px;
  line-height: 1;
}

.agent-bottom {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding: 12px 12px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(230, 235, 247, 0.92);
  background: linear-gradient(180deg, rgba(250, 251, 255, 0.78) 0%, rgba(250, 251, 255, 0.98) 100%);
}

.agent-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.agent-composer__tip {
  margin: 0 0 8px;
  color: #8f9ab4;
  font-size: 12px;
  line-height: 1.4;
}

.agent-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 8px;
  border: 1px solid rgba(219, 223, 252, 0.95);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.97);
  color: #5d66ff;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 8px 18px rgba(132, 145, 199, 0.08);
  white-space: nowrap;
}

.agent-chip:disabled {
  opacity: 0.6;
}

.agent-chip__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: 700;
}

.agent-chip__icon--insight {
  color: #5f67ff;
  background: rgba(94, 103, 255, 0.12);
}

.agent-chip__icon--calendar {
  color: #6c58ff;
  background: rgba(108, 88, 255, 0.12);
}

.agent-chip__icon--question {
  color: #5664ff;
  background: rgba(86, 100, 255, 0.12);
}

.agent-chip__icon--fire {
  color: #ff7e2d;
  background: rgba(255, 126, 45, 0.14);
}

.agent-composer {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 10px 10px 12px;
  border: 1px solid rgba(233, 237, 246, 0.96);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(143, 156, 198, 0.1);
}

.agent-composer__input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: transparent;
  color: #2a3140;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
}

.agent-composer__input::placeholder {
  color: #a7afc5;
}

.agent-composer__send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #6d62ff 0%, #5b5dff 100%);
  color: #ffffff;
  box-shadow: 0 12px 24px rgba(102, 96, 255, 0.28);
  flex-shrink: 0;
}

.agent-composer__send svg {
  width: 18px;
  height: 18px;
  margin-left: 1px;
}

.agent-composer__send:disabled {
  opacity: 0.56;
  box-shadow: none;
}

@media (max-width: 420px) {
  .agent-shell {
    padding-left: 10px;
    padding-right: 10px;
  }

  .agent-hero {
    min-height: 148px;
    padding: 16px 15px 15px;
  }

  .agent-hero__copy {
    max-width: 224px;
  }

  .agent-hero__title h1 {
    font-size: 23px;
  }

  .agent-hero__bot {
    width: 176px;
  }

  .agent-chat-panel {
    min-height: calc(100vh - 232px);
  }

  .agent-chat-head {
    padding-left: 14px;
    padding-right: 14px;
  }

  .agent-chat-list {
    padding-left: 10px;
    padding-right: 10px;
  }

  .agent-bottom {
    padding-left: 10px;
    padding-right: 10px;
  }

  .agent-bubble {
    max-width: calc(100% - 70px);
  }
}
</style>

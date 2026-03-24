import { verifyToken } from "./_auth.js";
import { getUsageForUser } from "./_quota.js";
import { getDB } from "../db/init.js";

const modelName = "gemini-2.5-flash-lite";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const payload = verifyToken(req);
  if (!payload) {
    return res.status(401).json({ error: "请先登录" });
  }

  const { taskType, transcript, questionContent, question_id } = req.body || {};
  if (!transcript || transcript.trim().length < 3) {
    return res.status(400).json({
      error: "transcript_too_short",
      scores: { pronunciation: 0, fluency: 0, content: 0 },
      feedback: "没有识别到你的语音，请检查麦克风后重试。",
      overall: 0
    });
  }

  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
    return res.status(500).json({
      error: "missing_api_key",
      scores: { pronunciation: 60, fluency: 60, content: 60 },
      feedback: "AI 服务尚未配置完成，请稍后重试。",
      overall: 60
    });
  }

  try {
    const db = getDB();
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.user_id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const usage = getUsageForUser(db, user);
    if (!usage.canPractice) {
      return res.status(429).json({
        error: "daily_limit_reached",
        message: "今日 3 次免费额度已用完，明天凌晨 12 点重置，或升级解锁无限练习。"
      });
    }

    const prompt = buildPrompt(taskType, transcript, questionContent);
    const text = await generateContentWithRest(prompt, process.env.GEMINI_API_KEY);
    const parsed = normalizeResult(parseModelJson(text));

    db.prepare(
      `
      INSERT INTO practice_logs (user_id, task_type, question_id, transcript, score_json, feedback)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    ).run(
      user.id,
      taskType || "RA",
      question_id || "unknown",
      transcript,
      JSON.stringify(parsed.scores || {}),
      parsed.feedback || ""
    );

    return res.json(parsed);
  } catch (error) {
    console.error("Gemini error:", error);

    if (isQuotaError(error)) {
      return res.status(429).json({
        error: "ai_quota_exceeded",
        scores: { pronunciation: 60, fluency: 60, content: 60 },
        feedback: "AI 配额暂时已用完，当前先给你估算分数。稍后再试，结果会更准确。",
        overall: 60
      });
    }

    return res.status(500).json({
      error: "ai_error",
      scores: { pronunciation: 60, fluency: 60, content: 60 },
      feedback: "AI 分析暂时遇到问题，这是估算分数，请稍后重试。",
      overall: 60
    });
  }
}

async function generateContentWithRest(prompt, key) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    }
  );

  const data = await safeReadJson(response);
  if (!response.ok) {
    const error = new Error(extractGeminiErrorMessage(data) || `Gemini request failed with status ${response.status}`);
    error.status = response.status;
    error.statusText = response.statusText;
    error.details = data;
    throw error;
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    const error = new Error("Gemini returned empty content");
    error.status = 502;
    error.details = data;
    throw error;
  }

  return text;
}

async function safeReadJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractGeminiErrorMessage(data) {
  if (typeof data?.error?.message === "string" && data.error.message.trim()) {
    return data.error.message.trim();
  }
  return "";
}

function isQuotaError(error) {
  if (Number(error?.status) === 429) return true;
  const message = `${error?.message || ""}`.toLowerCase();
  const statusText = `${error?.statusText || ""}`.toLowerCase();
  return message.includes("quota") || message.includes("too many requests") || statusText.includes("too many requests");
}

function parseModelJson(rawText) {
  const cleanText = rawText.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleanText);
  } catch {
    const start = cleanText.indexOf("{");
    const end = cleanText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Invalid JSON from model");
    }
    return JSON.parse(cleanText.slice(start, end + 1));
  }
}

function normalizeResult(payload) {
  const pronunciation = clampScore(payload?.scores?.pronunciation);
  const fluency = clampScore(payload?.scores?.fluency);
  const content = clampScore(payload?.scores?.content);
  const feedback = typeof payload?.feedback === "string" ? payload.feedback.trim() : "你已经完成一次练习，继续保持节奏。";
  const overallRaw = Number(payload?.overall);
  const overall = Number.isFinite(overallRaw)
    ? Math.max(0, Math.min(100, Math.round(overallRaw)))
    : Math.round((pronunciation + fluency + content) / 3);
  const keywords = Array.isArray(payload?.keywords)
    ? payload.keywords
        .map((item) => ({
          word: typeof item?.word === "string" ? item.word : "",
          hit: Boolean(item?.hit)
        }))
        .filter((item) => item.word)
    : [];

  return {
    scores: {
      pronunciation,
      fluency,
      content
    },
    keywords,
    feedback,
    overall
  };
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(90, Math.round(num)));
}

function buildPrompt(taskType, transcript, questionContent) {
  const question = questionContent || "";

  const prompts = {
    RA: `
You are a PTE Academic examiner evaluating a Read Aloud response.

Original passage:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Score the student on these 3 criteria (0-90 scale, PTE scoring style):
- pronunciation: clarity and accuracy of individual sounds
- fluency: natural pace, rhythm, and smooth delivery without hesitation
- content: how much of the original passage was covered correctly

Rules:
- Be encouraging but honest
- Target band: 47-58 (intermediate learners)
- Feedback must be in Chinese, warm coach tone, NOT examiner tone
- Never use words like "错误", "失败", "很差"
- Give ONE specific actionable tip

Respond ONLY with this JSON, no other text:
{
  "scores": {
    "pronunciation": <number 0-90>,
    "fluency": <number 0-90>,
    "content": <number 0-90>
  },
  "feedback": "<Chinese feedback, 2-3 sentences, warm and specific>",
  "overall": <average of three scores, rounded to integer>
}`,

    RS: `
You are a PTE Academic examiner evaluating a Repeat Sentence response.

Original sentence:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Evaluate keyword coverage: compare what the student said against the original sentence.
Identify which important content words (nouns, verbs, adjectives) were:
- hit: present in student's response
- missed: not present in student's response

Score overall as a percentage of keywords covered (0-100).

Rules:
- Feedback in Chinese, warm coach tone
- Never use negative words like "错误", "失败", "很差"
- Instead say things like "这次抓住了...，下次可以注意..."

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": <number 0-90>,
    "fluency": <number 0-90>,
    "content": <number 0-90>
  },
  "keywords": [
    { "word": "<keyword>", "hit": <true or false> }
  ],
  "feedback": "<Chinese feedback, warm tone, 2 sentences>",
  "overall": <keyword coverage percentage 0-100>
}`,

    RL: `
You are a PTE Academic examiner evaluating a Re-tell Lecture response.

Lecture content / topic hint:
"${question}"

Student's spoken response (transcribed):
"${transcript}"

Evaluate:
- content: key points coverage (did they mention the main topic and at least 2 points?)
- pronunciation: clarity
- fluency: natural delivery

Rules:
- Feedback in Chinese, warm coach tone
- Encourage use of template: "The lecture mainly discusses... The speaker mentions... In conclusion..."
- Never use negative words

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": <number 0-90>,
    "fluency": <number 0-90>,
    "content": <number 0-90>
  },
  "feedback": "<Chinese feedback, 2-3 sentences, mention specific points they did well>",
  "overall": <average of three scores>
}`,

    WFD: `
You are a PTE Academic examiner evaluating a Write From Dictation response.

Original sentence:
"${question}"

Student input:
"${transcript}"

Evaluate:
- content: exact word match coverage
- pronunciation: use 0 for WFD
- fluency: use 0 for WFD

Rules:
- Feedback in Chinese, warm coach tone
- Focus on spelling, function words, and missing words
- Never use negative words like "很差"

Respond ONLY with this JSON:
{
  "scores": {
    "pronunciation": 0,
    "fluency": 0,
    "content": <number 0-90>
  },
  "feedback": "<Chinese feedback, 1-2 sentences>",
  "overall": <number 0-100>
}`
  };

  return prompts[taskType] || prompts.RA;
}

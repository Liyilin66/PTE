import questionCatalogSeed from "../../seeds/we/we-question-catalog.phase1.json";
import taxonomySeed from "../../seeds/we/we-taxonomy.phase1.json";
import templateBankSeed from "../../seeds/we/we-template-bank.phase1.json";
import opinionSentenceSeed from "../../seeds/we/we-opinion-sentences.phase1.json";
import linkerBankSeed from "../../seeds/we/we-linker-bank.phase1.json";
import exampleBankSeed from "../../seeds/we/we-example-bank.phase1.json";
import relatedOverridesSeed from "../../seeds/we/we-related-overrides.phase1.json";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeQuestion(rawQuestion) {
  return {
    id: String(rawQuestion?.id || "").trim(),
    sourceNumberLabel: String(rawQuestion?.sourceNumberLabel || "").trim(),
    sourceRefId: rawQuestion?.sourceRefId ? String(rawQuestion.sourceRefId).trim() : null,
    displayTitle: String(rawQuestion?.displayTitle || "").trim(),
    promptText: String(rawQuestion?.promptText || "").trim(),
    promptType: String(rawQuestion?.promptType || "").trim(),
    primaryTopic: String(rawQuestion?.primaryTopic || "").trim(),
    secondaryTopics: toArray(rawQuestion?.secondaryTopics).map((item) => String(item || "").trim()).filter(Boolean),
    relatedQuestionIds: toArray(rawQuestion?.relatedQuestionIds).map((item) => String(item || "").trim()).filter(Boolean),
    variants: toArray(rawQuestion?.variants).map((item) => ({
      variantId: String(item?.variantId || "").trim(),
      promptText: String(item?.promptText || "").trim()
    })),
    difficulty: Number(rawQuestion?.difficulty || 2)
  };
}

function normalizeTemplate(rawTemplate) {
  const sections = rawTemplate?.sections || {};
  return {
    id: String(rawTemplate?.id || "").trim(),
    title: String(rawTemplate?.title || "").trim(),
    shortLabel: String(rawTemplate?.shortLabel || "").trim(),
    promptTypes: toArray(rawTemplate?.promptTypes).map((item) => String(item || "").trim()).filter(Boolean),
    stance: String(rawTemplate?.stance || "").trim(),
    usageMode: String(rawTemplate?.usageMode || "").trim(),
    structureLabel: String(rawTemplate?.structureLabel || "").trim(),
    content: String(rawTemplate?.content || "").trim(),
    sections: {
      intro: String(sections?.intro || "").trim(),
      body1: String(sections?.body1 || "").trim(),
      body2: String(sections?.body2 || "").trim(),
      conclusion: String(sections?.conclusion || "").trim()
    },
    difficulty: Number(rawTemplate?.difficulty || 2),
    sortOrder: Number(rawTemplate?.sortOrder || 999),
    isUniversal: Boolean(rawTemplate?.isUniversal)
  };
}

const questionCatalog = toArray(questionCatalogSeed?.questions).map((item) => normalizeQuestion(item));
const questionMap = new Map(questionCatalog.map((item) => [item.id, item]));
const relatedOverrideMap = new Map(
  toArray(relatedOverridesSeed?.overrides).map((item) => [
    String(item?.id || "").trim(),
    toArray(item?.relatedQuestionIds).map((id) => String(id || "").trim()).filter(Boolean)
  ])
);
const templateCatalog = toArray(templateBankSeed?.templates)
  .map((item) => normalizeTemplate(item))
  .sort((a, b) => a.sortOrder - b.sortOrder);
const templateMap = new Map(templateCatalog.map((item) => [item.id, item]));

function cloneQuestion(question) {
  if (!question) return null;
  return {
    ...question,
    secondaryTopics: [...question.secondaryTopics],
    relatedQuestionIds: [...question.relatedQuestionIds],
    variants: question.variants.map((item) => ({ ...item }))
  };
}

function cloneTemplate(template) {
  if (!template) return null;
  return {
    ...template,
    promptTypes: [...template.promptTypes],
    sections: { ...template.sections }
  };
}

export function getWEQuestionCatalog() {
  return questionCatalog.map((item) => cloneQuestion(item));
}

export function getWEQuestionById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return cloneQuestion(questionMap.get(key));
}

export function getWEQuestionsByTopic(topic) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) return getWEQuestionCatalog();
  return questionCatalog.filter((item) => item.primaryTopic === normalizedTopic).map((item) => cloneQuestion(item));
}

export function getWEQuestionsByPromptType(promptType) {
  const normalizedPromptType = String(promptType || "").trim();
  if (!normalizedPromptType) return getWEQuestionCatalog();
  return questionCatalog
    .filter((item) => item.promptType === normalizedPromptType)
    .map((item) => cloneQuestion(item));
}

export function getRelatedWEQuestions(id) {
  const question = getWEQuestionById(id);
  if (!question) return [];

  const overrideIds = relatedOverrideMap.get(question.id);
  const relatedIds = overrideIds && overrideIds.length ? overrideIds : question.relatedQuestionIds;

  return relatedIds.map((itemId) => getWEQuestionById(itemId)).filter(Boolean);
}

export function getWETemplatesByPromptType(promptType) {
  void promptType;
  return getUniversalWETemplates();
}

export function getWETemplates() {
  return templateCatalog.map((item) => cloneTemplate(item));
}

export function getUniversalWETemplates() {
  const universalTemplates = templateCatalog.filter((item) => item.isUniversal);
  if (universalTemplates.length) {
    return universalTemplates.map((item) => cloneTemplate(item));
  }
  return getWETemplates();
}

export function getDefaultWETemplate() {
  const templates = getUniversalWETemplates();
  return templates.length ? templates[0] : null;
}

export function getWETemplateById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return cloneTemplate(templateMap.get(key));
}

export function getRecommendedWETemplates(question) {
  void question;
  return getUniversalWETemplates();
}

export function getWEOpinionSentencesByTopic(topic) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) return [];

  const groups = toArray(opinionSentenceSeed?.groups);
  const found = groups.find((item) => String(item?.primaryTopic || "").trim() === normalizedTopic);
  return toArray(found?.sentences).map((item) => ({ ...item }));
}

export function getWELinkers() {
  return toArray(linkerBankSeed?.groups).map((item) => ({
    ...item,
    phrases: [...toArray(item?.phrases)]
  }));
}

export function getWEExamplesByTopic(topic) {
  const normalizedTopic = String(topic || "").trim();
  if (!normalizedTopic) return [];

  const groups = toArray(exampleBankSeed?.groups);
  const found = groups.find((item) => String(item?.primaryTopic || "").trim() === normalizedTopic);
  return toArray(found?.examples).map((item) => ({
    ...item,
    useForPromptTypes: [...toArray(item?.useForPromptTypes)]
  }));
}

export function getWERelatedQuestionIds(id) {
  const question = getWEQuestionById(id);
  if (!question) return [];

  const overrideIds = relatedOverrideMap.get(question.id);
  return overrideIds && overrideIds.length ? [...overrideIds] : [...question.relatedQuestionIds];
}

export function getWETaxonomy() {
  return {
    ...taxonomySeed,
    primaryTopics: toArray(taxonomySeed?.primaryTopics).map((item) => ({ ...item })),
    promptTypes: toArray(taxonomySeed?.promptTypes).map((item) => ({ ...item })),
    difficultyScale: toArray(taxonomySeed?.difficultyScale).map((item) => ({ ...item }))
  };
}

export function getRandomWEQuestion(excludedId = "") {
  const normalizedExcludedId = String(excludedId || "").trim();
  const pool = normalizedExcludedId ? questionCatalog.filter((item) => item.id !== normalizedExcludedId) : questionCatalog;
  if (!pool.length) return null;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return cloneQuestion(picked);
}

export const FREE_DAILY_LIMIT = 3;
export const TRIAL_DAYS = 3;

export function getUsageForUser(db, user) {
  const isPremium = user.is_premium === 1;
  const daysSinceCreated = getDaysSinceCreated(user.created_at);
  const isInTrial = daysSinceCreated < TRIAL_DAYS;
  const trialDaysLeft = Math.max(0, TRIAL_DAYS - daysSinceCreated);

  const todayStart = getTodayStartSqlTimestampUTC8();
  const todayCount = db
    .prepare(
      `
      SELECT COUNT(*) as count FROM practice_logs
      WHERE user_id = ? AND datetime(created_at) >= datetime(?)
    `
    )
    .get(user.id, todayStart).count;

  const remainingToday = Math.max(0, FREE_DAILY_LIMIT - todayCount);
  const canPractice = isPremium || isInTrial || remainingToday > 0;

  return {
    isPremium,
    isInTrial,
    trialDaysLeft,
    todayCount,
    remainingToday,
    dailyLimit: FREE_DAILY_LIMIT,
    canPractice
  };
}

function getDaysSinceCreated(createdAtValue) {
  const createdAt = parseSqliteDate(createdAtValue);
  const diffMs = Date.now() - createdAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function parseSqliteDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;

  const raw = String(value).trim();
  if (!raw) return new Date();

  if (raw.includes("T")) {
    const parsedISO = new Date(raw);
    return Number.isNaN(parsedISO.getTime()) ? new Date() : parsedISO;
  }

  const parsedUTC = new Date(raw.replace(" ", "T") + "Z");
  return Number.isNaN(parsedUTC.getTime()) ? new Date() : parsedUTC;
}

function getTodayStartSqlTimestampUTC8() {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const utc8Ms = utcMs + 8 * 60 * 60 * 1000;
  const dayStartUTC8Ms = Math.floor(utc8Ms / 86400000) * 86400000;
  const dayStartUtcMs = dayStartUTC8Ms - 8 * 60 * 60 * 1000;
  const dayStartUtc = new Date(dayStartUtcMs);
  return dayStartUtc.toISOString().slice(0, 19).replace("T", " ");
}

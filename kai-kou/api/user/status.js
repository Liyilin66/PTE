import { verifyToken } from "../_auth.js";
import { getUsageForUser } from "../_quota.js";
import { getDB } from "../../db/init.js";

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  try {
    const db = getDB();
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(payload.user_id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const usage = getUsageForUser(db, user);
    return res.json({
      user_id: user.id,
      email: user.email,
      is_premium: usage.isPremium,
      is_in_trial: usage.isInTrial,
      trial_days_left: usage.trialDaysLeft,
      used_today: usage.todayCount,
      remaining_today: usage.remainingToday,
      daily_limit: usage.dailyLimit,
      can_practice: usage.canPractice
    });
  } catch (error) {
    console.error("Status error:", error);
    return res.status(500).json({ error: "Failed to load status" });
  }
}

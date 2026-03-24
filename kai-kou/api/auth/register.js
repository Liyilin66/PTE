import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDB } from "../../db/init.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    return res.status(500).json({ error: "JWT_SECRET 未配置或长度不足（至少 32 位）" });
  }

  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ error: "请输入邮箱和密码" });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "邮箱格式不正确" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "密码至少 6 位" });
  }

  try {
    const db = getDB();
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) {
      return res.status(409).json({ error: "该邮箱已注册，请直接登录" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertResult = db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, passwordHash);
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(insertResult.lastInsertRowid);

    const token = jwt.sign(
      {
        user_id: user.id,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        is_premium: user.is_premium === 1,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "注册失败，请稍后重试" });
  }
}

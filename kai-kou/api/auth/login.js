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

  try {
    const db = getDB();
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    if (!user) {
      return res.status(401).json({ error: "邮箱或密码错误" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "邮箱或密码错误" });
    }

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
    console.error("Login error:", error);
    return res.status(500).json({ error: "登录失败，请稍后重试" });
  }
}

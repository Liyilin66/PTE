import jwt from "jsonwebtoken";

export function verifyToken(req) {
  const auth = req.headers?.authorization || req.headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) return null;
  if (!process.env.JWT_SECRET) return null;

  try {
    return jwt.verify(auth.slice(7), process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

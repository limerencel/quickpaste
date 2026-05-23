// api/auth/register.js
import bcrypt from "bcryptjs";
import { createUser, findUserByUsername } from "../../lib/db.js";
import { signToken, setAuthCookie } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { username, password } = req.body;

  if (!username || !password || username.length < 2 || password.length < 6) {
    return res.status(400).json({ error: "用户名至少2位，密码至少6位" });
  }

  const existing = await findUserByUsername(username);
  if (existing) {
    return res.status(409).json({ error: "用户名已存在" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createUser(username, passwordHash);

  const token = signToken({ userId: user.id, username: user.username });
  setAuthCookie(res, token);

  return res.status(201).json({ ok: true, username: user.username });
}

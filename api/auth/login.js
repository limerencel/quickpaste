// api/auth/login.js
import bcrypt from "bcryptjs";
import { findUserByUsername } from "../../lib/db.js";
import { signToken, setAuthCookie } from "../../lib/auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "请输入用户名和密码" });
  }

  const user = await findUserByUsername(username);
  if (!user) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "用户名或密码错误" });
  }

  const token = signToken({ userId: user.id, username: user.username });
  setAuthCookie(res, token);

  return res.json({ ok: true, username: user.username });
}

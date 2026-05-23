// api/auth/logout.js
import { clearAuthCookie } from "../../lib/auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  clearAuthCookie(res);
  return res.json({ ok: true });
}

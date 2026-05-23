// api/init.js — One-time DB initialization
// Call this once after deployment: GET /api/init?secret=YOUR_JWT_SECRET

import { initDb } from "../lib/db.js";

export default async function handler(req, res) {
  const { secret } = req.query;
  if (secret !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }
  await initDb();
  return res.json({ ok: true, message: "Database initialized" });
}

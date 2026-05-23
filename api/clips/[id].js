// api/clips/[id].js — DELETE /api/clips/:id
import { deleteClip } from "../../lib/db.js";
import { requireAuth } from "../../lib/auth.js";
import { sseNotify } from "../sse.js";

export default async function handler(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "DELETE") return res.status(405).end();

  const clipId = parseInt(req.query.id);
  if (!clipId) return res.status(400).json({ error: "Invalid ID" });

  const deleted = await deleteClip(clipId, userId);
  if (!deleted) return res.status(404).json({ error: "Not found" });

  sseNotify(userId, { type: "delete_clip", clipId });
  return res.json({ ok: true });
}

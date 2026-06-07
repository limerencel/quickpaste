// api/clips/[id].js — DELETE /api/clips/:id, PUT /api/clips/:id
import { deleteClip, updateClip } from "../../lib/db.js";
import { requireAuth } from "../../lib/auth.js";
import { sseNotify } from "../sse.js";

export default async function handler(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const clipId = parseInt(req.query.id);
  if (!clipId) return res.status(400).json({ error: "Invalid ID" });

  if (req.method === "DELETE") {
    const deleted = await deleteClip(clipId, userId);
    if (!deleted) return res.status(404).json({ error: "Not found" });

    sseNotify(userId, { type: "delete_clip", clipId });
    return res.json({ ok: true });
  }

  if (req.method === "PUT" || req.method === "PATCH") {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: "Content cannot be empty" });
    }

    const updated = await updateClip(clipId, userId, content.trim());
    if (!updated) return res.status(404).json({ error: "Not found" });

    sseNotify(userId, { type: "update_clip", clip: updated });
    return res.json(updated);
  }

  return res.status(405).end();
}

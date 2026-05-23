// api/share/[id].js — POST/DELETE /api/share/:id
// POST: generate a share link for a clip
// DELETE: remove the share link

import { nanoid } from "nanoid";
import { setShareId, removeShareId } from "../../lib/db.js";
import { requireAuth } from "../../lib/auth.js";
import { sseNotify } from "../sse.js";

export default async function handler(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const clipId = parseInt(req.query.id);
  if (!clipId) return res.status(400).json({ error: "Invalid ID" });

  if (req.method === "POST") {
    // Generate a short, URL-safe share ID (8 chars)
    const shareId = nanoid(8);
    const clip = await setShareId(clipId, userId, shareId);
    if (!clip) return res.status(404).json({ error: "Clip not found" });

    sseNotify(userId, { type: "update_clip", clip });
    return res.json({ shareId, url: `/s/${shareId}` });
  }

  if (req.method === "DELETE") {
    const ok = await removeShareId(clipId, userId);
    if (!ok) return res.status(404).json({ error: "Clip not found" });

    sseNotify(userId, { type: "update_clip", clip: { id: clipId, share_id: null } });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}

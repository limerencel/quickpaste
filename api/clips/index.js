// api/clips/index.js — GET /api/clips, POST /api/clips
import { getClipsByUserId, createClip } from "../../lib/db.js";
import { requireAuth } from "../../lib/auth.js";
import { sseNotify } from "../sse.js";

export default async function handler(req, res) {
  const userId = requireAuth(req, res);
  if (!userId) return;

  if (req.method === "GET") {
    const clips = await getClipsByUserId(userId);
    return res.json(clips);
  }

  if (req.method === "POST") {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ error: "内容不能为空" });
    }
    const clip = await createClip(userId, content.trim());
    // Notify all SSE connections for this user
    sseNotify(userId, { type: "new_clip", clip });
    return res.status(201).json(clip);
  }

  return res.status(405).end();
}

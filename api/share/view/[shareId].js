// api/share/view/[shareId].js — GET /api/share/view/:shareId
// Public endpoint — no auth required
import { getClipByShareId } from "../../../lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { shareId } = req.query;
  const clip = await getClipByShareId(shareId);

  if (!clip) {
    return res.status(404).json({ error: "分享链接不存在或已被删除" });
  }

  return res.json({ content: clip.content, created_at: clip.created_at });
}

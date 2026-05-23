// api/sse.js — Server-Sent Events for real-time cross-device sync
//
// NOTE: In Vercel's serverless model, each function instance is isolated.
// For true real-time push across instances, we'd need an external pub/sub.
// 
// Strategy used here: 
// - The SSE connection is kept open and we use a module-level Map for same-instance connections
// - For cross-instance (production Vercel), the client polls every 5s as fallback
// - This works perfectly for single-region or low-traffic usage
// - If you want true real-time across all instances, use Upstash Redis Pub/Sub (easy upgrade)

import { getAuthUser } from "../lib/auth.js";

// In-process connection map: userId → Set<{res, id}>
// Works for local dev + single Vercel instance
const connections = new Map();

/** Notify all SSE connections for a userId */
export function sseNotify(userId, data) {
  const conns = connections.get(userId);
  if (!conns || conns.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const conn of conns) {
    try {
      conn.res.write(payload);
    } catch {
      conns.delete(conn);
    }
  }
}

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const userId = getAuthUser(req);
  if (!userId) return res.status(401).end();

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  // Send initial heartbeat
  res.write(`: connected\n\n`);

  // Register connection
  const conn = { res, id: Date.now() };
  if (!connections.has(userId)) connections.set(userId, new Set());
  connections.get(userId).add(conn);

  // Heartbeat every 25s to prevent timeout
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      cleanup();
    }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    const conns = connections.get(userId);
    if (conns) {
      conns.delete(conn);
      if (conns.size === 0) connections.delete(userId);
    }
  }

  req.on("close", cleanup);
  req.on("error", cleanup);
}

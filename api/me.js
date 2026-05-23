// api/me.js — GET /api/me — returns current user info
import { requireAuth } from "../lib/auth.js";
import { findUserByUsername } from "../lib/db.js";
import { verifyToken } from "../lib/auth.js";

// Read cookie manually to get username from token without DB hit
function parseCookies(header) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, decodeURIComponent(v.join('='))];
    })
  );
}

export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['qp_token'];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: 'Invalid token' });

  return res.json({ userId: payload.userId, username: payload.username });
}

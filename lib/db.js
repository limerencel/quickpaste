// lib/db.js — Turso (libSQL) data layer
// All SQL is standard SQLite syntax

import { createClient } from "@libsql/client";

let _client = null;

function getClient() {
  if (!_client) {
    _client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _client;
}

// Initialize tables (call once on first deploy or run migrations)
export async function initDb() {
  const db = getClient();
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      share_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_clips_user_id ON clips(user_id);
    CREATE INDEX IF NOT EXISTS idx_clips_share_id ON clips(share_id);
  `);
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function createUser(username, passwordHash) {
  const db = getClient();
  const result = await db.execute({
    sql: "INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING *",
    args: [username, passwordHash],
  });
  return result.rows[0];
}

export async function findUserByUsername(username) {
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT * FROM users WHERE username = ?",
    args: [username],
  });
  return result.rows[0] ?? null;
}

// ── Clips ─────────────────────────────────────────────────────────────────────

export async function getClipsByUserId(userId) {
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT * FROM clips WHERE user_id = ? ORDER BY created_at DESC",
    args: [userId],
  });
  return result.rows;
}

export async function createClip(userId, content) {
  const db = getClient();
  const result = await db.execute({
    sql: "INSERT INTO clips (user_id, content) VALUES (?, ?) RETURNING *",
    args: [userId, content],
  });
  return result.rows[0];
}

export async function deleteClip(clipId, userId) {
  const db = getClient();
  const result = await db.execute({
    sql: "DELETE FROM clips WHERE id = ? AND user_id = ?",
    args: [clipId, userId],
  });
  return result.rowsAffected > 0;
}

export async function setShareId(clipId, userId, shareId) {
  const db = getClient();
  const result = await db.execute({
    sql: "UPDATE clips SET share_id = ? WHERE id = ? AND user_id = ? RETURNING *",
    args: [shareId, clipId, userId],
  });
  return result.rows[0] ?? null;
}

export async function removeShareId(clipId, userId) {
  const db = getClient();
  const result = await db.execute({
    sql: "UPDATE clips SET share_id = NULL WHERE id = ? AND user_id = ?",
    args: [clipId, userId],
  });
  return result.rowsAffected > 0;
}

export async function getClipByShareId(shareId) {
  const db = getClient();
  const result = await db.execute({
    sql: "SELECT * FROM clips WHERE share_id = ?",
    args: [shareId],
  });
  return result.rows[0] ?? null;
}

// app.js — QuickPaste main client logic
// Handles: auth check, clip rendering, SSE real-time sync, share links, copy
// Aesthetic: Warm Parchment Brutalist (ALL UPPERCASE ENGLISH UI)

// ── State ─────────────────────────────────────────────────────────────────────
let clips = [];
let sseSource = null;
let sseRetryTimer = null;
let editingClipId = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const clipInput = document.getElementById('clip-input');
const sendBtn = document.getElementById('send-btn');
const clipsList = document.getElementById('clips-list');
const clipsCount = document.getElementById('clips-count');
const statusDot = document.getElementById('status-dot');
const usernameLabel = document.getElementById('username-label');
const logoutBtn = document.getElementById('logout-btn');
const toastContainer = document.getElementById('toast-container');

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg.toUpperCase(); // Force uppercase toast notifications
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

// ── Linkify ───────────────────────────────────────────────────────────────────
function linkify(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(
    /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

// ── Time format ───────────────────────────────────────────────────────────────
function parseDateUTC(dateStr) {
  if (typeof dateStr === 'string') {
    let normalized = dateStr.trim();
    if (!normalized.includes('T') && normalized.includes(' ')) {
      normalized = normalized.replace(' ', 'T');
    }
    if (!normalized.includes('Z') && !normalized.match(/[+-]\d{2}:\d{2}$/)) {
      normalized += 'Z';
    }
    return new Date(normalized);
  }
  return new Date(dateStr);
}

function relativeTime(iso) {
  const parsed = parseDateUTC(iso);
  const diff = Date.now() - parsed.getTime();
  if (diff < 60000) return 'JUST NOW';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}M AGO`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}H AGO`;
  return parsed.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  }).toUpperCase();
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) {
    window.location.href = '/login.html';
    return null;
  }
  return res;
}

// ── Render clips ──────────────────────────────────────────────────────────────
function renderClips() {
  if (clips.length === 0) {
    clipsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>NO CLIPS FOUND<br/>PASTE ANYTHING ABOVE TO SYNC ACROSS DEVICES</p>
      </div>`;
    clipsCount.classList.add('hidden');
    return;
  }

  clipsCount.textContent = clips.length;
  clipsCount.classList.remove('hidden');

  clipsList.innerHTML = clips.map(clip => renderClipCard(clip)).join('');

  // Bind events after render
  clipsList.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', () => copyClip(btn.dataset.copy, btn));
  });
  clipsList.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteClip(parseInt(btn.dataset.delete)));
  });
  clipsList.querySelectorAll('[data-share]').forEach(btn => {
    btn.addEventListener('click', () => shareClip(parseInt(btn.dataset.share), btn));
  });
  clipsList.querySelectorAll('[data-unshare]').forEach(btn => {
    btn.addEventListener('click', () => unshareClip(parseInt(btn.dataset.unshare)));
  });
  clipsList.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => startEdit(parseInt(btn.dataset.edit)));
  });
  clipsList.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => saveEdit(parseInt(btn.dataset.save)));
  });
  clipsList.querySelectorAll('[data-discard]').forEach(btn => {
    btn.addEventListener('click', () => discardEdit());
  });
}

function renderClipCard(clip) {
  const isEditing = clip.id === editingClipId;
  if (isEditing) {
    return `<div class="clip-card editing" data-id="${clip.id}">
      <textarea class="edit-textarea" id="edit-textarea-${clip.id}" autocomplete="off" spellcheck="false">${escTextarea(clip.content)}</textarea>
      <div class="clip-footer">
        <span class="clip-time">EDITING CLIP</span>
        <div class="clip-actions">
          <button class="btn btn-sm" data-save="${clip.id}" title="SAVE CHANGES">SAVE</button>
          <button class="btn btn-sm btn-ghost" data-discard="${clip.id}" title="DISCARD CHANGES">DISCARD</button>
        </div>
      </div>
    </div>`;
  }

  const shared = clip.share_id
    ? `<span class="share-badge visible" title="SHARED CLIP">🔗 SHARED</span>`
    : `<span class="share-badge"></span>`;

  const shareBtn = clip.share_id
    ? `<button class="btn-icon danger" data-unshare="${clip.id}" title="REVOKE SHARE" aria-label="REVOKE SHARE">🔗</button>`
    : `<button class="btn-icon" data-share="${clip.id}" title="SHARE CLIP" aria-label="SHARE CLIP">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
      </button>`;

  return `<div class="clip-card" data-id="${clip.id}">
    <div class="clip-content">${linkify(clip.content)}</div>
    <div class="clip-footer">
      <div style="display:flex;align-items:center;gap:0.5rem">
        <span class="clip-time">${relativeTime(clip.created_at)}</span>
        ${shared}
      </div>
      <div class="clip-actions">
        <button class="btn-icon" data-edit="${clip.id}" title="EDIT CONTENT" aria-label="EDIT CONTENT">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        <button class="btn-icon" data-copy="${escAttr(clip.content)}" title="COPY CONTENT" aria-label="COPY CONTENT">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        ${shareBtn}
        <button class="btn-icon danger" data-delete="${clip.id}" title="DELETE CLIP" aria-label="DELETE CLIP">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  </div>`;
}

function escAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escTextarea(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Copy ──────────────────────────────────────────────────────────────────────
async function copyClip(content, btn) {
  // content comes from data attribute, need to unescape HTML entities
  const ta = document.createElement('textarea');
  ta.innerHTML = content;
  const decoded = ta.value;

  try {
    await navigator.clipboard.writeText(decoded);
  } catch {
    const t = document.createElement('textarea');
    t.value = decoded;
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    document.body.removeChild(t);
  }
  const originalHTML = btn.innerHTML;
  btn.innerHTML = '✓';
  btn.classList.add('success');
  toast('copied to clipboard', 'success');
  setTimeout(() => { btn.innerHTML = originalHTML; btn.classList.remove('success'); }, 1500);
}

// ── Send clip ─────────────────────────────────────────────────────────────────
async function sendClip() {
  const content = clipInput.value.trim();
  if (!content) return;

  sendBtn.disabled = true;
  sendBtn.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></div> SENDING`;

  try {
    const res = await api('POST', '/api/clips', { content });
    if (!res) return;
    if (!res.ok) {
      const data = await res.json();
      toast(data.error ? data.error.toUpperCase() : 'send failed', 'error');
      return;
    }
    const clip = await res.json();
    clipInput.value = '';
    clipInput.style.height = '';
    // Prepend to local state (SSE will also push, avoid dupe with check)
    if (!clips.find(c => c.id === clip.id)) {
      clips.unshift(clip);
      renderClips();
    }
    toast('sent successfully', 'success');
  } catch {
    toast('network error', 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> SEND`;
  }
}

// ── Delete clip ───────────────────────────────────────────────────────────────
async function deleteClip(clipId) {
  const res = await api('DELETE', `/api/clips/${clipId}`);
  if (!res) return;
  if (!res.ok) { toast('delete failed', 'error'); return; }

  clips = clips.filter(c => c.id !== clipId);
  // Animate removal
  const card = clipsList.querySelector(`[data-id="${clipId}"]`);
  if (card) {
    card.style.transition = 'opacity 0.1s, transform 0.1s';
    card.style.opacity = '0';
    card.style.transform = 'translateY(4px)';
    setTimeout(() => renderClips(), 110);
  } else {
    renderClips();
  }
}

// ── Edit clip ─────────────────────────────────────────────────────────────────
function startEdit(clipId) {
  editingClipId = clipId;
  renderClips();

  // Focus and adjust height of the textarea
  const ta = document.getElementById(`edit-textarea-${clipId}`);
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    ta.style.height = '';
    ta.style.height = Math.min(ta.scrollHeight, 260) + 'px';
    ta.addEventListener('input', () => {
      ta.style.height = '';
      ta.style.height = Math.min(ta.scrollHeight, 260) + 'px';
    });
  }
}

function discardEdit() {
  editingClipId = null;
  renderClips();
}

async function saveEdit(clipId) {
  const ta = document.getElementById(`edit-textarea-${clipId}`);
  if (!ta) return;
  const newContent = ta.value.trim();
  if (!newContent) {
    toast('content cannot be empty', 'error');
    return;
  }

  const saveBtn = clipsList.querySelector(`[data-save="${clipId}"]`);
  const discardBtn = clipsList.querySelector(`[data-discard="${clipId}"]`);
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'SAVING...';
  }
  if (discardBtn) discardBtn.disabled = true;
  ta.disabled = true;

  try {
    const res = await api('PUT', `/api/clips/${clipId}`, { content: newContent });
    if (!res) return;
    if (!res.ok) {
      const data = await res.json();
      toast(data.error ? data.error.toUpperCase() : 'update failed', 'error');
      return;
    }
    const updated = await res.json();

    const idx = clips.findIndex(c => c.id === clipId);
    if (idx !== -1) {
      clips[idx] = updated;
    }
    editingClipId = null;
    renderClips();
    toast('updated successfully', 'success');
  } catch {
    toast('network error', 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'SAVE';
    }
    if (discardBtn) discardBtn.disabled = false;
    if (ta) ta.disabled = false;
  }
}

// ── Share clip ────────────────────────────────────────────────────────────────
async function shareClip(clipId, btn) {
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:2px"></div>`;
  btn.disabled = true;

  try {
    const res = await api('POST', `/api/share/${clipId}`);
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { toast(data.error ? data.error.toUpperCase() : 'share failed', 'error'); return; }

    // Update local clip
    const clip = clips.find(c => c.id === clipId);
    if (clip) clip.share_id = data.shareId;
    renderClips();

    // Copy share URL to clipboard
    const shareUrl = `${location.origin}/s/${data.shareId}`;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    toast('share link copied 🔗', 'success');
  } finally {
    btn.disabled = false;
  }
}

// ── Unshare clip ──────────────────────────────────────────────────────────────
async function unshareClip(clipId) {
  const res = await api('DELETE', `/api/share/${clipId}`);
  if (!res) return;
  if (!res.ok) { toast('action failed', 'error'); return; }

  const clip = clips.find(c => c.id === clipId);
  if (clip) clip.share_id = null;
  renderClips();
  toast('share revoked', 'success');
}

// ── Load clips ────────────────────────────────────────────────────────────────
async function loadClips() {
  try {
    const res = await api('GET', '/api/clips');
    if (!res) return;
    clips = await res.json();
    renderClips();
  } catch {
    clipsList.innerHTML = `<div class="empty-state"><p style="color:var(--red)">LOAD FAILED. PLEASE REFRESH PAGE.</p></div>`;
  }
}

// ── SSE connection ────────────────────────────────────────────────────────────
function connectSSE() {
  if (sseSource) sseSource.close();

  sseSource = new EventSource('/api/sse', { withCredentials: true });

  sseSource.onopen = () => {
    statusDot.className = 'status-dot connected';
    statusDot.title = 'CONNECTED (REAL-TIME SYNC)';
    if (sseRetryTimer) { clearTimeout(sseRetryTimer); sseRetryTimer = null; }
  };

  sseSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      handleSSEEvent(event);
    } catch { /* ignore comment lines */ }
  };

  sseSource.onerror = () => {
    statusDot.className = 'status-dot error';
    statusDot.title = 'DISCONNECTED, RECONNECTING...';
    sseSource.close();
    sseRetryTimer = setTimeout(connectSSE, 3000);
  };
}

function handleSSEEvent(event) {
  switch (event.type) {
    case 'new_clip':
      if (!clips.find(c => c.id === event.clip.id)) {
        clips.unshift(event.clip);
        renderClips();
      }
      break;
    case 'delete_clip':
      clips = clips.filter(c => c.id !== event.clipId);
      renderClips();
      break;
    case 'update_clip':
      const idx = clips.findIndex(c => c.id === event.clip.id);
      if (idx !== -1) Object.assign(clips[idx], event.clip);
      renderClips();
      break;
  }
}

// ── Auto-resize textarea ──────────────────────────────────────────────────────
clipInput.addEventListener('input', () => {
  clipInput.style.height = '';
  clipInput.style.height = Math.min(clipInput.scrollHeight, 260) + 'px';
});

// ── Send events ───────────────────────────────────────────────────────────────
sendBtn.addEventListener('click', sendClip);

clipInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendClip();
  }
});

// ── Logout ────────────────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
  await api('POST', '/api/auth/logout');
  window.location.href = '/login.html';
});

// ── Check auth on load ────────────────────────────────────────────────────────
async function init() {
  // Fetch user info and clips in parallel
  const [meRes, clipsRes] = await Promise.all([
    fetch('/api/me', { credentials: 'include' }),
    fetch('/api/clips', { credentials: 'include' }),
  ]);

  if (clipsRes.status === 401 || meRes.status === 401) {
    window.location.href = '/login.html';
    return;
  }

  const me = await meRes.json();
  usernameLabel.textContent = me.username;

  clips = await clipsRes.json();
  renderClips();
  connectSSE();
}

init();

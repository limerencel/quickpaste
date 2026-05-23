// app.js — QuickPaste main client logic
// Handles: auth check, clip rendering, SSE real-time sync, share links, copy

// ── State ─────────────────────────────────────────────────────────────────────
let clips = [];
let sseSource = null;
let sseRetryTimer = null;

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
  el.textContent = msg;
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
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return new Date(iso).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
        <p>还没有内容<br/>在上方粘贴你想同步的文本或链接</p>
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
}

function renderClipCard(clip) {
  const shared = clip.share_id
    ? `<span class="share-badge visible" title="已分享">🔗 已分享</span>`
    : `<span class="share-badge"></span>`;

  const shareBtn = clip.share_id
    ? `<button class="btn-icon danger" data-unshare="${clip.id}" title="取消分享" aria-label="取消分享">🔗</button>`
    : `<button class="btn-icon" data-share="${clip.id}" title="生成分享链接" aria-label="分享">
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
        <button class="btn-icon" data-copy="${escAttr(clip.content)}" title="复制" aria-label="复制内容">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
        ${shareBtn}
        <button class="btn-icon danger" data-delete="${clip.id}" title="删除" aria-label="删除此条">
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
  toast('已复制到剪贴板', 'success');
  setTimeout(() => { btn.innerHTML = originalHTML; btn.classList.remove('success'); }, 1500);
}

// ── Send clip ─────────────────────────────────────────────────────────────────
async function sendClip() {
  const content = clipInput.value.trim();
  if (!content) return;

  sendBtn.disabled = true;
  sendBtn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px"></div>`;

  try {
    const res = await api('POST', '/api/clips', { content });
    if (!res) return;
    if (!res.ok) {
      const data = await res.json();
      toast(data.error || '发送失败', 'error');
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
    toast('已发送', 'success');
  } catch {
    toast('网络错误', 'error');
  } finally {
    sendBtn.disabled = false;
    sendBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> 发送`;
  }
}

// ── Delete clip ───────────────────────────────────────────────────────────────
async function deleteClip(clipId) {
  const res = await api('DELETE', `/api/clips/${clipId}`);
  if (!res) return;
  if (!res.ok) { toast('删除失败', 'error'); return; }

  clips = clips.filter(c => c.id !== clipId);
  // Animate removal
  const card = clipsList.querySelector(`[data-id="${clipId}"]`);
  if (card) {
    card.style.transition = 'opacity 0.15s, transform 0.15s';
    card.style.opacity = '0';
    card.style.transform = 'translateX(8px)';
    setTimeout(() => renderClips(), 160);
  } else {
    renderClips();
  }
}

// ── Share clip ────────────────────────────────────────────────────────────────
async function shareClip(clipId, btn) {
  btn.innerHTML = `<div class="spinner" style="width:12px;height:12px;border-width:2px"></div>`;
  btn.disabled = true;

  try {
    const res = await api('POST', `/api/share/${clipId}`);
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { toast(data.error || '分享失败', 'error'); return; }

    // Update local clip
    const clip = clips.find(c => c.id === clipId);
    if (clip) clip.share_id = data.shareId;
    renderClips();

    // Copy share URL to clipboard
    const shareUrl = `${location.origin}/s/${data.shareId}`;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    toast('分享链接已复制 🔗', 'success');
  } finally {
    btn.disabled = false;
  }
}

// ── Unshare clip ──────────────────────────────────────────────────────────────
async function unshareClip(clipId) {
  const res = await api('DELETE', `/api/share/${clipId}`);
  if (!res) return;
  if (!res.ok) { toast('操作失败', 'error'); return; }

  const clip = clips.find(c => c.id === clipId);
  if (clip) clip.share_id = null;
  renderClips();
  toast('已取消分享');
}

// ── Load clips ────────────────────────────────────────────────────────────────
async function loadClips() {
  try {
    const res = await api('GET', '/api/clips');
    if (!res) return;
    clips = await res.json();
    renderClips();
  } catch {
    clipsList.innerHTML = `<div class="empty-state"><p style="color:var(--red)">加载失败，请刷新页面</p></div>`;
  }
}

// ── SSE connection ────────────────────────────────────────────────────────────
function connectSSE() {
  if (sseSource) sseSource.close();

  sseSource = new EventSource('/api/sse', { withCredentials: true });

  sseSource.onopen = () => {
    statusDot.className = 'status-dot connected';
    statusDot.title = '已连接（实时同步中）';
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
    statusDot.title = '连接断开，重连中…';
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
  clipInput.style.height = Math.min(clipInput.scrollHeight, 240) + 'px';
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

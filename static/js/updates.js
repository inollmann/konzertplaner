// ══════════════════════════════════════════════════════════════════════
// updates.js — daily check for a new commit on the GitHub repo
//
// On the first page load of each day (per browser) the frontend asks
// `/api/repo-update` for the latest commit on the repo's main branch.
// If the running app is behind, a transient toast appears top-right
// for 5 s and the info is recorded as a local (non-synced) notification
// so it shows up in the bell menu. The check runs at most once per day
// (guarded by `kp-update-check` in localStorage).
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc } from './utils.js';
import { icon } from './icons.js';
import { saveUpdateNotifs, updateNotifBadge } from './notifications.js';

const LS_KEY = 'kp-update-check';

/**
 * Once per calendar day (per browser), fetch the repo's latest commit
 * and show a toast + bell notification when a newer commit than the
 * running app exists. Idempotent within the same day.
 */
export async function checkForUpdate() {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) {}
  const today = new Date().toISOString().slice(0, 10);
  if (seen.date === today) return;
  let data;
  try {
    const r = await fetch('/api/repo-update');
    data = await r.json();
  } catch (e) { return; }
  if (!data || data.error || !data.latest) {
    localStorage.setItem(LS_KEY, JSON.stringify({ date: today, notified_sha: seen.notified_sha }));
    return;
  }
  const ref = data.current_sha ?? seen.notified_sha;
  if (ref === undefined) {
    localStorage.setItem(LS_KEY, JSON.stringify({ date: today, notified_sha: data.latest.sha }));
    return;
  }
  const upToDate = data.current_sha
    ? data.latest.sha === data.current_sha
    : data.latest.sha === seen.notified_sha;
  if (upToDate) {
    localStorage.setItem(LS_KEY, JSON.stringify({ date: today, notified_sha: data.current_sha ?? data.latest.sha }));
    return;
  }
  if (data.latest.sha === seen.notified_sha) {
    localStorage.setItem(LS_KEY, JSON.stringify({ date: today, notified_sha: seen.notified_sha }));
    return;
  }
  showUpdateToast(data.latest);
  addUpdateNotif(data.latest);
  localStorage.setItem(LS_KEY, JSON.stringify({ date: today, notified_sha: data.latest.sha }));
}

let _toastTimer = null;

/**
 * Show a transient "update available" toast in the top-right corner for
 * 5 s. Clicking anywhere on the toast dismisses it early.
 * @param {{sha:string, short_sha:string, message:string, url:string}} info
 */
function showUpdateToast(info) {
  let el = document.getElementById('update-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'update-toast';
    el.className = 'update-toast';
    document.body.appendChild(el);
    el.addEventListener('click', () => {
      el.classList.remove('visible');
      if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
    });
  }
  el.innerHTML = `
    <div class="update-toast-icon">${icon('download')}</div>
    <div class="update-toast-body">
      <div class="update-toast-title">Update verfügbar</div>
      <div class="update-toast-sub">${esc(info.short_sha)} · ${esc(info.message)}</div>
    </div>
    <a class="update-toast-link" href="${esc(info.url)}" target="_blank" rel="noopener" title="Commit ansehen">${icon('arrow-up-right')}</a>`;
  el.classList.add('visible');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.classList.remove('visible');
    _toastTimer = null;
  }, 5000);
}

/**
 * Record an update notification (replacing any existing one) in the local
 * `state.updateNotifs` array and refresh the bell badge.
 * @param {{sha:string, short_sha:string, message:string, url:string, author:string, date:string}} info
 */
function addUpdateNotif(info) {
  state.updateNotifs = state.updateNotifs.filter(n => n.id !== `update-${info.sha}`);
  state.updateNotifs.unshift({
    id: `update-${info.sha}`,
    type: 'update',
    title: 'Update verfügbar',
    message: info.message,
    sha: info.sha,
    short_sha: info.short_sha,
    author: info.author,
    date: info.date,
    link: info.url,
    read: false,
    ts: Date.now(),
  });
  saveUpdateNotifs();
  updateNotifBadge();
}

// ══════════════════════════════════════════════════════════════════════
// main.js — boot + orchestration
//
// This is the single entry point referenced by index.html
// (`<script type="module" src="/static/js/main.js">`). It:
//   1. Applies persisted theme/colors/custom CSS.
//   2. Imports globals.js so inline onclick handlers resolve.
//   3. Fetches the initial data and renders the default tab.
//   4. Wires cross-module re-render events (filterchange, tabchange,
//      ratingchange, showsfilterchange) so feature modules don't need
//      to import each other's render functions (no cycles).
//   5. Registers global keydown/click handlers.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { loadTheme, applyCustomCss } from './theme.js';
import { fetchAll } from './api.js';
import { renderList } from './list.js';
import { renderCalendar } from './calendar.js';
import { initTimeline, renderTimeline, timelineToday } from './timeline.js';
import { initMap, resetMap } from './map.js';
import { renderShows } from './shows.js';
import { renderFavourites } from './favourites.js';
import { updateNotifBadge, checkFavArtistEvents, startFavPolling } from './notifications.js';
import { updateAllFilterVisuals } from './filters.js';
import './globals.js';

// ── Boot: theme + initial load ──────────────────────────────────────────
loadTheme();
applyCustomCss();

async function boot() {
  await fetchAll();
  renderList();
  renderCalendar();
  initTimeline();
  renderTimeline();
}

boot();

// ── Background polling for favourite-artist events ─────────────────────
setTimeout(() => { checkFavArtistEvents(); startFavPolling(); }, 5000);
updateNotifBadge();

// ── Cross-module re-render orchestration ───────────────────────────────
// Feature modules dispatch these events instead of calling render
// functions directly, to avoid circular imports.

window.addEventListener('tabchange', (/** @type {CustomEvent} */ e) => {
  const tab = e.detail;
  if (tab === 'list' || tab === 'calendar') {
    state.dateFilter = 'both';
    state.eventTypeFilter = 'both';
    state.activeFilters.clear();
    updateAllFilterVisuals();
  } else if (tab === 'map') {
    state.dateFilter = 'past';
    state.eventTypeFilter = 'both';
    state.activeFilters.clear();
    state.activeFilters.add('tickets');
    updateAllFilterVisuals();
  }
  switch (tab) {
    case 'list':      renderList(); break;
    case 'calendar': renderCalendar(); renderTimeline(); timelineToday(); break;
    case 'map':       setTimeout(() => { initMap(); }, 100); break;
    case 'shows':     renderShows(); break;
    case 'favourites': renderFavourites(); break;
  }
});

window.addEventListener('filterchange', () => {
  renderList();
  renderCalendar();
  renderTimeline();
  if (state.currentTab === 'map') resetMap();
});

window.addEventListener('listviewchange', () => {
  renderList();
});

window.addEventListener('datachange', () => {
  renderList();
  renderCalendar();
  renderTimeline();
  if (state.currentTab === 'shows') renderShows();
  const bd = document.getElementById('detail-bd');
  if (bd && bd.classList.contains('open') && state.openDetailId) {
    const ev = state.allEvents.find(x => x.id === state.openDetailId);
    if (ev) document.getElementById('detail-panel').innerHTML = window.buildDetailHTML(ev);
  }
});

window.addEventListener('showsfilterchange', () => {
  renderShows();
});

window.addEventListener('ratingchange', (/** @type {CustomEvent} */ e) => {
  const { eventId } = e.detail || {};
  const bd = document.getElementById('detail-bd');
  if (bd && bd.classList.contains('open') && eventId) {
    const ev = state.allEvents.find(x => x.id === eventId);
    if (ev && typeof window.buildDetailHTML === 'function') {
      document.getElementById('detail-panel').innerHTML = window.buildDetailHTML(ev);
    }
  }
  renderList();
  if (state.currentTab === 'shows') renderShows();
});

// ── Global keydown: Escape closes everything ──────────────────────────
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  window.closeLightbox?.();
  window.closeDetail?.();
  window.hidePopover?.();
  window.hideHistogramTooltip?.();
  ['event-modal', 'artist-modal', 'artist-detail-modal', 'venue-modal',
   'design-modal', 'export-modal', 'eventim-concerts-modal', 'add-fav-modal',
   'notif-event-modal', 'stats-modal', 'backup-modal', 'location-modal',
   'alert-dialog', 'confirm-dialog',
  ].forEach(id => window.closeModal?.(id));
  window.closeSearchPanel?.();
  const np = document.getElementById('notif-panel');
  if (np) np.classList.remove('open');
  window.closeDrawer?.();
});

// ── Global click: close panels on outside click ───────────────────────
document.addEventListener('click', e => {
  const panel = document.getElementById('eventim-tours-panel');
  const input = document.getElementById('eventim-search');
  if (panel && panel.classList.contains('open') &&
      !panel.contains(e.target) && e.target !== input) {
    window.closeSearchPanel?.();
  }
  const notifPanel = document.getElementById('notif-panel');
  const notifBtn = document.getElementById('notif-btn');
  if (notifPanel && notifPanel.classList.contains('open') &&
      !notifPanel.contains(e.target) && notifBtn && !notifBtn.contains(e.target)) {
    notifPanel.classList.remove('open');
  }
  // Dismiss popover on outside click (focus-driven popovers hide on blur,
  // but mouse-hover popovers need a click dismiss path).
  const popover = document.getElementById('popover');
  if (popover && popover.classList.contains('vis') && !popover.contains(e.target)) {
    window.hidePopover?.();
  }
  // Dismiss histogram tooltip on outside click (click-to-show tooltips).
  const histTooltip = document.getElementById('histogram-tooltip');
  if (histTooltip && histTooltip.style.display === 'block' &&
      !e.target.closest('[data-hist-key]')) {
    window.hideHistogramTooltip?.();
  }
});

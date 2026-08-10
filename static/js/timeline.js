// ══════════════════════════════════════════════════════════════════════
// timeline.js — epoch-based virtualized horizontal timeline
//
// Time is mapped onto a fixed pixel origin (TL_EPOCH = 2000-01-01), so a
// scroll position is a date and vice-versa. Only the visible window
// (± TL_BUFFER_PX) is rendered; scrolling re-renders via requestAnimationFrame
// (rAF). The centered date (tlCenterDate) is preserved across zoom and
// scroll, and the track spans the whole epoch range so the timeline stays
// draggable everywhere. Events share a single row; overlapping events are
// split into side-by-side columns (each bar narrowed to 1/k of its span
// within its overlap group).
//
// `openDetail` is not imported — it lives in list.js and is reached via an
// inline `onclick` attribute (resolved against the global scope) to avoid a
// circular dependency. The popover helpers are imported from ui.js (no
// cycle, since ui.js imports neither timeline nor list).
//
// Exported surface (everything else is module-private):
//   initTimeline / renderTimeline            — called from main.js
//   tlSetZoom / timelineNav / timelineNavEvent / timelineToday — index.html
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc } from './utils.js';
import { eventVisible } from './filters.js';
import { showPopover, hidePopover } from './ui.js';

const TL_EPOCH = new Date(2000, 0, 1).getTime();      // fixed pixel origin (ms)
const TL_EPOCH_END = new Date(2100, 0, 1).getTime();  // track right edge (ms)
const TL_MS_PER_DAY = 86400000;
const TL_BUFFER_PX = 400;                             // virtualization buffer
const TL_MONTHS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const TL_ZOOM_LEVELS = [
  { label: '1 Jahr',   days: 365 },
  { label: '6 Monate', days: 182 },
  { label: '3 Monate', days: 91  },
  { label: '1 Monat',  days: 30  },
];
let tlZoom = 1;                // default 6 Monate
let tlCenterDate = new Date(); // date at viewport center
let tlSuppressScroll = false;
let tlRafPending = false;

// pixel helpers ---------------------------------------------------------
/** Convert a Date to its pixel x on the track (relative to TL_EPOCH). */
function tlDateToX(d) { return (d.getTime() - TL_EPOCH) / TL_MS_PER_DAY * tlDayWidth(); }

/** Convert a track pixel x back to a Date. */
function tlXToDate(x) { return new Date(TL_EPOCH + (x / tlDayWidth()) * TL_MS_PER_DAY); }

/** Pixels per day at the current zoom level (viewport width / visible days). */
function tlDayWidth() {
  const viewport = document.getElementById('timeline-viewport');
  const vw = viewport?.offsetWidth || 800;
  return vw / TL_ZOOM_LEVELS[tlZoom].days;
}

/** Return a new Date snapped to local midnight. */
function tlMidnight(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

/**
 * Wire up the timeline viewport once after DOM ready: mouse/touch
 * drag-to-scroll, click-on-axis to recenter, and a scroll listener that keeps
 * `tlCenterDate` in sync and triggers a virtualized re-render debounced via
 * rAF. Drag detection (≥4px) suppresses the recenter click after a drag.
 */
export function initTimeline() {
  const viewport = document.getElementById('timeline-viewport');
  if (!viewport) return;
  let isDown = false, startX, scrollLeft, moved = false;

  const onDown = (px) => { isDown = true; moved = false; viewport.classList.add('active'); startX = px; scrollLeft = viewport.scrollLeft; };
  const onMove = (px) => { if (!isDown) return; const walk = px - startX; if (Math.abs(walk) > 4) moved = true; viewport.scrollLeft = scrollLeft - walk; };
  const onUp = () => { isDown = false; viewport.classList.remove('active'); };

  viewport.addEventListener('mousedown', e => { e.preventDefault(); onDown(e.pageX); });
  viewport.addEventListener('mousemove', e => { if (isDown) e.preventDefault(); onMove(e.pageX); });
  window.addEventListener('mouseup', onUp);
  viewport.addEventListener('mouseleave', onUp);
  viewport.addEventListener('touchstart', e => onDown(e.touches[0].pageX), { passive: true });
  viewport.addEventListener('touchmove', e => onMove(e.touches[0].pageX), { passive: true });
  viewport.addEventListener('touchend', onUp);

  // click on a date axis area: jump so that date lands at viewport center
  viewport.addEventListener('click', e => {
    if (moved) { moved = false; return; } // ignore drags
    if (e.target.closest('.timeline-event')) return; // events open detail
    const rect = viewport.getBoundingClientRect();
    const x = e.pageX - rect.left + viewport.scrollLeft;
    tlCenterDate = tlMidnight(tlXToDate(x));
    renderTimeline();
  });

  // sync tlCenterDate while dragging/scrolling (position memory)
  viewport.addEventListener('scroll', () => {
    if (tlSuppressScroll) return;
    const vw = viewport.offsetWidth;
    tlCenterDate = tlMidnight(tlXToDate(viewport.scrollLeft + vw / 2));
    if (tlRafPending) return;
    tlRafPending = true;
    requestAnimationFrame(() => { tlRafPending = false; renderTimeline(); });
  });
}

/** Zoom in/out by `direction` steps (kept for parity; buttons call tlSetZoom directly). */
function timelineZoom(direction) {
  tlSetZoom(tlZoom + direction);
}

/**
 * Set the zoom level (clamped to `0..TL_ZOOM_LEVELS.length-1`), update the
 * zoom label and segmented control, then preserve the centered date by
 * recomputing `scrollLeft` from `tlCenterDate`. No-op when the level is
 * already current. Bound to the zoom segmented control buttons.
 * @param {number} level zoom index into TL_ZOOM_LEVELS
 */
export function tlSetZoom(level) {
  const next = Math.max(0, Math.min(TL_ZOOM_LEVELS.length - 1, level));
  if (next === tlZoom) return;
  tlZoom = next;
  const lbl = document.getElementById('timeline-zoom-label');
  if (lbl) lbl.textContent = TL_ZOOM_LEVELS[tlZoom].label;
  document.querySelectorAll('#timeline-zoom-seg button').forEach(b => {
    b.classList.toggle('sel', Number(b.dataset.z) === tlZoom);
  });
  // preserve the centered date across zoom: same date, recompute scrollLeft
  const viewport = document.getElementById('timeline-viewport');
  if (viewport) {
    const vw = viewport.offsetWidth || 800;
    const centerX = tlDateToX(tlCenterDate);
    tlSuppressScroll = true;
    viewport.scrollLeft = Math.max(0, centerX - vw / 2);
    renderTimeline();
    requestAnimationFrame(() => { tlSuppressScroll = false; });
  } else {
    renderTimeline();
  }
}

/**
 * Nudge the centered date by `months * 30` days (approximate) and re-render.
 * Bound to the ‹ / › timeline buttons.
 * @param {number} months signed months to move (positive = forward)
 */
export function timelineNav(months) {
  const days = Math.round(months * 30);
  tlCenterDate = tlMidnight(new Date(tlCenterDate.getTime() + days * TL_MS_PER_DAY));
  renderTimeline();
}

/**
 * Jump to today: scroll so today sits at 10% from the left, sync
 * `tlCenterDate` to the new viewport center, and re-render. Bound to the
 * "Heute" button.
 */
export function timelineToday() {
  const viewport = document.getElementById('timeline-viewport');
  if (!viewport) return;
  const vw = viewport.offsetWidth || 800;
  const dw = tlDayWidth();
  const todayX = tlDateToX(tlMidnight(new Date()));
  tlSuppressScroll = true;
  viewport.scrollLeft = todayX - vw * 0.1;
  tlCenterDate = tlMidnight(tlXToDate(viewport.scrollLeft + vw / 2));
  renderTimeline();
  requestAnimationFrame(() => { tlSuppressScroll = false; });
}

/**
 * Jump to the next (`direction` = 1) or previous (`direction` = -1) visible
 * event relative to the current center date, scrolling it to ~40% from the
 * left edge. No-op when there are no visible events. Bound to the ‹‹ / ››
 * buttons.
 * @param {number} direction 1 = next, -1 = previous
 */
export function timelineNavEvent(direction) {
  const viewport = document.getElementById('timeline-viewport');
  if (!viewport || !state.allEvents.length) return;

  const refs = [];
  state.allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      refs.push({ date: new Date(ev.date), ev });
    } else {
      (ev.concerts || []).forEach(c => refs.push({ date: new Date(c.date), ev, c }));
    }
  });
  refs.sort((a, b) => a.date - b.date);
  if (!refs.length) return;

  const center = tlCenterDate.getTime();
  let target;
  if (direction === 1) {
    target = refs.find(r => r.date.getTime() > center) || refs[refs.length - 1];
  } else {
    target = [...refs].reverse().find(r => r.date.getTime() < center) || refs[0];
  }
  tlCenterDate = tlMidnight(target.date);
  const vw = viewport.offsetWidth;
  const dw = tlDayWidth();
  const todayX = tlDateToX(target.date);
  tlSuppressScroll = true;
  viewport.scrollLeft = todayX - vw * 0.4; // center the event ~40% from left
  renderTimeline();
  requestAnimationFrame(() => { tlSuppressScroll = false; });
}

/**
 * Render the visible window of the timeline: month/day axis ticks, the
 * "HEUTE" (today) line, and the event bars. Only events intersecting the
 * buffered viewport `[vL, vR]` are rendered (virtualization). Events share a
 * single row; overlapping events are partitioned into the lowest free
 * column, and each overlap group narrows its bars to `1/k` of their time
 * span. Logos render at zoom ≥ 1, otherwise events show vertical text.
 */
export function renderTimeline() {
  const axis = document.getElementById('timeline-axis');
  const eventsContainer = document.getElementById('timeline-events');
  const track = document.getElementById('timeline-track');
  const viewport = document.getElementById('timeline-viewport');
  if (!axis || !eventsContainer || !track || !viewport) return;

  const dw = tlDayWidth();
  const vw = viewport.offsetWidth || 800;
  // clamp scrollLeft to epoch range so the timeline stays draggable everywhere
  const maxScroll = (TL_EPOCH_END - TL_EPOCH) / TL_MS_PER_DAY * dw - vw;
  if (viewport.scrollLeft > maxScroll) viewport.scrollLeft = Math.max(0, maxScroll);
  if (viewport.scrollLeft < 0) viewport.scrollLeft = 0;

  const leftPx = viewport.scrollLeft;
  const rightPx = leftPx + vw;
  const vL = leftPx - TL_BUFFER_PX;
  const vR = rightPx + TL_BUFFER_PX;
  const from = tlXToDate(Math.max(0, vL));
  const to = tlXToDate(Math.min((TL_EPOCH_END - TL_EPOCH) / TL_MS_PER_DAY * dw, vR));

  // track width = full epoch range (infinite feel within fixed bounds)
  track.style.width = ((TL_EPOCH_END - TL_EPOCH) / TL_MS_PER_DAY * dw) + 'px';
  axis.innerHTML = '';
  eventsContainer.innerHTML = '';

  // month + day ticks (only within [vL, vR])
  const showDays = TL_ZOOM_LEVELS[tlZoom].days <= 182; // 6 Monate and below
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  cursor.setDate(1);
  if (cursor.getTime() < from.getTime()) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() <= to.getTime()) {
    const x = tlDateToX(cursor);
    if (x >= vL && x <= vR) {
      const marker = document.createElement('div');
      marker.className = 'timeline-month-marker';
      marker.style.left = x + 'px';
      marker.innerHTML = `<span class="timeline-month-label">${TL_MONTHS[cursor.getMonth()]} '${String(cursor.getFullYear()).slice(2)}</span>`;
      axis.appendChild(marker);
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }
  if (showDays) {
    const d = new Date(from); d.setHours(0, 0, 0, 0);
    while (d.getTime() <= to.getTime()) {
      const x = tlDateToX(d);
      if (x >= vL && x <= vR) {
        const tick = document.createElement('div');
        tick.className = 'timeline-day-tick';
        tick.style.left = x + 'px';
        if (d.getDay() === 1 || d.getDate() === 1) {
          tick.innerHTML = `<span class="timeline-day-label">${d.getDate()}</span>`;
        }
        axis.appendChild(tick);
      }
      d.setDate(d.getDate() + 1);
    }
  }

  // today line
  const today = tlMidnight(new Date());
  const todayX = tlDateToX(today);
  if (todayX >= vL && todayX <= vR) {
    const tl = document.createElement('div');
    tl.className = 'timeline-today-line';
    tl.style.left = todayX + 'px';
    tl.innerHTML = '<span class="timeline-today-label">HEUTE</span>';
    eventsContainer.appendChild(tl);
  }

  // collect visible event entries
  const entries = [];
  state.allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      entries.push({
        iso: ev.date, end_iso: ev.end_date || ev.date,
        label: ev.name, type: 'festival',
        tags: ev.tags || [], id: ev.id, poster: ev.poster || null,
        logo: ev.logo || null,
      });
    } else {
      (ev.concerts || []).forEach(c => {
        const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        entries.push({
          iso: c.date, end_iso: c.end_date || c.date,
          label: artistLabel, type: 'tour',
          tags: c.tags || [], data: c, id: ev.id, poster: ev.poster || null,
          artist: ev.artist || [],
        });
      });
    }
  });
  entries.sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());

  // Single-row layout: overlapping events split into side-by-side columns.
  // 1. collect visible entries with their pixel span.
  // 2. assign each to the lowest free column using interval partitioning.
  // 3. group overlapping events so each knows the total column count in its
  //    overlap group — its bar is then narrowed to 1/k of its time span.
  const placed = [];
  for (const e of entries) {
    const sMs = new Date(e.iso).getTime();
    const eMs = new Date(e.end_iso).getTime();
    if (eMs < from.getTime() || sMs > to.getTime()) continue; // outside view
    const startX = tlDateToX(new Date(sMs));
    const endX = tlDateToX(new Date(eMs)) + dw; // inclusive end day
    placed.push({ e, sMs, eMs: eMs + TL_MS_PER_DAY, startX, endX, span: Math.max(dw, endX - startX) });
  }
  placed.sort((a, b) => a.sMs - b.sMs || a.eMs - b.eMs);

  // column assignment + overlap-group sizing
  const cols = []; // cols[c] = end-ms of the last event placed in column c
  let groupEnd = -Infinity;     // end-ms of the current overlap group
  let groupMaxCols = 0;         // max columns used in the current group
  let groupStart = 0;           // index where the current group began
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    // start a new overlap group when this event doesn't overlap any active one
    if (p.sMs >= groupEnd) {
      // finalize the previous group: stamp its members with groupMaxCols
      for (let j = groupStart; j < i; j++) placed[j].groupCols = groupMaxCols;
      groupEnd = -Infinity;
      groupMaxCols = 0;
      groupStart = i;
      cols.length = 0;
    }
    // assign lowest free column (one whose last event ended before this starts)
    let c = 0;
    while (c < cols.length && cols[c] > p.sMs) c++;
    cols[c] = p.eMs;
    p.col = c;
    groupMaxCols = Math.max(groupMaxCols, c + 1);
    groupEnd = Math.max(groupEnd, p.eMs);
  }
  // finalize the trailing group
  for (let j = groupStart; j < placed.length; j++) placed[j].groupCols = groupMaxCols;

  // rendering flags: logos at 6 M / 3 M / 1 M, vertical text at 1 Jahr
  const showLogos = tlZoom >= 1;
  const barH = eventsContainer.clientHeight || 172; // events area = viewport 200 − axis 28

  for (const p of placed) {
    const e = p.e;
    const k = p.groupCols;            // total columns in this overlap group
    const colW = k > 1 ? p.span / k : p.span;
    const left = k > 1 ? p.startX + p.col * colW : p.startX;
    const width = k > 1 ? colW : p.span;
    const logoSize = Math.min(width, barH); // logos sized to event width, capped by bar height

    const el = document.createElement('button');
    let cls = 'unstyled timeline-event ' + e.type;
    if (e.tags?.includes('tickets')) cls += ' has-tickets';
    if (e.tags?.includes('watchlist')) cls += ' has-watch';
    el.className = cls;
    el.type = 'button';
    el.style.left = left + 'px';
    el.style.width = width + 'px';
    el.style.top = '0px';
    el.style.height = '100%';         // single row: fill the whole timeline height

    if (showLogos) {
      if (e.type === 'festival') {
        if (e.logo) {
          el.innerHTML = `<img src="/api/img/${e.logo}" alt="${esc(e.label)}" style="width:${logoSize}px;height:${logoSize}px;object-fit:contain;border-radius:4px;padding:2px;">`;
        } else if (e.poster) {
          el.innerHTML = `<img src="/api/img/${e.poster}" alt="${esc(e.label)}" style="width:${logoSize}px;height:${logoSize}px;object-fit:cover;border-radius:4px;">`;
        } else {
          el.textContent = e.label;
        }
      } else {
        const headliner = e.artist || e.data?.artist || e.label;
        const hl = Array.isArray(headliner) ? headliner : (headliner ? [headliner] : []);
        const sup = e.data?.support_present || [];
        const acts = [...hl, ...sup].filter(a => typeof a === 'string');
        const uniq = [...new Set(acts.map(a => a.toLowerCase()))].map(lc => acts.find(a => a.toLowerCase() === lc));
        const imgs = [];
        for (const name of uniq) {
          const a = state.artists.find(ar => ar.name.toLowerCase() === name.toLowerCase());
          if (a && a.logo) imgs.push(`<img src="/api/img/${a.logo}" alt="${esc(name)}" style="height:${logoSize}px;width:${logoSize}px;border-radius:50%;object-fit:cover;border:1px solid var(--bg);flex-shrink:0;">`);
        }
        el.innerHTML = imgs.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:3px;align-items:center;justify-content:center;width:100%;height:100%;">${imgs.join('')}</div>`
          : `<div class="timeline-event-vertical">${esc(e.label)}</div>`;
      }
    } else {
      el.innerHTML = `<div class="timeline-event-vertical">${esc(e.label)}</div>`;
    }
    el.title = e.label + '\n' + e.iso + (e.end_iso !== e.iso ? ' – ' + e.end_iso : '');
    el.setAttribute('aria-label', e.label + ', ' + e.iso + (e.end_iso !== e.iso ? ' – ' + e.end_iso : ''));

    const dateLabel = document.createElement('div');
    dateLabel.className = 'timeline-event-date';
    const dp = e.iso.split('-');
    dateLabel.textContent = dp[2] + '.' + dp[1] + '.';
    el.appendChild(dateLabel);

    const eventId = e.id;
    el.addEventListener('click', ev => { ev.stopPropagation(); window.openDetail?.(eventId); });
    if (e.data) {
      el.addEventListener('mouseenter', evt => showPopover(evt, e.data));
      el.addEventListener('mouseleave', hidePopover);
      el.addEventListener('focus', evt => showPopover(evt, e.data));
      el.addEventListener('blur', hidePopover);
    }
    eventsContainer.appendChild(el);
  }
}

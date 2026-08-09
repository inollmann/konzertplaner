// ══════════════════════════════════════════════════════════════════════
// ratings.js — per-event act ratings (1–10) and rendering helpers
//
// Ratings live in `state.ratings` (persisted to localStorage under
// `kp-ratings`) as `ratings[eventId][actName] = 1..10 | null`. Mutations
// go through `setRating`/`resetRating`, which dispatch a `ratingchange`
// CustomEvent on `window` so the UI layer (main.js) can re-render the
// affected views. `refreshAfterRating` is kept as a thin wrapper that
// dispatches the same event, so legacy inline callers keep working via
// the window globals.
// ══════════════════════════════════════════════════════════════════════

import { state, getEvent } from './state.js';
import { esc, localIso, eventLatestDate, fmtDateShort, pipColor } from './utils.js';
import { icon } from './icons.js';
import { saveKv } from './api.js';

/** Persist `state.ratings` to localStorage (instant UI cache) and push to
 *  the server KV store (debounced) so ratings sync across devices. */
export function saveRatings() {
  localStorage.setItem('kp-ratings', JSON.stringify(state.ratings));
  saveKv('ratings', state.ratings);
}

/**
 * Read the stored rating for `act` on event `eventId`, or `null` if unset.
 * @param {string} eventId
 * @param {string} act
 * @returns {number|null}
 */
export function getRating(eventId, act) {
  return state.ratings[eventId]?.[act] ?? null;
}

/**
 * Store `val` as the rating for `act` on event `eventId`, persist it, and
 * notify the UI via the `ratingchange` CustomEvent.
 * @param {string} eventId
 * @param {string} act
 * @param {number} val
 */
export function setRating(eventId, act, val) {
  if (!state.ratings[eventId]) state.ratings[eventId] = {};
  state.ratings[eventId][act] = val;
  saveRatings();
  refreshAfterRating(eventId);
}

/**
 * Clear the rating for `act` on event `eventId`, persist, and notify the
 * UI via the `ratingchange` CustomEvent.
 * @param {string} eventId
 * @param {string} act
 */
export function resetRating(eventId, act) {
  if (state.ratings[eventId]) delete state.ratings[eventId][act];
  saveRatings();
  refreshAfterRating(eventId);
}

/**
 * Notify the UI that ratings for `eventId` changed. Dispatches a
 * `ratingchange` CustomEvent on `window` with `detail.eventId`; the
 * rendering layer is responsible for re-rendering the affected views.
 * @param {string} eventId
 */
export function refreshAfterRating(eventId) {
  window.dispatchEvent(new CustomEvent('ratingchange', { detail: { eventId } }));
}

/**
 * Build the HTML for a single act's rating bar (only rendered for past
 * events). The inline `onclick` handlers call the global `setRating` and
 * `resetRating`, exposed on `window` by globals.js.
 * @param {string} eventId
 * @param {string} actName
 * @param {boolean} isPast
 * @returns {string}
 */
export function ratingBarHtml(eventId, actName, isPast) {
  if (!isPast) return '';
  const val = getRating(eventId, actName);
  const pips = Array.from({length:10}, (_,i) => {
    const pos = i+1;
    const col = pipColor(val, pos);
    const style = col ? `background:${col};border-color:${col}` : '';
    return `<div class="rating-pip" style="${style}"
      onclick="event.stopPropagation();setRating('${eventId}','${actName.replace(/'/g,"\\'")}',${pos})"
      title="${pos}/10"></div>`;
  }).join('');
  const reset = val !== null
    ? `<button class="rating-reset" onclick="event.stopPropagation();resetRating('${eventId}','${actName.replace(/'/g,"\\'")}')" title="Zurücksetzen">${icon('x')}</button>`
    : '';
  return `<div class="rating-row">
    <span class="rating-label">${esc(actName)}</span>
    <div class="rating-bar">${pips}${reset}</div>
  </div>`;
}

/**
 * Render rating bars for a list of act names (detail / event-card view).
 * @param {string} eventId
 * @param {string[]} actNames
 * @returns {string}
 */
export function renderDetailRatings(eventId, actNames) {
  return actNames.map(a => ratingBarHtml(eventId, a, true)).join('');
}

/**
 * Build a compact summary of an artist's past-event ratings for the
 * catalogue view. Returns '' when the artist has no ratings.
 * @param {string} name
 * @returns {string}
 */
export function artistRatingsSummary(name) {
  const entries = [];
  const todayIso = localIso(new Date());
  state.allEvents.forEach(ev => {
    const latest = eventLatestDate(ev);
    if (!latest || latest >= todayIso) return;
    if (ev.event_type === 'tour') {
      ev.concerts.forEach(c => {
        const allActs = [c.artist, ...(c.support_present||[])];
        if (allActs.some(a => a && a.toLowerCase() === name.toLowerCase())) {
          const r = getRating(ev.id, name);
          const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
          if (r !== null) entries.push({ label: `${esc(artistLabel)} · ${fmtDateShort(c.date)}`, rating: r });
        }
      });
    } else if (ev.event_type === 'festival') {
      if ((ev.bands_to_watch||[]).some(b => b.toLowerCase() === name.toLowerCase())) {
        const r = getRating(ev.id, name);
        if (r !== null) entries.push({ label: `${esc(ev.name)} · ${fmtDateShort(ev.date)}`, rating: r });
      }
    }
  });
  if (!entries.length) return '';
  return entries.map(e => {
    const pips = Array.from({length:10}, (_,i) => {
      const pos = i+1;
      const col = pipColor(e.rating, pos);
      const style = col ? `background:${col};border-color:${col}` : '';
      return `<div class="rating-pip" style="${style};width:14px;height:7px;cursor:default"></div>`;
    }).join('');
    const col = pipColor(e.rating, e.rating);
    return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px">
      <span style="color:var(--muted);min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.label}</span>
      <div style="display:flex;gap:2px;flex-shrink:0">${pips}</div>
      <strong style="color:${col};width:28px;text-align:right;flex-shrink:0">${e.rating}/10</strong>
    </div>`;
  }).join('');
}

/**
 * Build the ratings block for the artist detail popup, listing each past
 * appearance with its rating. Returns '' when the artist has no ratings.
 * @param {string} name
 * @returns {string}
 */
export function artistDetailRatingsHtml(name) {
  const entries = [];
  const todayIso = localIso(new Date());
  state.allEvents.forEach(ev => {
    const latest = eventLatestDate(ev);
    if (!latest || latest >= todayIso) return;
    if (ev.event_type === 'tour') {
      ev.concerts.forEach(c => {
        const allActs = [c.artist, ...(c.support_present||[])];
        if (allActs.some(a => a && a.toLowerCase() === name.toLowerCase())) {
          const r = getRating(ev.id, name);
          const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
          if (r !== null) entries.push({ label: `${esc(artistLabel)} – ${fmtDateShort(c.date)}`, sublabel: esc(c.venue), rating: r });
        }
      });
    } else if (ev.event_type === 'festival') {
      if ((ev.bands_to_watch||[]).some(b => b.toLowerCase() === name.toLowerCase())) {
        const r = getRating(ev.id, name);
        if (r !== null) entries.push({ label: esc(ev.name), sublabel: fmtDateShort(ev.date), rating: r });
      }
    }
  });
  if (!entries.length) return '';
  const rows = entries.map(e => {
    const pips = Array.from({length:10}, (_,i) => {
      const pos = i+1;
      const col = pipColor(e.rating, pos);
      const style = col ? `background:${col};border-color:${col}` : '';
      return `<div class="rating-pip" style="${style};cursor:default"></div>`;
    }).join('');
    const col = pipColor(e.rating, e.rating);
    return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--text)">${e.label}</div>
        <div style="font-size:11px;color:var(--muted)">${e.sublabel}</div>
      </div>
      <div style="display:flex;gap:3px;flex-shrink:0">${pips}</div>
      <strong style="color:${col};width:32px;text-align:right;flex-shrink:0;font-size:13px">${e.rating}/10</strong>
    </div>`;
  }).join('');
  return `<div>
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Bewertungen</div>
    ${rows}
  </div>`;
}

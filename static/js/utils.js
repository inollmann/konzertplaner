// ══════════════════════════════════════════════════════════════════════
// utils.js — pure helpers with no DOM-state side effects
//
// Imported everywhere. Keep this module dependency-free so it can be the
// bottom of the import graph.
// ══════════════════════════════════════════════════════════════════════

import { icon } from './icons.js';

/** HTML-escape a value for safe interpolation into template strings. */
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** YYYY-MM-DD in the *local* timezone (avoids UTC offset shifting the date). */
export function localIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Parse an ISO date string into display parts.
 * Uses noon UTC-offset-agnostic local time so `2024-01-15` doesn't render
 * as the 14th in negative-offset timezones.
 * @param {string} iso
 * @returns {{day:number|string, month:string, year:number|string}}
 */
export function parseDate(iso) {
  if (!iso) return { day: '?', month: '???', year: '????' };
  const d = new Date(iso + 'T12:00:00');
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('de-DE', { month: 'short' }),
    year: d.getFullYear(),
  };
}

/** Short German date, e.g. `15. Jan`. */
export function fmtDateShort(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

/** Long German date, e.g. `15. Januar 2024`. */
export function fmtDateLong(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Format a price in German style: comma decimal, ` €` suffix.
 * Unified across the app (was previously split between no-comma and
 * German-comma variants — see DESIGN.md §9).
 * @param {number|string|null|undefined} p
 * @returns {string}
 */
export function fmtPrice(p) {
  if (p == null || p === '') return '';
  const n = Number(p);
  if (Number.isNaN(n)) return String(p);
  return n.toFixed(2).replace('.', ',') + ' €';
}

/** Trigger a browser download of a Blob. */
export function dlBlob(data, filename, mime) {
  const blob = new Blob([data], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Latest ISO date string for an event (end_date if present, else last
 * concert date). Empty string when no dates exist.
 */
export function eventLatestDate(ev) {
  if (ev.event_type === 'festival') return ev.end_date || ev.date || '';
  if (!ev.concerts || !ev.concerts.length) return '';
  return ev.concerts.reduce((max, c) => {
    const d = c.end_date || c.date || '';
    return d > max ? d : max;
  }, '');
}

/** Earliest ISO date string for an event (for sorting). */
export function eventEarliestDate(ev) {
  if (ev.event_type === 'festival') return ev.date || '';
  if (!ev.concerts || !ev.concerts.length) return '';
  return ev.concerts.reduce((min, c) => {
    const d = c.date || '';
    return (min === '' || d < min) ? d : min;
  }, '');
}

/**
 * Colour for a rating pip at position `pos` (1–10), given the total
 * rating `val`. Returns `null` for the empty pips above the rating.
 * Hue interpolates 0° (dark red) at rating 1 → 120° (dark green) at 10,
 * with fixed saturation/lightness so the scale stays readable on dark.
 */
export function pipColor(val, pos) {
  if (val === null || val === undefined || pos > val) return null;
  const t = (val - 1) / 9;
  const hue = Math.round(t * 120);
  return `hsl(${hue},70%,35%)`;
}

/**
 * Inline Google Maps embed for a venue. Includes +/- zoom controls that
 * swap the iframe `src` in place, and an "open in Maps" link.
 */
export function venueMapHtml(venue, city, zoom = 15) {
  if (!venue) return '';
  const query = encodeURIComponent(`${venue}, ${city || ''}`.replace(/,\s*$/, ''));
  const embedUrl = `https://maps.google.com/maps?q=${query}&t=&z=${zoom}&ie=UTF8&iwloc=&output=embed`;
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  return `<div class="venue-map" data-zoom="${zoom}" data-query="${query}">
    <iframe src="${embedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div class="venue-map-controls">
      <a class="venue-map-zoom" onclick="event.stopPropagation();var m=this.closest('.venue-map');var z=Math.max(3,parseInt(m.dataset.zoom)-1);m.dataset.zoom=z;m.querySelector('iframe').src='https://maps.google.com/maps?q='+m.dataset.query+'&t=&z='+z+'&ie=UTF8&iwloc=&output=embed'">− Zoom out</a>
      <a class="venue-map-zoom" onclick="event.stopPropagation();var m=this.closest('.venue-map');var z=Math.min(20,parseInt(m.dataset.zoom)+1);m.dataset.zoom=z;m.querySelector('iframe').src='https://maps.google.com/maps?q='+m.dataset.query+'&t=&z='+z+'&ie=UTF8&iwloc=&output=embed'">+ Zoom in</a>
      <a class="venue-map-link" href="${searchUrl}" target="_blank">In Google Maps öffnen ${icon('arrow-right')}</a>
    </div>
  </div>`;
}

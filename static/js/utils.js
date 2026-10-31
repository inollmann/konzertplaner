// ══════════════════════════════════════════════════════════════════════
// utils.js — pure helpers with no DOM-state side effects
//
// Imported everywhere. Keep this module dependency-free so it can be the
// bottom of the import graph.
// ══════════════════════════════════════════════════════════════════════

import { icon } from './icons.js';

/**
 * Great-circle distance between two `{lat, lon}` points in kilometres.
 * Pure, no DOM or network. Symmetric; 0 for identical points.
 * @param {{lat:number, lon:number}|null} a
 * @param {{lat:number, lon:number}|null} b
 * @returns {number} distance in km, or `Infinity` when either side is null
 */
export function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** HTML-escape a value for safe interpolation into template strings. */
export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Resolve which logo image UUID to display for an artist: the processed
 * monochrome variant takes priority over the original. Returns null when
 * the artist has no logo at all.
 * @param {any} a artist catalogue entry
 * @returns {string|null}
 */
export function artistLogoSrc(a) {
  return a.logo_mono || a.logo || null;
}

/**
 * CSS class for an artist logo `<img>`: `mono-logo` when the displayed
 * image is the processed white-on-transparent variant (so the light-mode
 * `filter: invert(1)` rule in style.css turns it black), empty string
 * otherwise.
 * @param {any} a artist catalogue entry
 * @returns {string}
 */
export function artistLogoClass(a) {
  return a.logo_mono ? 'mono-logo' : '';
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
 * @returns {{day:number|string, month:string, year:number|string, weekday:string}}
 */
export function parseDate(iso) {
  if (!iso) return { day: '?', month: '???', year: '????', weekday: '??' };
  const d = new Date(iso + 'T12:00:00');
  return {
    day: d.getDate(),
    month: d.toLocaleDateString('de-DE', { month: 'short' }),
    year: d.getFullYear(),
    weekday: d.toLocaleDateString('de-DE', { weekday: 'short' }),
  };
}

/**
 * Short German date, e.g. `15. Jan`; mit `weekday` z. B. `Fr., 14. Nov.`.
 * @param {string} iso
 * @param {{weekday?: boolean}} [opts]
 */
export function fmtDateShort(iso, { weekday = false } = {}) {
  if (!iso) return '';
  /** @type {Intl.DateTimeFormatOptions} */
  const o = weekday ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' };
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', o);
}

/**
 * Wählt Spaltenzahl und Kachelbreite für die Posterwand, sodass alle `n`
 * Kacheln möglichst ohne Scrollen in `height` passen (Kachelbreite in
 * `[min, max]`). Passt nichts, wird die maximale Spaltenzahl (w ≈ min) gewählt.
 * @param {number} width verfügbare Breite in px
 * @param {number} height verfügbare Höhe in px
 * @param {number} n Anzahl Kacheln
 * @param {number} gap Abstand in px
 * @param {{min?:number, max?:number, ratio?:number}} [opts] ratio = Höhe/Breite
 * @returns {{cols:number, tile:number}}
 */
export function wallLayout(width, height, n, gap, { min = 160, max = 420, ratio = 1.5 } = {}) {
  const maxCols = Math.max(1, Math.floor((width + gap) / (min + gap)));
  const tileFor = cols => (width - (cols - 1) * gap) / cols;
  const clamp = w => Math.min(max, Math.max(min, w));
  if (n <= 0) return { cols: 1, tile: clamp(tileFor(1)) };
  for (let cols = 1; cols <= maxCols; cols++) {
    const w = tileFor(cols);
    const rows = Math.ceil(n / cols);
    if (w <= max && rows * w * ratio + (rows - 1) * gap <= height) return { cols, tile: clamp(w) };
  }
  return { cols: maxCols, tile: clamp(tileFor(maxCols)) };
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
 * Nächstes anstehendes Datum eines Events (frühester Konzerttag >= `todayIso`,
 * mehrtägige Einträge laufen bis `end_date`); sonst das früheste Datum.
 * @param {any} ev
 * @param {string} todayIso
 * @returns {string}
 */
export function nextUpcomingDate(ev, todayIso) {
  const items = ev.event_type === 'festival' ? [ev] : (ev.concerts || []);
  let best = '';
  for (const c of items) {
    if (!c.date) continue;
    const end = c.end_date || c.date;
    const d = c.date >= todayIso ? c.date : (end >= todayIso ? todayIso : '');
    if (d && (!best || d < best)) best = d;
  }
  return best || eventEarliestDate(ev);
}

/** Ganze Tage von `fromIso` bis `toIso` (negativ, wenn `toIso` früher liegt). */
export function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso + 'T12:00:00'), b = new Date(toIso + 'T12:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** Countdown-Text: `heute`, `morgen`, `in N Tagen`; leer für vergangene Tage. */
export function fmtCountdown(days) {
  if (days < 0 || !Number.isFinite(days)) return '';
  if (days === 0) return 'heute';
  if (days === 1) return 'morgen';
  return `in ${days} Tagen`;
}

/** Monatsüberschrift, z. B. `November 2026`; leer ohne Datum. */
export function fmtMonthHeader(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
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

/**
 * Lineup eines Konzerts: Headliner (tour.artist, String oder Array) und Supports.
 * Supports = concert.support_present, sonst Fallback auf tour.support (assumed=true).
 * @param {any} tour
 * @param {any} concert
 * @returns {{headliners: string[], supports: string[], assumed: boolean}}
 */
export function concertLineup(tour, concert) {
  const headliners = [].concat((tour && tour.artist) || []).filter(Boolean);
  const present = ((concert && concert.support_present) || []).filter(Boolean);
  if (present.length) return { headliners, supports: present, assumed: false };
  const fallback = [].concat((tour && tour.support) || []).filter(Boolean);
  return { headliners, supports: fallback, assumed: fallback.length > 0 };
}

/**
 * Festival-Bandliste auf `max` Einträge kürzen; `more` = Anzahl der ausgeblendeten.
 * @param {string[]} bands
 * @param {number} [max]
 * @returns {{shown: string[], more: number}}
 */
export function festivalLineup(bands, max = 10) {
  const list = (bands || []).filter(Boolean);
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) };
}

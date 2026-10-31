// ══════════════════════════════════════════════════════════════════════
// event-convert.js — pure helpers for festival detection / type conversion
//
// Keine DOM- oder Netzwerkzugriffe: Eventim-Produkte → Festival-Payload,
// Namensbereinigung und Umwandlung Tour ↔ Festival.
// ══════════════════════════════════════════════════════════════════════

const TICKET_VARIANT_RE = /ticket|vip|camping|pass\b|paket|package|eintritt/i;

/**
 * Entfernt Ticket-Varianten-Suffixe ("… - Weekendticket") und wandelt
 * komplett großgeschriebene Namen in Title Case um.
 * @param {string} name
 * @returns {string}
 */
export function cleanFestivalName(name) {
  let n = String(name || '').trim();
  const idx = n.lastIndexOf(' - ');
  if (idx > 0 && TICKET_VARIANT_RE.test(n.slice(idx + 3))) n = n.slice(0, idx).trim();
  if (/[A-ZÄÖÜ]/.test(n) && n === n.toUpperCase()) {
    n = n.toLowerCase().replace(/(^|[\s\-/])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
  }
  return n;
}

/**
 * Baut aus ausgewählten Eventim-Terminen EIN Festival-Payload.
 * @param {any[]} selected Concert-Einträge aus /api/eventim/search
 * @returns {any}
 */
export function festivalFromEventim(selected) {
  const sorted = [...selected].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const first = sorted[0];
  const name = cleanFestivalName(first.name);
  const dates = selected.flatMap(c => [c.date, c.end_date]).filter(Boolean).sort();
  const date = dates[0] || '';
  const last = dates[dates.length - 1] || '';
  const own = name.toLowerCase();
  const bands = [];
  const seen = new Set();
  for (const c of sorted) {
    for (const a of c.attractions || []) {
      const k = a.toLowerCase();
      if (!a || seen.has(k) || own.includes(k) || k.includes(own)) continue;
      seen.add(k);
      bands.push(a);
    }
  }
  return {
    event_type: 'festival',
    name,
    date,
    end_date: last && last !== date ? last : null,
    time: first.time || null,
    city: first.city || '',
    venue: first.venue || '',
    price: null,
    ticket_link: first.link || null,
    bands_to_watch: bands,
    tags: [],
    poster: null,
    logo: null,
    comment: '',
  };
}

/** @param {any[][]} lists @returns {any[]} */
function dedupe(...lists) {
  return [...new Set(lists.flat().filter(Boolean))];
}

/**
 * Tour → Festival-Payload (gleiche id wird vom Aufrufer per URL gesetzt).
 * @param {any} tour
 * @returns {any}
 */
export function tourToFestival(tour) {
  const artists = Array.isArray(tour.artist) ? tour.artist : (tour.artist ? [tour.artist] : []);
  const concerts = [...(tour.concerts || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const first = concerts[0] || {};
  const dates = concerts.flatMap(c => [c.date, c.end_date]).filter(Boolean).sort();
  const date = dates[0] || '';
  const last = dates[dates.length - 1] || '';
  return {
    event_type: 'festival',
    name: tour.tour_name || artists.join(', ') || tour.name || '',
    date,
    end_date: last && last !== date ? last : null,
    time: first.time || null,
    city: first.city || '',
    venue: first.venue || '',
    price: first.price ?? null,
    ticket_link: first.ticket_link || null,
    bands_to_watch: dedupe(artists, tour.support || [], ...concerts.map(c => c.support_present || [])),
    tags: dedupe(tour.tags || [], ...concerts.map(c => c.tags || [])),
    poster: tour.poster || null,
    logo: null,
    comment: tour.comment || '',
  };
}

/**
 * Festival → Tour-Payload mit einem Konzert.
 * @param {any} fest
 * @returns {any}
 */
export function festivalToTour(fest) {
  return {
    event_type: 'tour',
    artist: [fest.name],
    tour_name: fest.name,
    support: [],
    concerts: [{
      date: fest.date || '',
      end_date: fest.end_date || null,
      time: fest.time || null,
      city: fest.city || '',
      venue: fest.venue || '',
      price: fest.price ?? null,
      ticket_link: fest.ticket_link || null,
      tags: [...(fest.tags || [])],
      support_present: [],
    }],
    poster: fest.poster || null,
    comment: fest.comment || '',
  };
}

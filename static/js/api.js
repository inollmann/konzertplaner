// ══════════════════════════════════════════════════════════════════════
// api.js — pure data-fetch / state-mutation helpers (no DOM, no render)
//
// Every function here talks to the Flask backend and writes results into
// the shared `state` object from ./state.js. None of them touch the DOM
// or call render functions; orchestration (re-render, detail-panel refresh)
// is the caller's job — typically main.js or globals.js wrappers.
// ══════════════════════════════════════════════════════════════════════

import { state, getEvent } from './state.js';

/**
 * Load all server data in parallel into `state`: events, known bands/venues
 * and the artist/venue catalogue. Does not trigger any rendering.
 */
export async function fetchAll() {
  const [evR, bR, vR, aR, vcR] = await Promise.all([
    fetch('/api/events'), fetch('/api/bands'), fetch('/api/venues'),
    fetch('/api/artists'), fetch('/api/venues-catalogue'),
  ]);
  state.allEvents   = await evR.json();
  state.knownBands  = await bR.json();
  state.knownVenues = await vR.json();
  state.artists     = await aR.json();
  state.venuesCat   = await vcR.json();
}

/**
 * Delete an event by id on the server, then refresh all state.
 * Confirm/discard prompting is the caller's responsibility.
 * @param {string} id
 * @returns {Promise<void>} resolves once state has been reloaded
 */
export async function deleteEvent(id) {
  await fetch('/api/events/' + id, { method: 'DELETE' });
  return fetchAll();
}

/**
 * PUT an event to the server, reload `state.allEvents` from the canonical
 * server list, and return the freshly-loaded event.
 * @param {any} ev
 * @returns {Promise<any|undefined>} the updated event (or undefined if gone)
 */
export async function patchEvent(ev) {
  await fetch(`/api/events/${ev.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ev.to_dict ? ev.to_dict() : ev),
  });
  const r = await fetch('/api/events');
  state.allEvents = await r.json();
  return getEvent(ev.id);
}

/**
 * Reload only the catalogue half of state: artists, venue catalogue, and
 * the derived known-bands/known-venues lists.
 */
export async function reloadCatalogue() {
  const [aR, vcR, bR, vR] = await Promise.all([
    fetch('/api/artists'), fetch('/api/venues-catalogue'),
    fetch('/api/bands'), fetch('/api/venues'),
  ]);
  state.artists     = await aR.json();
  state.venuesCat   = await vcR.json();
  state.knownBands  = await bR.json();
  state.knownVenues = await vR.json();
}

/**
 * Add or remove a tag on a single concert of a tour, then persist.
 * @param {string} eventId
 * @param {string} concertId
 * @param {string} tag
 * @param {boolean} add
 */
export async function setConcertTag(eventId, concertId, tag, add) {
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'tour') return;
  const conc = (ev.concerts || []).find(c => c.id === concertId);
  if (!conc) return;
  if (add) { if (!conc.tags.includes(tag)) conc.tags.push(tag); }
  else { conc.tags = conc.tags.filter(t => t !== tag); }
  await patchEvent(ev);
}

/**
 * Add or remove a tag on a festival (whole-event tag), then persist.
 * @param {string} eventId
 * @param {string} tag
 * @param {boolean} add
 */
export async function setFestivalTag(eventId, tag, add) {
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'festival') return;
  if (add) { if (!ev.tags.includes(tag)) ev.tags.push(tag); }
  else { ev.tags = ev.tags.filter(t => t !== tag); }
  await patchEvent(ev);
}

/**
 * Prompt for a support-act name and append it to the concert's
 * `support_present` list, then persist. No-op if the prompt is cancelled.
 * @param {string} eventId
 * @param {string} concertId
 */
export async function promptAddSupport(eventId, concertId) {
  const name = prompt('Support-Act Name:');
  if (!name || !name.trim()) return;
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'tour') return;
  const conc = (ev.concerts || []).find(c => c.id === concertId);
  if (!conc) return;
  if (!conc.support_present) conc.support_present = [];
  if (!conc.support_present.includes(name.trim())) {
    conc.support_present.push(name.trim());
  }
  await patchEvent(ev);
}

/**
 * Prompt for a band name and append it to the festival's `bands_to_watch`
 * list, then persist. No-op if the prompt is cancelled.
 * @param {string} eventId
 */
export async function promptAddFestivalBand(eventId) {
  const name = prompt('Band Name:');
  if (!name || !name.trim()) return;
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'festival') return;
  if (!ev.bands_to_watch) ev.bands_to_watch = [];
  if (!ev.bands_to_watch.includes(name.trim())) {
    ev.bands_to_watch.push(name.trim());
  }
  await patchEvent(ev);
}

/**
 * Toggle the followed-state of an artist on the server and refresh the
 * catalogue. UI re-render (artist list / favourites) is left to the caller.
 * @param {string} artistId
 * @param {boolean} follow
 */
export async function toggleFollow(artistId, follow) {
  if (!artistId) return;
  await fetch('/api/artists/' + artistId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followed: follow }),
  });
  await reloadCatalogue();
}

/**
 * Upload an artist logo/photo blob and return the stored filename.
 * @param {Blob} blob
 * @param {string|null} [artistName] human-readable name for the file
 * @param {string} [imgType='logo'] 'logo' | 'photo'
 * @returns {Promise<string|null>} filename, or null if no blob was given
 */
export async function uploadArtistImg(blob, artistName = null, imgType = 'logo') {
  if (!blob) return null;
  const fd = new FormData(); fd.append('logo', blob);
  if (artistName) fd.append('artist', artistName);
  fd.append('type', imgType);
  const r = await fetch('/api/upload-logo', { method: 'POST', body: fd });
  return (await r.json()).id;
}

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
 * and the artist/venue catalogue. Also pulls the syncable client-state
 * blobs (ratings, notifications, location, venue geocoding cache) from the
 * KV store; on first ever sync (key missing server-side) the existing
 * localStorage value is uploaded so existing users don't lose their data.
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

  await Promise.all([
    syncKv('ratings', 'kp-ratings', 'ratings'),
    syncKv('notifications', 'kp-notifs', 'notifications'),
    syncKv('location', 'kp-location', 'locationSettings'),
    syncKv('venueCache', 'kp-venue-cache'),
  ]);
}

/**
 * Pull one KV key from the server into `state[stateKey]` (when given) and
 * the matching localStorage slot. If the key has never been written
 * server-side (404), upload the current localStorage value once so it
 * becomes the seed. localStorage is always kept in sync with the
 * authoritative server value.
 * @param {string} kvKey     server key ('ratings' | 'notifications' | …)
 * @param {string} lsKey     localStorage key ('kp-ratings' | …)
 * @param {string} [stateKey] field on `state` to write (omit for pure
 *                           localStorage-backed caches like venueCache)
 */
async function syncKv(kvKey, lsKey, stateKey) {
  try {
    const r = await fetch(`/api/kv/${kvKey}`);
    if (r.status === 404) {
      const lsVal = JSON.parse(localStorage.getItem(lsKey) || 'null');
      if (lsVal !== null) {
        if (stateKey) state[stateKey] = lsVal;
        saveKv(kvKey, lsVal);
      }
      return;
    }
    if (!r.ok) return;
    const serverVal = await r.json();
    if (stateKey) state[stateKey] = serverVal;
    localStorage.setItem(lsKey, JSON.stringify(serverVal));
  } catch (e) {
    // network/server error: keep localStorage value already in state
  }
}

// ── KV sync: debounced per-key PUT ─────────────────────────────────────────────

const _kvTimers = {};

/**
 * Persist `blob` under server key `kvKey`, debounced 400ms per key so a
 * burst of rating/notification changes results in one PUT. Fire-and-forget
 * on error (localStorage is already updated by the caller, so the UI
 * stays correct; next boot's syncKv will reconcile).
 * @param {string} kvKey
 * @param {any} blob
 */
export function saveKv(kvKey, blob) {
  const prev = _kvTimers[kvKey];
  if (prev) clearTimeout(prev);
  _kvTimers[kvKey] = setTimeout(async () => {
    delete _kvTimers[kvKey];
    try {
      await fetch(`/api/kv/${kvKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blob),
      });
    } catch (e) { /* offline — keep going, sync next boot */ }
  }, 400);
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
  window.dispatchEvent(new CustomEvent('datachange'));
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
  window.dispatchEvent(new CustomEvent('datachange'));
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
 * @param {string} [imgType='logo'] 'logo' | 'photo' | 'logo-mono'
 * @param {string} [filename] explicit filename (canvas Blobs have none);
 *   falls back to `blob.name` then 'upload.png'. A named extension is
 *   required — the backend's allowed_file() rejects extensionless blobs.
 * @returns {Promise<string|null>} filename, or null if no blob was given
 */
export async function uploadArtistImg(blob, artistName = null, imgType = 'logo', filename = undefined) {
  if (!blob) return null;
  // `Blob` has no `name` (only `File` does); cast so the fallback works for
  // File uploads while canvas Blobs pass an explicit filename.
  const name = /** @type {any} */ (blob).name;
  const fd = new FormData(); fd.append('logo', blob, filename || name || 'upload.png');
  if (artistName) fd.append('artist', artistName);
  fd.append('type', imgType);
  const r = await fetch('/api/upload-logo', { method: 'POST', body: fd });
  return (await r.json()).id;
}

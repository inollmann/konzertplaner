// ══════════════════════════════════════════════════════════════════════
// favourites.js — favourites tab: artist cards, Eventim lookups, add modal
//
// Two layout modes, switched at the `min-width: 1000px` breakpoint:
//   • Narrow  — accordion: each card expands inline showing its concerts.
//   • Wide    — master/detail: the list (left) holds full-width clickable
//     cards; selecting one renders its concerts in `#fav-detail` (right).
//
// `state.favCardState` (keyed by artist id) caches per-card open/loading/
// concerts/suggestions/nearby so cards don't refetch on every toggle within
// a 5-minute window. `state.favSelectedId` tracks the wide-mode selection.
//
// The detail body shows two sections: "In deiner Nähe & bevorzugte Städte"
// (concerts within 75 km of the home city OR in a preferred city), then
// "Alle Termine" (every concert chronologically). Distance is computed
// city-centre → city-centre via `haversineKm`; city coordinates are
// geocoded once and cached (`kp-city-cache`).
//
// Inline onclick handlers (toggleFavCard, confirmEventimArtist,
// openNotifEventModalEnc, addFavouriteArtist) are exposed on `window` by
// globals.js. One-way import of `openNotifEventModal` from notifications.js
// (no reverse edge).
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc, parseDate, artistLogoSrc, artistLogoClass, haversineKm } from './utils.js';
import { openModal, closeModal, switchTab } from './ui.js';
import { reloadCatalogue } from './api.js';
import { openNotifEventModal } from './notifications.js';
import { geocodeCity } from './map.js';
import { icon } from './icons.js';

const FAV_WIDE_BREAKPOINT = 1000;   // px; below this the accordion layout is used
const NEARBY_RADIUS_KM = 75;

let _favSearchTimeout = null;
let _favListWired = false;
let _favDetailWired = false;
let _favResizeT = null;
let _favLayoutWide = _isWideLayout();

/** Whether the wide master/detail layout is currently active. */
function _isWideLayout() {
  const w = /** @type {any} */ (window);
  if (typeof w.matchMedia !== 'function') return false;
  return w.matchMedia(`(min-width: ${FAV_WIDE_BREAKPOINT}px)`).matches;
}

/** Home city (trimmed) from `state.locationSettings`. */
function _homeCity() { return (state.locationSettings.city || '').trim(); }

/**
 * Render the favourites list: empty state when no followed artists,
 * otherwise one card per followed artist. On wide layouts the cards are
 * bare headers (the body lives in `#fav-detail`); on narrow layouts each
 * card carries its own inline `.fav-events-body` (accordion). Always
 * re-renders the detail panel afterwards so the two stay in sync.
 */
export async function renderFavourites() {
  const el = document.getElementById('fav-list');
  if (!_favListWired) {
    _favListWired = true;
    el.addEventListener('click', e => {
      const header = e.target.closest('[data-fav-id]');
      if (header) { window.toggleFavCard?.(header.dataset.favId, header.dataset.favName); return; }
      const row = e.target.closest('[data-notif-enc]');
      if (row) { window.openNotifEventModalEnc?.(row.dataset.notifEnc, row.dataset.artistEnc); return; }
    });
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-notif-enc]');
      if (row) { e.preventDefault(); window.openNotifEventModalEnc?.(row.dataset.notifEnc, row.dataset.artistEnc); }
    });
  }
  const detail = document.getElementById('fav-detail');
  if (detail && !_favDetailWired) {
    _favDetailWired = true;
    detail.addEventListener('click', e => {
      const row = e.target.closest('[data-notif-enc]');
      if (row) { window.openNotifEventModalEnc?.(row.dataset.notifEnc, row.dataset.artistEnc); return; }
    });
    detail.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const row = e.target.closest('[data-notif-enc]');
      if (row) { e.preventDefault(); window.openNotifEventModalEnc?.(row.dataset.notifEnc, row.dataset.artistEnc); }
    });
  }

  const followed = state.artists.filter(a => a.followed && a.id);
  if (!followed.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">${icon('star-filled')}</div><h3>Keine Favoriten</h3>
      <p>Füge Artists über „Artist hinzufügen" hinzu.</p>
    </div>`;
    renderFavDetail();
    return;
  }
  el.innerHTML = followed.map(a => buildFavCard(a)).join('');
  renderFavDetail();
}

/**
 * Build the HTML for a single favourite-artist card. On wide layouts the
 * card is just the header (full-width clickable, `.selected` when active);
 * on narrow layouts it additionally carries the inline accordion body.
 * @param {any} a artist catalogue entry
 * @returns {string}
 */
export function buildFavCard(a) {
  const cs = state.favCardState[a.id] || {};
  const isOpen = !!cs.open;
  const wide = _isWideLayout();
  const selected = wide && state.favSelectedId === a.id;
  const logoSrc = artistLogoSrc(a);
  const logoHtml = logoSrc
    ? `<div class="fav-artist-logo"><img class="${artistLogoClass(a)}" src="/api/img/${logoSrc}" alt=""></div>`
    : `<div class="fav-artist-logo">${icon('mic')}</div>`;
  const evimLabel = a.eventim_name
    ? `<div class="fav-artist-meta">Eventim: ${esc(a.eventim_name)}</div>` : '';
  const header = `<button class="unstyled fav-card-header" type="button" data-fav-id="${a.id}" data-fav-name="${esc(a.eventim_name||a.name)}" style="display:flex;align-items:center;gap:var(--space-8);padding:var(--space-8) var(--space-9)">
      ${logoHtml}
      <div style="flex:1;min-width:0">
        <div class="fav-artist-name">${esc(a.name)}</div>
        ${evimLabel}
      </div>
      <span class="fav-chevron">${icon('chevron-right')}</span>
    </button>`;
  if (wide) {
    return `<div class="fav-card ${selected?'selected':''}" id="fav-card-${a.id}">${header}</div>`;
  }
  const bodyHtml = isOpen ? buildFavConcertsBody(a, cs) : '';
  return `<div class="fav-card ${isOpen?'open':''}" id="fav-card-${a.id}">
    ${header}
    <div class="fav-events-body">${bodyHtml}</div>
  </div>`;
}

/**
 * Pure helper: split a list of Eventim concerts into the "nearby" subset —
 * those whose city is one of the preferred cities, the home city, or
 * within `NEARBY_RADIUS_KM` of the home city (city-centre → city-centre).
 * Returns the nearby concerts in chronological order. Pure (no IO) so it
 * is unit-tested directly; `enrichNearby` supplies the geocoded coords.
 * City-name matching is case- and whitespace-insensitive.
 * @param {any[]} concerts
 * @param {string[]} preferred preferred-city names (any case)
 * @param {{lat:number, lon:number}|null} homeCoords
 * @param {Record<string, {lat:number, lon:number}|null>} cityCoordsMap lowercased city → coords
 * @param {string} homeCity home city name (any case; empty when unset)
 * @returns {any[]}
 */
export function computeNearby(concerts, preferred, homeCoords, cityCoordsMap, homeCity) {
  const pref = preferred.map(p => p.trim().toLowerCase()).filter(Boolean);
  const home = (homeCity || '').trim().toLowerCase();
  const out = [];
  for (const c of concerts) {
    const cityLower = (c.city || '').trim().toLowerCase();
    if (!cityLower) continue;
    let near = pref.includes(cityLower);
    if (!near && home && cityLower === home) near = true;
    if (!near && homeCoords) {
      const coords = cityCoordsMap[cityLower];
      if (coords && haversineKm(homeCoords, coords) <= NEARBY_RADIUS_KM) near = true;
    }
    if (near) out.push(c);
  }
  out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return out;
}

/**
 * Geocode the home city and every unique concert city, then compute the
 * nearby subset and store it on the card state. Runs serially to respect
 * Nominatim's rate limit; results are cached in `kp-city-cache` so repeat
 * selections are instant. Mutates `state.favCardState[artistId].nearby`.
 * @param {string} artistId
 */
async function enrichNearby(artistId) {
  const cs = state.favCardState[artistId];
  if (!cs || !cs.concerts || !cs.concerts.length) return;
  const preferred = (state.locationSettings.preferred || []).map(c => c.trim()).filter(Boolean);
  const homeCity = _homeCity();
  const homeCoords = homeCity ? await geocodeCity(homeCity) : null;
  const cities = [...new Set(cs.concerts.map(c => (c.city || '').trim()).filter(Boolean))];
  const cityCoordsMap = {};
  for (const city of cities) {
    cityCoordsMap[city.toLowerCase()] = await geocodeCity(city);
  }
  cs.nearby = computeNearby(cs.concerts, preferred, homeCoords, cityCoordsMap, homeCity);
}

/**
 * Build the body content for a card: loading / error / suggestions /
 * two concert sections (nearby first, then all chronologically). Shared
 * by the narrow accordion body and the wide detail panel.
 * @param {any} a artist catalogue entry
 * @param {any} cs card state
 * @returns {string}
 */
export function buildFavConcertsBody(a, cs) {
  if (cs.loading) {
    return `<div class="fav-loading">⏳ Lade Eventim-Events…</div>`;
  }
  if (cs.error) {
    return `<div class="fav-empty">${icon('circle-x')} ${esc(cs.error)}</div>`;
  }
  if (cs.suggestions && cs.suggestions.length) {
    return `<div class="fav-no-match">
      <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
        Artist „${esc(a.name)}" nicht eindeutig auf Eventim gefunden. Ähnliche Treffer:
      </div>
      ${cs.suggestions.map(s => `
        <div class="fav-suggestion">
          <span>${esc(s.name)} <span style="color:var(--muted);font-size:11px">(${s.event_count} Events)</span></span>
          <button class="btn-sm" onclick="confirmEventimArtist('${a.id}','${s.name.replace(/'/g,"\'")}')">Als Eventim-Artist setzen</button>
        </div>`).join('')}
    </div>`;
  }
  if (cs.concerts && cs.concerts.length) {
    const all = [...cs.concerts].sort((x, y) => (x.date || '').localeCompare(y.date || ''));
    const nearby = cs.nearby && cs.nearby.length
      ? [...cs.nearby].sort((x, y) => (x.date || '').localeCompare(y.date || ''))
      : [];
    let html = '';
    if (nearby.length) {
      html += `<div class="fav-section-title">${icon('map-pin')} Für dich</div>`;
      html += nearby.map(c => _favConcertRow(c, a)).join('');
      html += `<div class="fav-section-title">Alle Termine</div>`;
    }
    html += all.map(c => _favConcertRow(c, a)).join('');
    return html;
  }
  return `<div class="empty-state"><div class="icon">${icon('calendar')}</div><h3>Keine anstehenden Events</h3><p>Dieser Artist hat aktuell keine Termine auf Eventim.</p></div>`;
}

/**
 * One Eventim concert row (date block + venue/city/time + ticket link).
 * The `data-notif-enc` / `data-artist-enc` attrs are decoded by the
 * delegated click listener to open the notif-event modal.
 * @param {any} c concert
 * @param {any} a artist (name used in the modal title)
 * @returns {string}
 */
function _favConcertRow(c, a) {
  const d = parseDate(c.date);
  const cJson = encodeURIComponent(JSON.stringify(c));
  const aJson = encodeURIComponent(JSON.stringify(a.name));
  return `<div class="fav-event-row" role="button" tabindex="0" data-notif-enc="${cJson}" data-artist-enc="${aJson}" aria-label="${esc((c.venue||c.name||'Konzert')+(c.city?', '+c.city:''))}">
    <div class="date-block" style="padding-top:0">
      <div class="date-day" style="font-size:1.5rem">${d.day}</div>
      <div class="date-month">${d.month}</div>
      <div class="date-year">${d.year}</div>
    </div>
    <div class="concert-info">
      <div class="concert-venue">${esc(c.venue||c.name||'–')}</div>
      <div class="concert-city">${icon('map-pin')} ${esc(c.city)}</div>
      ${c.time ? `<div class="concert-time">${icon('clock')} ${esc(c.time)} Uhr</div>` : ''}
    </div>
    <div class="fav-event-actions">
      ${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener" class="ticket-link-btn" onclick="event.stopPropagation()" style="font-size:11px">${icon('check')}</a>` : ''}
      ${c.inStock ? `<span style="font-size:10px;color:var(--tickets-color)">${icon('check')}</span>` : ''}
    </div>
  </div>`;
}

/**
 * Render the wide-mode detail panel (`#fav-detail`). No-op on narrow
 * layouts (the panel is hidden by CSS and emptied here). Shows a
 * placeholder when no artist is selected, otherwise the artist header
 * plus `buildFavConcertsBody`.
 */
export function renderFavDetail() {
  const el = document.getElementById('fav-detail');
  if (!el) return;
  if (!_isWideLayout()) { el.innerHTML = ''; return; }
  const id = state.favSelectedId;
  const a = id && state.artists.find(x => x.id === id);
  if (!a) {
    el.innerHTML = `<div class="empty-state"><div class="icon">${icon('star')}</div><h3>Artist auswählen</h3><p>Klicke links auf einen Artist, um seine anstehenden Konzerte zu sehen.</p></div>`;
    return;
  }
  const cs = state.favCardState[a.id] || {};
  const logoSrc = artistLogoSrc(a);
  const logoHtml = logoSrc
    ? `<div class="fav-artist-logo"><img class="${artistLogoClass(a)}" src="/api/img/${logoSrc}" alt=""></div>`
    : `<div class="fav-artist-logo">${icon('mic')}</div>`;
  const evimLabel = a.eventim_name
    ? `<div class="fav-artist-meta">Eventim: ${esc(a.eventim_name)}</div>` : '';
  el.innerHTML = `<div class="fav-detail-header">
      ${logoHtml}
      <div style="flex:1;min-width:0">
        <div class="fav-artist-name">${esc(a.name)}</div>
        ${evimLabel}
      </div>
    </div>
    <div class="fav-detail-body">${buildFavConcertsBody(a, cs)}</div>`;
}

/**
 * Decode URI-encoded concert/artist params and open the notif event modal.
 * Used by inline onclick in fav cards (params are pre-encoded to survive
 * HTML attribute escaping).
 * @param {string} cEnc URI-encoded concert JSON
 * @param {string} aEnc URI-encoded artist name
 */
export function openNotifEventModalEnc(cEnc, aEnc) {
  openNotifEventModal(JSON.parse(decodeURIComponent(cEnc)), JSON.parse(decodeURIComponent(aEnc)));
}

/**
 * Toggle a favourite card. On wide layouts selects the card (master/
 * detail); on narrow layouts opens/closes the inline accordion body. When
 * opening and the cached concerts are older than 5 minutes (or never
 * loaded), triggers a fresh Eventim lookup; otherwise just flips the
 * flag and re-renders.
 * @param {string} artistId
 * @param {string} eventimName
 */
export async function toggleFavCard(artistId, eventimName) {
  if (_isWideLayout()) return selectFavCard(artistId, eventimName);
  const cs = state.favCardState[artistId] || {};
  if (cs.open) { state.favCardState[artistId] = {...cs, open:false}; renderFavourites(); return; }
  const now = Date.now();
  if (cs.concerts !== undefined && cs.loadedAt && (now - cs.loadedAt) < 5*60*1000) {
    state.favCardState[artistId] = {...cs, open:true}; renderFavourites(); return;
  }
  state.favCardState[artistId] = {open:true, loading:true};
  renderFavourites();
  await loadFavArtistEvents(artistId, eventimName);
}

/**
 * Select a card in wide master/detail mode: mark it selected, render the
 * list + detail immediately, and fetch events when the cache is stale.
 * @param {string} artistId
 * @param {string} eventimName
 */
export async function selectFavCard(artistId, eventimName) {
  state.favSelectedId = artistId;
  const cs = state.favCardState[artistId] || {};
  const now = Date.now();
  state.favCardState[artistId] = {...cs, open:true};
  renderFavourites();
  if (cs.concerts !== undefined && cs.loadedAt && (now - cs.loadedAt) < 5*60*1000) {
    return;
  }
  state.favCardState[artistId] = {...cs, open:true, loading:true};
  renderFavourites();
  await loadFavArtistEvents(artistId, eventimName);
}

/**
 * Fetch Eventim artist-search results, resolve to an exact name match,
 * then fetch that artist's upcoming concerts and store them in
 * `state.favCardState`. When no exact match exists, store up to 5
 * suggestions for the user to disambiguate. After concerts arrive, the
 * nearby subset is computed asynchronously (progressive: the "Alle
 * Termine" section renders first, nearby fills in once geocoded).
 * @param {string} artistId
 * @param {string} searchName
 */
export async function loadFavArtistEvents(artistId, searchName) {
  try {
    const r = await fetch(`/api/eventim/artist-search?q=${encodeURIComponent(searchName)}&top=8`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    const exactMatch = (data.artists||[]).find(a=>a.name.toLowerCase()===searchName.toLowerCase());
    if (!exactMatch && (data.artists||[]).length > 0) {
      state.favCardState[artistId] = {open:true, loading:false, loadedAt:Date.now(), suggestions:data.artists.slice(0,5)};
      renderFavourites(); return;
    }
    const confirmedName = exactMatch ? exactMatch.name : searchName;
    const r2 = await fetch(`/api/eventim/artist-events?name=${encodeURIComponent(confirmedName)}`);
    const d2 = await r2.json();
    if (d2.error) throw new Error(d2.error);
    state.favCardState[artistId] = {open:true, loading:false, loadedAt:Date.now(), concerts:d2.concerts||[], confirmedName};
    renderFavourites();
    await enrichNearby(artistId);
    renderFavourites();
  } catch(err) {
    state.favCardState[artistId] = {open:true, loading:false, error:err.message};
    renderFavourites();
  }
}

/**
 * Persist `eventim_name` on the artist (PUT /api/artists/:id), reload the
 * catalogue, then re-fetch that artist's Eventim events.
 * @param {string} artistId
 * @param {string} eventimName
 */
export async function confirmEventimArtist(artistId, eventimName) {
  await fetch('/api/artists/'+artistId, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventim_name:eventimName})});
  await reloadCatalogue();
  state.favCardState[artistId] = {open:true, loading:true};
  renderFavourites();
  await loadFavArtistEvents(artistId, eventimName);
}

/**
 * Open the "Artist hinzufügen" modal, clearing the search field and
 * focusing it for immediate typing.
 */
export function openAddFavouriteModal() {
  document.getElementById('fav-search-input').value = '';
  document.getElementById('fav-search-results').innerHTML = '';
  openModal('add-fav-modal');
  setTimeout(()=>document.getElementById('fav-search-input').focus(), 100);
}

/**
 * Input handler for the favourite search field: debounces 400ms before
 * triggering a search; ignores queries shorter than 2 characters.
 */
export function onFavSearchInput() {
  const q = document.getElementById('fav-search-input').value.trim();
  clearTimeout(_favSearchTimeout);
  if (q.length < 2) return;
  _favSearchTimeout = setTimeout(()=>doFavSearch(q), 400);
}

/**
 * Search Eventim's artist catalogue for `q` and render the results as
 * follow buttons in the add-favourite modal.
 * @param {string} q
 */
export async function doFavSearch(q) {
  const el = document.getElementById('fav-search-results');
  el.innerHTML = `<div class="fav-loading">⏳ Suche auf Eventim…</div>`;
  try {
    const r = await fetch(`/api/eventim/artist-search?q=${encodeURIComponent(q)}`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    const found = data.artists || [];
    if (!found.length) { el.innerHTML=`<div class="fav-empty">Keine Treffer für „${esc(q)}".</div>`; return; }
    el.innerHTML = found.map(a=>`
      <div class="fav-suggestion" style="padding:10px 0">
        <div>
          <div style="font-size:14px">${esc(a.name)}</div>
          <div style="font-size:11px;color:var(--muted)">${a.event_count} anstehende Events</div>
        </div>
        <button class="btn-sm" onclick="addFavouriteArtist('${a.name.replace(/'/g,"\'")}')">${icon('star-filled')} Folgen</button>
      </div>`).join('');
  } catch(err) {
    el.innerHTML = `<div class="fav-empty">Fehler: ${esc(err.message)}</div>`;
  }
}

/**
 * Follow an Eventim artist: PUT (if already in the catalogue) or POST
 * (new artist), reload the catalogue, close the modal and switch to the
 * favourites tab.
 * @param {string} eventimName
 */
export async function addFavouriteArtist(eventimName) {
  const existing = state.artists.find(a=>a.name.toLowerCase()===eventimName.toLowerCase()&&a.id);
  if (existing) {
    await fetch('/api/artists/'+existing.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({followed:true,eventim_name:eventimName})});
  } else {
    await fetch('/api/artists',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:eventimName,followed:true,eventim_name:eventimName})});
  }
  await reloadCatalogue();
  closeModal('add-fav-modal');
  const favTab = document.querySelector('.tab:nth-child(3)');
  if (favTab) switchTab('favourites', favTab);
}

// Re-render when the layout mode flips so the accordion/detail switch is
// clean. Only matters while the favourites tab is visible.
window.addEventListener('resize', () => {
  clearTimeout(_favResizeT);
  _favResizeT = setTimeout(() => {
    const now = _isWideLayout();
    if (now !== _favLayoutWide) {
      _favLayoutWide = now;
      if (state.currentTab === 'favourites') renderFavourites();
    }
  }, 150);
});

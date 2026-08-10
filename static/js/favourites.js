// ══════════════════════════════════════════════════════════════════════
// favourites.js — favourites tab: artist cards, Eventim lookups, add modal
//
// Renders the collapsible favourite-artist cards in the "Favoriten" tab,
// each card lazily fetching upcoming Eventim concerts for the artist.
// `state.favCardState` (keyed by artist id) caches per-card open/loading/
// concerts/suggestions so cards don't refetch on every toggle within a
// 5-minute window. The "Artist hinzufügen" modal searches Eventim's
// artist catalogue and either follows an existing artist or creates a
// new followed one. Inline onclick handlers (toggleFavCard,
// confirmEventimArtist, openNotifEventModalEnc, addFavouriteArtist) are
// exposed on `window` by globals.js. One-way import of
// `openNotifEventModal` from notifications.js (no reverse edge).
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc, parseDate, venueMapHtml } from './utils.js';
import { openModal, closeModal, switchTab } from './ui.js';
import { reloadCatalogue } from './api.js';
import { openNotifEventModal } from './notifications.js';
import { icon } from './icons.js';

let _favSearchTimeout = null;
let _favListWired = false;

/**
 * Render the favourites list: empty state when no followed artists,
 * otherwise one collapsible card per followed artist.
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
  const followed = state.artists.filter(a => a.followed && a.id);
  if (!followed.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">${icon('star-filled')}</div><h3>Keine Favoriten</h3>
      <p>Füge Artists über „Artist hinzufügen" hinzu.</p>
    </div>`;
    return;
  }
  el.innerHTML = followed.map(a => buildFavCard(a)).join('');
}

/**
 * Build the HTML for a single favourite-artist card, including the
 * expanded body (loading / error / suggestions / concerts) when open.
 * @param {any} a artist catalogue entry
 * @returns {string}
 */
export function buildFavCard(a) {
  const cs = state.favCardState[a.id] || {};
  const isOpen = !!cs.open;
  const logoHtml = a.logo
    ? `<div class="fav-artist-logo"><img src="/api/img/${a.logo}" alt=""></div>`
    : `<div class="fav-artist-logo">${icon('mic')}</div>`;
  const evimLabel = a.eventim_name
    ? `<div class="fav-artist-meta">Eventim: ${esc(a.eventim_name)}</div>` : '';
  let bodyHtml = '';
  if (isOpen) {
    if (cs.loading) {
      bodyHtml = `<div class="fav-loading">⏳ Lade Eventim-Events…</div>`;
    } else if (cs.error) {
      bodyHtml = `<div class="fav-empty">${icon('circle-x')} ${esc(cs.error)}</div>`;
    } else if (cs.suggestions && cs.suggestions.length) {
      bodyHtml = `<div class="fav-no-match">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
          Artist „${esc(a.name)}" nicht eindeutig auf Eventim gefunden. Ähnliche Treffer:
        </div>
        ${cs.suggestions.map(s => `
          <div class="fav-suggestion">
            <span>${esc(s.name)} <span style="color:var(--muted);font-size:11px">(${s.event_count} Events)</span></span>
            <button class="btn-sm" onclick="confirmEventimArtist('${a.id}','${s.name.replace(/'/g,"\'")}')">Als Eventim-Artist setzen</button>
          </div>`).join('')}
      </div>`;
    } else if (cs.concerts && cs.concerts.length) {
      bodyHtml = cs.concerts.map(c => {
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
      }).join('');
    } else {
      bodyHtml = `<div class="empty-state"><div class="icon">${icon('calendar')}</div><h3>Keine anstehenden Events</h3><p>Dieser Artist hat aktuell keine Termine auf Eventim.</p></div>`;
    }
  }
  return `<div class="fav-card ${isOpen?'open':''}" id="fav-card-${a.id}">
    <button class="unstyled fav-card-header" type="button" data-fav-id="${a.id}" data-fav-name="${esc(a.eventim_name||a.name)}" style="display:flex;padding:var(--space-7) var(--space-8)">
      ${logoHtml}
      <div style="flex:1;min-width:0">
        <div class="fav-artist-name">${esc(a.name)}</div>
        ${evimLabel}
      </div>
      <span class="fav-chevron">${icon('chevron-right')}</span>
    </button>
    <div class="fav-events-body">${bodyHtml}</div>
  </div>`;
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
 * Toggle a favourite card open/closed. When opening and the cached
 * concerts are older than 5 minutes (or never loaded), trigger a fresh
 * Eventim lookup; otherwise just flip the open flag and re-render.
 * @param {string} artistId
 * @param {string} eventimName
 */
export async function toggleFavCard(artistId, eventimName) {
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
 * Fetch Eventim artist-search results, resolve to an exact name match,
 * then fetch that artist's upcoming concerts and store them in
 * `state.favCardState`. When no exact match exists, store up to 5
 * suggestions for the user to disambiguate.
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

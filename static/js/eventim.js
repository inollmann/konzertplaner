// ══════════════════════════════════════════════════════════════════════
// eventim.js — Eventim tour search, concert selection and import
//
// The "Eventim durchsuchen" search box in the header queries the Eventim
// proxy (/api/eventim/search), shows a dropdown of matching tours, and
// lets the user pick individual concerts to import as a new tour event.
// Per-tour concert lists are sorted with the user's home city and
// preferred cities first (via tools.js helpers).
//
// `_eventimTours` is module-local (was `window._eventimTours` in
// app.js): `showToursModal` sets it, `showConcertsModal(index)` reads
// it — no global side-channel needed in the ES-module world.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc, parseDate, fmtDateShort } from './utils.js';
import { openModal, closeModal, switchTab } from './ui.js';
import { fetchAll } from './api.js';
import { getLocationCity, getPreferredCities } from './tools.js';
import { icon } from './icons.js';

let _searchTimeout = null;
let _currentSearchPage = 1;
let _currentSearchTerm = '';
let _currentTour = null;
let _selectedConcerts = new Set();
let _eventimTours = [];

/**
 * Input handler for the Eventim search box: toggles the clear button,
 * debounces 500ms before searching, and ignores queries < 2 characters.
 */
export function onSearchInput() {
  const val = document.getElementById('eventim-search').value.trim();
  document.getElementById('search-clear').classList.toggle('visible', val.length > 0);
  clearTimeout(_searchTimeout);
  if (val.length < 2) return;
  _searchTimeout = setTimeout(() => doSearch(1), 500);
}

/** Clear the Eventim search field and hide the clear button. */
export function clearSearch() {
  document.getElementById('eventim-search').value = '';
  document.getElementById('search-clear').classList.remove('visible');
}

/**
 * Fetch Eventim tour results for the current search term (page `page`),
 * then render them into the tours dropdown via `showToursModal`.
 * @param {number} [page=1]
 */
export async function doSearch(page) {
  const q = document.getElementById('eventim-search').value.trim();
  if (!q) return;
  _currentSearchTerm = q;
  _currentSearchPage = page || 1;

  const spinner = document.getElementById('search-spinner');
  const clearBtn = document.getElementById('search-clear');
  spinner.classList.add('visible');
  clearBtn.classList.remove('visible');

  try {
    const res = await fetch(`/api/eventim/search?q=${encodeURIComponent(q)}&page=${_currentSearchPage}`);
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(`HTTP ${res.status}: ${data.error||JSON.stringify(data).slice(0,200)}`);
    showToursModal(q, data);
  } catch(err) {
    console.error('Eventim:', err);
    alert(`Eventim-Suche fehlgeschlagen:\n${err.message}\n\nTipp: F12 → Konsole für Details.`);
  } finally {
    spinner.classList.remove('visible');
    document.getElementById('search-clear').classList.toggle('visible',
      document.getElementById('eventim-search').value.trim().length > 0);
  }
}

/**
 * Render Eventim tour search results into the dropdown panel: title with
 * result count, tour list (clickable → showConcertsModal), and
 * pagination when multiple pages exist. Caches the tours array in
 * `_eventimTours` for index-based access by `showConcertsModal`.
 * @param {string} query
 * @param {any} data Eventim search response
 */
export function showToursModal(query, data) {
  document.getElementById('eventim-tours-title').textContent =
    `Ergebnisse für „${esc(query)}" (${data.totalResults || 0})`;

  const list = document.getElementById('eventim-tour-list');
  if (!data.tours || !data.tours.length) {
    list.innerHTML = `<div class="empty-state"><div class="icon">${icon('search')}</div><h3>Keine Konzerte gefunden</h3><p>Versuche einen anderen Suchbegriff.</p></div>`;
  } else {
    list.innerHTML = data.tours.map((tour, i) => {
      const dates = tour.concerts.map(c => c.date).filter(Boolean).sort();
      const dateRange = dates.length
        ? (dates[0] === dates[dates.length-1]
            ? fmtDateShort(dates[0])
            : `${fmtDateShort(dates[0])} – ${fmtDateShort(dates[dates.length-1])}`)
        : '';
      return `<div class="ev-tour-item" onclick="showConcertsModal(${i})">
        <div class="ev-tour-icon">${icon('guitar')}</div>
        <div class="ev-tour-meta">
          <div class="ev-tour-artist">${esc(tour.artist)}</div>
          <div class="ev-tour-name">${esc(tour.tour_name)}${dateRange ? ' · ' + dateRange : ''}</div>
        </div>
        <div class="ev-tour-count">${tour.concerts.length} Termin${tour.concerts.length !== 1 ? 'e' : ''} ${icon('arrow-right')}</div>
      </div>`;
    }).join('');
  }

  const pag = document.getElementById('eventim-pagination');
  if (data.totalPages > 1) {
    let btns = '';
    for (let p = 1; p <= data.totalPages; p++) {
      btns += `<button class="btn-sm"
        style="${p === data.page ? 'border-color:var(--accent);color:var(--accent)' : ''}"
        onclick="doSearch(${p})">${p}</button>`;
    }
    pag.innerHTML = btns;
    pag.style.display = 'flex';
  } else {
    pag.innerHTML = '';
    pag.style.display = 'none';
  }

  _eventimTours = data.tours;
  positionAndOpenSearchPanel();
}

/** Position the tours dropdown below the search input and open it. */
export function positionAndOpenSearchPanel() {
  const panel = document.getElementById('eventim-tours-panel');
  const input = document.getElementById('eventim-search');
  const rect  = input.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 6) + 'px';
  const rightEdge = rect.right;
  const panelW = Math.min(520, window.innerWidth - 16);
  panel.style.width = panelW + 'px';
  panel.style.left = Math.max(8, rightEdge - panelW) + 'px';
  panel.classList.add('open');
}

/** Close the tours dropdown panel. */
export function closeSearchPanel() {
  document.getElementById('eventim-tours-panel').classList.remove('open');
}

/**
 * Open the concert-selection modal for the tour at `_eventimTours[tourIndex]`:
 * stash it as `_currentTour`, reset the selection, render the list and
 * show the modal.
 * @param {number} tourIndex index into `_eventimTours`
 */
export function showConcertsModal(tourIndex) {
  _currentTour = _eventimTours[tourIndex];
  _selectedConcerts = new Set();

  document.getElementById('eventim-concerts-title').textContent =
    `${esc(_currentTour.artist)} – Termine auswählen`;

  renderConcertSelection();
  openModal('eventim-concerts-modal');
}

/**
 * Render the selectable concert list for `_currentTour`, sorted with the
 * user's home city and preferred cities first, then chronologically. A
 * divider separates priority matches from the rest.
 */
export function renderConcertSelection() {
  const list = document.getElementById('eventim-concert-list');
  const myCity = getLocationCity().toLowerCase();
  const preferred = getPreferredCities().map(c => c.toLowerCase());

  const sorted = [..._currentTour.concerts].map((c, i) => ({...c, _origIdx: i})).sort((a, b) => {
    const aCity = (a.city || '').toLowerCase();
    const bCity = (b.city || '').toLowerCase();
    const aIsMyCity = aCity === myCity;
    const bIsMyCity = bCity === myCity;
    const aIsPreferred = preferred.includes(aCity);
    const bIsPreferred = preferred.includes(bCity);
    if (aIsMyCity && !bIsMyCity) return -1;
    if (!aIsMyCity && bIsMyCity) return 1;
    if (aIsPreferred && !bIsPreferred && !bIsMyCity) return -1;
    if (!aIsPreferred && bIsPreferred && !aIsMyCity) return 1;
    return (a.date || '').localeCompare(b.date || '');
  });

  let splitIdx = sorted.findIndex(c => {
    const city = (c.city || '').toLowerCase();
    return city !== myCity && !preferred.includes(city);
  });
  if (splitIdx === -1) splitIdx = sorted.length;

  const renderItem = (c, i) => {
    const d = parseDate(c.date);
    const sel = _selectedConcerts.has(c._origIdx);
    return `<div class="ev-conc-item ${sel ? 'selected' : ''}" onclick="toggleConcert(${c._origIdx})">
      <div class="ev-conc-check"><div class="check-box">${sel ? icon('check') : ''}</div></div>
      <div class="ev-conc-date">
        <div class="date-day">${d.day || '?'}</div>
        <div class="date-month">${d.month || ''}</div>
        <div class="date-year">${d.year || ''}</div>
      </div>
      <div class="ev-conc-info">
        <div class="ev-conc-venue">${esc(c.venue || '–')}</div>
        <div class="ev-conc-city">${icon('map-pin')} ${esc(c.city || '')}</div>
        ${c.time ? `<div class="ev-conc-time">${icon('clock')} ${esc(c.time)} Uhr</div>` : ''}
      </div>
      <div class="ev-conc-right">
        <div class="ev-conc-stock ${c.inStock ? 'in-stock' : 'out-stock'}">
          ${c.inStock ? icon('check')+' Verfügbar' : icon('circle-x')+' Ausverkauft'}
        </div>
        ${c.link ? `<div style="margin-top:4px"><a href="${esc(c.link)}" target="_blank" rel="noopener" class="ticket-link-btn" onclick="event.stopPropagation()" style="font-size:10px;padding:2px 7px">${icon('check')} Eventim</a></div>` : ''}
      </div>
    </div>`;
  };

  const priorityHtml = sorted.slice(0, splitIdx).map(renderItem).join('');
  const otherHtml = sorted.slice(splitIdx).map(renderItem).join('');

  list.innerHTML = priorityHtml + (otherHtml ? `<div class="ev-conc-divider"><span>Weitere Termine</span></div>` + otherHtml : '');
}

/**
 * Toggle a concert's selected state (by original index) and re-render.
 * @param {number} i original index into `_currentTour.concerts`
 */
export function toggleConcert(i) {
  if (_selectedConcerts.has(i)) _selectedConcerts.delete(i);
  else _selectedConcerts.add(i);
  renderConcertSelection();
}

/** Toggle between all-selected and none-selected; re-renders. */
export function toggleSelectAll() {
  if (_selectedConcerts.size === _currentTour.concerts.length) {
    _selectedConcerts.clear();
  } else {
    _selectedConcerts = new Set(_currentTour.concerts.map((_, i) => i));
  }
  renderConcertSelection();
}

/**
 * POST the selected concerts of `_currentTour` as a new tour event,
 * close the modal and dropdown, reload all state and switch to the
 * list tab. Alerts on empty selection or server error.
 */
export async function importEventimTour() {
  if (!_currentTour) return;
  if (_selectedConcerts.size === 0) { alert('Bitte mindestens einen Termin auswählen.'); return; }

  const selected = _currentTour.concerts.filter((_, i) => _selectedConcerts.has(i));
  const payload = {
    event_type: 'tour',
    artist:     _currentTour.artist,
    tour_name:  _currentTour.tour_name || _currentTour.artist,
    support:    [],
    poster:     null,
    comment:    '',
    concerts:   selected.map(c => ({
      date:           c.date || '',
      time:           c.time || null,
      end_date:       null,
      city:           c.city || '',
      venue:          c.venue || '',
      price:          null,
      ticket_link:    c.link || null,
      tags:           [],
      support_present: [],
    })),
  };

  try {
    const r = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('Server error ' + r.status);
    closeModal('eventim-concerts-modal');
    closeSearchPanel();
    await fetchAll();
    const listTab = document.querySelector('.tab');
    if (listTab) switchTab('list', listTab);
  } catch(err) {
    alert('Fehler beim Speichern: ' + err.message);
  }
}

// ══════════════════════════════════════════════════════════════════════
// ui.js — generic DOM/UI helpers shared across modules
//
// Modal, drawer, lightbox, popover, poster and tab-switching plumbing.
// No domain logic lives here. switchTab updates DOM tab state and
// state.currentTab, then dispatches a `tabchange` CustomEvent so main.js
// can run the tab-specific renders (renderList/renderCalendar/initMap/…)
// and apply per-tab default filters without creating import cycles.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc, fmtDateLong, fmtPrice } from './utils.js';
import { icon } from './icons.js';

/**
 * Activate a top-level tab: set `state.currentTab`, toggle `.active` on the
 * tab buttons, show/hide the matching `<main>` panel and the filter bars,
 * then dispatch a `tabchange` CustomEvent on `window` (detail = tab) so
 * main.js can perform the tab-specific render / default-filter setup
 * (e.g. renderList, renderCalendar, initMap, renderShows, renderFavourites,
 * timelineToday). This split keeps ui.js free of render-module imports.
 * @param {string} tab
 * @param {HTMLElement} el the clicked tab button
 */
export function switchTab(tab, el) {
  state.currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-list').style.display       = tab === 'list'       ? 'block' : 'none';
  document.getElementById('tab-calendar').style.display  = tab === 'calendar'   ? 'block' : 'none';
  document.getElementById('tab-map').style.display        = tab === 'map'        ? 'block' : 'none';
  document.getElementById('tab-shows').style.display      = tab === 'shows'      ? 'block' : 'none';
  document.getElementById('tab-favourites').style.display = tab === 'favourites' ? 'block' : 'none';
  document.getElementById('filter-bar').style.display =
    (tab === 'favourites' || tab === 'shows') ? 'none' : 'flex';
  document.getElementById('shows-filter-bar').style.display =
    tab === 'shows' ? 'flex' : 'none';
  const dateGroup = document.getElementById('date-filter-group');
  if (dateGroup) dateGroup.style.display = tab === 'map' ? 'inline-flex' : 'none';
  window.dispatchEvent(new CustomEvent('tabchange', { detail: tab }));
}

/**
 * Open the modal with the given id and lock body scroll.
 * @param {string} id
 */
export function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

/**
 * Close the modal with the given id and restore body scroll.
 * @param {string} id
 */
export function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

/**
 * Close a modal when its backdrop (the element with `id`) is clicked directly.
 * @param {string} id
 * @param {MouseEvent} e
 */
export function closeMbg(id, e) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

/** Toggle the side drawer open/closed. */
export function toggleDrawer() {
  document.getElementById('drawer-backdrop').classList.toggle('open');
}

/** Close the side drawer if the click landed on the overlay backdrop. */
export function closeDrawerOnBg(e) {
  if (e.target.classList.contains('drawer-overlay')) toggleDrawer();
}

/** Force-close the side drawer. */
export function closeDrawer() {
  document.getElementById('drawer-backdrop').classList.remove('open');
}

/**
 * Build the HTML for an event poster, or a styled placeholder when no poster
 * is set. The poster img opens the lightbox on click.
 * @param {string} poster filename under /static/posters/
 * @param {string} placeholder text/symbol for the placeholder tile
 * @returns {string}
 */
export function posterEl(poster, placeholder) {
  if (!poster) return `<div class="event-poster-placeholder">${placeholder}</div>`;
  return `<img class="event-poster" src="/static/posters/${poster}" alt=""
    onclick="event.stopPropagation();openLightbox('/static/posters/${poster}')" title="Poster vergrößern"
    style="cursor:zoom-in">`;
}

/**
 * Show the full-size image lightbox with the given src.
 * @param {string} src
 */
export function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}

/** Close the image lightbox. */
export function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
}

/**
 * Position and fill the calendar/concert popover from a concert object.
 * @param {MouseEvent} e trigger event (positions the popover near the cursor)
 * @param {any} c concert descriptor with artist/date/time/venue/price
 */
export function showPopover(e, c) {
  const p = document.getElementById('popover');
  p.innerHTML = `<div class="pop-title">${esc(c.artist || '')}</div>
    <div class="pop-row">${icon('calendar')} <span>${fmtDateLong(c.date)}${c.end_date ? ' – ' + fmtDateLong(c.end_date) : ''}</span></div>
    ${c.time ? `<div class="pop-row">${icon('clock')} <span>${esc(c.time)} Uhr</span></div>` : ''}
    <div class="pop-row">${icon('map-pin')} <span>${esc(c.venue)}, ${esc(c.city)}</span></div>
    ${c.price ? `<div class="pop-row">€ <span>${fmtPrice(c.price)}</span></div>` : ''}`;
  p.style.left = (e.clientX + 12) + 'px';
  p.style.top = (e.clientY - 10) + 'px';
  p.classList.add('vis');
}

/** Hide the popover. */
export function hidePopover() {
  document.getElementById('popover').classList.remove('vis');
}

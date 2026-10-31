// ══════════════════════════════════════════════════════════════════════
// list.js — event-list cards and the detail panel
//
// Owns the "list" tab rendering: renderList splits state.allEvents into
// upcoming/past and renders the active sub-tab (`state.listSubTab`), and
// renderTourCard / renderFestCard / renderConcertRow build the card HTML.
// The detail panel (openDetail / closeDetail / closeDetailOnBg /
// buildDetailHTML) lives here too because it shares the same card-row
// helpers and rating rendering.
//
// Many buttons emit inline `onclick` handlers that call functions exposed
// on `window` by globals.js — openDetail, openLightbox,
// openEventModal, getEvent, generateInvite, deleteEvent, setConcertTag,
// setFestivalTag, closeDetail. Keep those names stable or update globals.
//
// Tag-filter reads go through `state.activeFilters` (was the module-level
// `activeFilters` in the original single-file app.js).
// ══════════════════════════════════════════════════════════════════════

import { state, getEvent } from './state.js';
import { esc, localIso, parseDate, fmtDateShort, fmtDateLong, fmtPrice, wallLayout, eventLatestDate, eventEarliestDate, venueMapHtml, nextUpcomingDate, daysBetween, fmtCountdown, fmtMonthHeader, concertLineup, festivalLineup } from './utils.js';
import { posterEl, openLightbox } from './ui.js';
import { icon } from './icons.js';
import { getRating, ratingBarHtml, renderDetailRatings } from './ratings.js';
import { eventVisible, getListSort } from './filters.js';

let _listClickWired = false;
let _wallObserver = false;

/** Mindestbreite pro Konzertblock (px); darunter wechselt die Karte in den Kachel-Modus. */
const BLOCK_MIN_WIDTH = 320;

/** Schaltet je Karte zwischen Konzertblöcken und kompakten Datumskacheln (nur Klassen-Toggle, kein Re-Render). */
function applyCardModes() {
  const el = document.getElementById('event-list');
  if (!el) return;
  const bodies = [...el.querySelectorAll('.row-body[data-blocks]')];
  const modes = bodies.map(b => b.clientWidth / (Number(b.dataset.blocks) || 1) < BLOCK_MIN_WIDTH);
  bodies.forEach((b, i) => b.closest('.tour-row')?.classList.toggle('is-compact', modes[i]));
}

function applyLayouts() { applyWallLayout(); applyCardModes(); }

/** Berechnet Spaltenzahl/Kachelbreite der Posterwand und setzt die CSS-Variablen (kein Re-Render). */
function applyWallLayout() {
  const el = document.getElementById('event-list');
  if (!el || !el.classList.contains('poster-wall')) return;
  const n = el.querySelectorAll('.poster-card').length;
  const cs = getComputedStyle(el);
  const gap = parseFloat(cs.columnGap) || 16;
  const padTop = parseFloat(cs.paddingTop) || 0;
  const width = el.clientWidth;
  const height = window.innerHeight - el.getBoundingClientRect().top - padTop - 24;
  const { cols, tile } = wallLayout(width, height, n, gap);
  el.style.setProperty('--wall-cols', String(cols));
  el.style.setProperty('--wall-tile-max', `${Math.round(tile)}px`);
}

function eventMinPrice(ev) {
  if (ev.event_type === 'festival') {
    const p = parseFloat(ev.price);
    return isNaN(p) ? null : p;
  }
  if (!ev.concerts || !ev.concerts.length) return null;
  let min = null;
  for (const c of ev.concerts) {
    const p = parseFloat(c.price);
    if (!isNaN(p) && (min === null || p < min)) min = p;
  }
  return min;
}

function compareEvents(a, b, sort) {
  if (sort === 'date-asc' || sort === 'date-desc') {
    const ad = eventEarliestDate(a), bd = eventEarliestDate(b);
    const aE = !ad, bE = !bd;
    if (aE && bE) return 0;
    if (aE) return 1;
    if (bE) return -1;
    return sort === 'date-asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  }
  const ap = eventMinPrice(a), bp = eventMinPrice(b);
  if (ap === null && bp === null) return 0;
  if (ap === null) return 1;
  if (bp === null) return -1;
  return sort === 'price-asc' ? ap - bp : bp - ap;
}

/**
 * Render the event-list tab for the active sub-tab (`state.listSubTab`).
 * Filter `state.allEvents` via `eventVisible`, split into upcoming/past by
 * each event's latest date, sort the active group via `compareEvents` using
 * `getListSort()`, and write the card HTML to `#event-list`. Only the
 * active sub-view (upcoming or past) renders at a time.
 */
export function renderList() {
  const el = document.getElementById('event-list');
  if (!_listClickWired) {
    _listClickWired = true;
    el.addEventListener('click', e => {
      const card = e.target.closest('[data-event-id]');
      if (card) window.openDetail?.(card.dataset.eventId);
    });
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('[data-event-id]');
      if (card) { e.preventDefault(); window.openDetail?.(card.dataset.eventId); }
    });
  }
  if (!_wallObserver && typeof ResizeObserver !== 'undefined') {
    _wallObserver = true;
    new ResizeObserver(() => applyLayouts()).observe(el);
    window.addEventListener('resize', applyLayouts);
  }
  const vis = state.allEvents.filter(ev => eventVisible(ev));
  const todayIso = localIso(new Date());
  const upcoming = [], past = [];
  vis.forEach(ev => {
    const latest = eventLatestDate(ev);
    if (latest && latest < todayIso) past.push(ev);
    else upcoming.push(ev);
  });
  const sub = state.listSubTab;
  const group = sub === 'past' ? past : upcoming;
  if (!group.length) {
    el.className = '';
    const h3 = sub === 'past' ? 'Keine vergangenen Events' : 'Keine anstehenden Events';
    const p = sub === 'past' ? 'Besuchte Konzerte erscheinen hier.' : 'Leg dein erstes Event mit \u201eNeues Event\u201c an.';
    el.innerHTML = `<div class="empty-state">
      <div class="icon">${icon('guitar')}</div><h3>${h3}</h3>
      <p>${p}</p></div>`;
    return;
  }
  const sort = getListSort();
  const isPast = sub === 'past';
  const dateSort = sort === 'date-asc' || sort === 'date-desc';
  // Bei Datums-Sortierung: Sortier- und Gruppierschlüssel = nächstes anstehendes
  // Datum (anstehend) bzw. frühestes Datum (vergangen), damit Monate zusammenhängen.
  const keyOf = new Map();
  if (dateSort) group.forEach(ev => keyOf.set(ev, isPast ? eventEarliestDate(ev) : nextUpcomingDate(ev, todayIso)));
  group.sort((a, b) => {
    if (!dateSort) return compareEvents(a, b, sort);
    const ad = keyOf.get(a), bd = keyOf.get(b);
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return sort === 'date-asc' ? ad.localeCompare(bd) : bd.localeCompare(ad);
  });
  if (state.listView === 'wall') {
    el.className = 'poster-wall';
    el.innerHTML = group.map(ev => renderWallCard(ev, isPast)).join('');
    applyWallLayout();
  } else {
    el.className = 'event-rows';
    el.style.removeProperty('--wall-cols');
    el.style.removeProperty('--wall-tile-max');
    let lastMonth = null;
    el.innerHTML = group.map(ev => {
      let header = '';
      if (dateSort) {
        const key = (keyOf.get(ev) || '').slice(0, 7);
        if (key !== lastMonth) {
          lastMonth = key;
          if (key) header = `<div class="list-month-header">${esc(fmtMonthHeader(keyOf.get(ev)))}</div>`;
        }
      }
      return header + (ev.event_type === 'festival' ? renderFestCard(ev, isPast) : renderTourCard(ev, isPast));
    }).join('');
    applyCardModes(); // vor dem ersten Paint, vermeidet Flackern
  }
}

/**
 * Switch between list and poster-wall views. Updates the toggle buttons,
 * stores the choice in `state.listView` and re-renders.
 * @param {'list'|'wall'} view
 */
export function switchListView(view) {
  state.listView = view;
  document.getElementById('lview-list').classList.toggle('active', view === 'list');
  document.getElementById('lview-wall').classList.toggle('active', view === 'wall');
  renderList();
}

/**
 * Build a poster-wall card: large poster (or generated placeholder), event
 * title, date and venue overlaid at the bottom. Clicking opens the detail
 * panel like a regular card.
 * @param {import('./state.js').Event} ev
 * @param {boolean} isPast
 * @returns {string}
 */
export function renderWallCard(ev, isPast) {
  const isFest = ev.event_type === 'festival';
  const title = isFest ? esc(ev.name) : (Array.isArray(ev.artist) ? esc(ev.artist.join(' + ')) : esc(ev.artist));
  const subtitle = isFest ? '' : esc(ev.tour_name || '');
  const earliest = eventEarliestDate(ev);
  const dateStr = earliest ? fmtDateShort(earliest, { weekday: true }) : '';
  const venue = isFest ? esc(ev.venue || '') : (ev.concerts && ev.concerts.length ? esc(ev.concerts[0].venue) : '');
  const typeClass = isFest ? 'festival' : 'tour';
  const typeLabel = isFest ? 'Festival' : 'Tour';
  const posterInner = ev.poster
    ? `<img src="/api/img/${ev.poster}" alt="" loading="lazy">`
    : `<div class="poster-wall-placeholder">${isFest ? icon('disc') : icon('music')}</div>`;
  const tags = (ev.tags || []).concat(isFest ? [] : (ev.concerts || []).flatMap(c => c.tags || []));
  const hasTickets = tags.includes('tickets');
  const hasWatch = tags.includes('watchlist');
  const stripe = hasTickets ? ' has-tickets' : (hasWatch ? ' has-watch' : '');
  return `<button class="unstyled poster-card${stripe}" type="button" data-event-id="${ev.id}">
    <div class="poster-card-img">${posterInner}</div>
    <div class="poster-card-overlay">
      <span class="type-badge ${typeClass}">${typeLabel}</span>
      <div class="poster-card-title">${title}</div>
      ${subtitle ? `<div class="poster-card-subtitle">${subtitle}</div>` : ''}
      <div class="poster-card-meta">
        ${dateStr ? `<span>${icon('calendar')} ${dateStr}</span>` : ''}
        ${venue ? `<span>${icon('map-pin')} ${venue}</span>` : ''}
      </div>
    </div>
  </button>`;
}

/** Einheitliche Status-Pills (Tickets gekauft / Merkliste) für Konzertblöcke. */
function statusPillsHtml(tags) {
  return [...(tags || [])].sort((a, b) => Number(b === 'tickets') - Number(a === 'tickets')).map(t => t === 'tickets'
    ? `<span class="cb-pill tag-tickets">${icon('check')} Tickets<span class="cb-pill-more"> gekauft</span></span>`
    : `<span class="cb-pill tag-watchlist">${icon('star')} Merkliste</span>`).join('');
}

/** Kleine Icon-Marker (Tickets ✓ / Merkliste ★) für Datumskacheln. */
function tagMarksHtml(tags) {
  return (tags || []).map(t => t === 'tickets'
    ? `<span class="tile-mark tag-tickets" title="Tickets">${icon('check')}</span>`
    : `<span class="tile-mark tag-watchlist" title="Merkliste">${icon('star')}</span>`).join('');
}

function countdownHtml(dateIso) {
  const txt = dateIso ? fmtCountdown(daysBetween(localIso(new Date()), dateIso)) : '';
  return txt ? `<div class="row-countdown">${txt}</div>` : '';
}

/** Kopfblock einer Zeilen-Karte: Badge + Titel + Countdown, darunter Tour/Support. */
function rowHeadHtml({ badge, title, subtitle, support, countdown }) {
  const second = [subtitle ? `<span class="event-subtitle">${subtitle}</span>` : '', support ? `<span class="event-support"><span>Support: </span>${support}</span>` : ''].filter(Boolean).join(' \u00b7 ');
  return `<div class="row-head">
    <div class="row-head-line">${badge}<div class="event-title">${title}</div>${countdown}</div>
    ${second ? `<div class="row-head-sub">${second}</div>` : ''}
  </div>`;
}

/** Karte: Poster (volle Breite, ungeschnitten) links, Kopf + Body rechts. */
function rowHtml(cls, id, label, poster, placeholder, head, body, blockCount = 0) {
  return `<div class="event-card tour-row${cls}" role="button" tabindex="0" data-event-id="${id}" aria-label="${label}">
    ${posterEl(poster, placeholder)}
    <div class="row-main">${rowHeadHtml(head)}<div class="row-body"${blockCount ? ` data-blocks="${blockCount}"` : ''}>${body}</div></div>
  </div>`;
}

/** Lineup-Sektion: Headliner (Anzeigeschrift, Typfarbe) + "mit" Support-Chips; Festival: Band-Chips mit "+N". */
function lineupHtml({ headliners = [], supports = [], assumed = false, bands = null }) {
  if (bands) {
    const { shown, more } = festivalLineup(bands);
    if (!shown.length) return '';
    return `<div class="cb-lineup"><div class="lu-chips lu-bands">${shown.map(a => `<span class="lu-chip lu-band">${esc(a)}</span>`).join('')}${more ? `<span class="lu-chip lu-more">+${more}</span>` : ''}</div></div>`;
  }
  if (!headliners.length && !supports.length) return '';
  return `<div class="cb-lineup">
    ${headliners.length ? `<div class="lu-head">${headliners.map(esc).join('<span class="lu-plus"> + </span>')}</div>` : ''}
    ${supports.length ? `<div class="lu-chips${assumed ? ' is-assumed' : ''}"${assumed ? ' title="Support laut Tour, Anwesenheit unbestätigt"' : ''}><span class="lu-with">mit</span>${supports.map(a => `<span class="lu-chip">${esc(a)}</span>`).join('')}</div>` : ''}
  </div>`;
}

/** Konzertblock: Datum | Ort/Zeit | Lineup | Preis, Ticket, Tags als eine Einheit (Container-Query-fähig). */
function concertBlockHtml(c, { festival = false, bands = null, tour = null, isPast = false } = {}) {
  const d = parseDate(c.date);
  const done = !!tour && !isPast && (c.end_date || c.date) < localIso(new Date());
  const endLabel = c.end_date ? `<div class="date-end">${icon('arrow-right')} ${fmtDateShort(c.end_date, { weekday: true })}</div>` : '';
  const lineup = lineupHtml(festival ? { bands } : concertLineup(tour, c));
  const hasRight = c.price || c.ticket_link || (c.tags || []).length;
  return `<div class="cblock${done ? ' is-done' : ''}"><div class="cb-grid">
    <div class="cb-date date-block${festival ? ' festival-date' : ''}">
      <div class="date-weekday">${d.weekday}</div>
      <div class="date-day">${d.day}</div>
      <div class="date-month">${d.month}</div>
      <div class="date-year">${d.year}</div>
      ${endLabel}
    </div>
    <div class="cb-loc">
      <div class="concert-venue">${esc(c.venue) || '\u2013'}</div>
      <div class="concert-where">${icon('map-pin')} ${esc(c.city)}${c.time ? ` \u00b7 ${icon('clock')} ${esc(c.time)} Uhr` : ''}</div>
    </div>
    ${lineup}
    ${hasRight ? `<div class="cb-side">
      <div class="cb-price-row">
        <span class="cb-price${c.price ? '' : ' is-empty'}">${c.price ? fmtPrice(c.price) : '\u2013'}</span>
        ${c.ticket_link ? `<a href="${esc(c.ticket_link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="cb-btn" title="Ticketlink" aria-label="Ticketlink">${icon('ticket')}<span class="cb-btn-label">Tickets</span></a>` : ''}
      </div>
      ${(c.tags || []).length ? `<div class="cb-pills">${statusPillsHtml(c.tags)}</div>` : ''}
    </div>` : ''}
  </div></div>`;
}

/**
 * Build the HTML string for a tour event card ("Tour-Zeile"). When tag
 * filters are active (`state.activeFilters`), only concerts carrying a
 * filtered tag are listed. Ab 2 sichtbaren Konzerten erscheinen Datumskacheln
 * (max. 12 + "weitere"), sonst ein breiter Detailblock. The whole card opens the
 * detail panel via the `data-event-id` click delegation in renderList.
 * @param {import('./state.js').Event} tour
 * @param {boolean} isPast whether the tour is in the past (enables ratings)
 * @returns {string}
 */
export function renderTourCard(tour, isPast) {
  const concerts = state.activeFilters.size
    ? tour.concerts.filter(c => [...state.activeFilters].some(f => c.tags.includes(f)))
    : tour.concerts;
  const todayIso = localIso(new Date());
  const next = isPast ? '' : nextUpcomingDate({ ...tour, concerts }, todayIso);
  let body;
  if (concerts.length >= 2) {
    const MAX_TILES = 12;
    const tiles = concerts.slice(0, MAX_TILES).map(c => renderConcertRow(c, tour.id, isPast)).join('');
    const more = concerts.length > MAX_TILES ? `<div class="date-tile cell date-tile-more">+ ${concerts.length - MAX_TILES} weitere</div>` : '';
    const blocks = concerts.map(c => concertBlockHtml(c, { tour, isPast })).join('');
    body = `<div class="blocks">${blocks}</div><div class="cells"><div class="tile-grid">${tiles}${more}</div></div>`;
  } else {
    body = concerts.length ? `<div class="blocks">${concertBlockHtml(concerts[0], { tour, isPast })}</div>` : '';
  }
  const blockCount = concerts.length >= 2 ? concerts.length : 0;
  return rowHtml('', tour.id, `${esc([].concat(tour.artist).join(" + "))} ${esc(tour.tour_name||'')}`, tour.poster, icon('music'), {
    badge: '<span class="type-badge tour">Tour</span>',
    title: esc([].concat(tour.artist).join(" + ")), subtitle: esc(tour.tour_name), support: tour.support.length ? esc(tour.support.join(' \u00b7 ')) : '',
    countdown: countdownHtml(next),
  }, body, blockCount);
}

/**
 * Build the HTML string for a single concert date tile inside a tour row.
 * `eventId` and `isPast` are accepted for parity with the tour-card caller
 * (ratings/tag hooks live in the detail view, not the tile). Concerts that
 * already took place within an upcoming tour are dimmed.
 * @param {any} c concert descriptor
 * @param {string} eventId parent tour id
 * @param {boolean} isPast whether the whole tour is in the past
 * @returns {string}
 */
export function renderConcertRow(c, eventId, isPast) {
  const d = parseDate(c.date);
  const nowYear = new Date().getFullYear();
  const done = !isPast && (c.end_date || c.date) < localIso(new Date());
  const marks = tagMarksHtml(c.tags);
  return `<div class="date-tile cell${done ? ' is-done' : ''}">
    <div class="tile-date"><span class="tile-weekday">${d.weekday}</span> <span class="tile-day">${d.day}</span> <span class="tile-month">${d.month}${d.year !== nowYear ? ' ' + d.year : ''}</span></div>
    <div class="tile-city">${esc(c.city)}</div>
    <div class="tile-venue">${esc(c.venue)}</div>
    ${(c.time || marks) ? `<div class="tile-foot">${c.time ? `<span class="tile-time">${esc(c.time)} Uhr</span>` : ''}${marks}</div>` : ''}
  </div>`;
}

/**
 * Build the HTML string for a festival event card (Zeile mit breitem
 * Detailblock inkl. Band-Chips). Opens the detail panel via `data-event-id`.
 * @param {import('./state.js').Event} fest
 * @param {boolean} isPast whether the festival is in the past
 * @returns {string}
 */
export function renderFestCard(fest, isPast) {
  const next = isPast ? '' : nextUpcomingDate(fest, localIso(new Date()));
  return rowHtml(' festival', fest.id, esc(fest.name), fest.poster, icon('disc'), {
    badge: '<span class="type-badge festival">Festival</span>',
    title: esc(fest.name), subtitle: '', support: '', countdown: countdownHtml(next),
  }, `<div class="blocks">${concertBlockHtml(fest, { festival: true, bands: fest.bands_to_watch || [] })}</div>`);
}

/**
 * Open the detail panel for event `id`. Reads fresh data from
 * `state.allEvents` via `getEvent`, fills `#detail-panel` with
 * `buildDetailHTML(ev)`, shows the backdrop and locks body scroll.
 * @param {string} id
 */
export function openDetail(id) {
  const ev = getEvent(id);
  if (!ev) return;
  state.openDetailId = id;
  const bd = document.getElementById('detail-bd');
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = buildDetailHTML(ev);
  bd.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/** Close the detail panel and restore body scroll. */
export function closeDetail() {
  state.openDetailId = null;
  document.getElementById('detail-bd').classList.remove('open');
  document.body.style.overflow = '';
}

/**
 * Close the detail panel when the click lands on the backdrop itself
 * (i.e. outside the panel content).
 * @param {MouseEvent} e
 */
export function closeDetailOnBg(e) {
  if (e.target === document.getElementById('detail-bd')) closeDetail();
}

/**
 * Build the full detail-panel HTML for an event. A festival branch and a
 * tour branch diverge on `ev.event_type`. Past events render per-act rating
 * bars via `renderDetailRatings`. Inline `onclick` handlers call window
 * globals (exposed by globals.js): `openLightbox`, `openEventModal`,
 * `getEvent`, `generateInvite`, `deleteEvent`, `setFestivalTag`,
 * `setConcertTag`, `closeDetail`.
 * @param {import('./state.js').Event} ev
 * @returns {string}
 */
export function buildDetailHTML(ev) {
  const ps = ev.poster
    ? `<img class="detail-poster" src="/api/img/${ev.poster}" alt=""
        onclick="openLightbox('/api/img/${ev.poster}')"
        style="cursor:zoom-in" title="Poster vergrößern">`
    : `<div class="detail-poster-ph">${ev.event_type==='festival'?icon('disc'):icon('music')}</div>`;

  const commentBlock = ev.comment
    ? `<div class="detail-comment"><div class="detail-comment-label">Notiz</div>${esc(ev.comment)}</div>` : '';

  if (ev.event_type === 'festival') {
    const todayIsoF = localIso(new Date());
    const evIsPastF = !!(eventLatestDate(ev) && eventLatestDate(ev) < todayIsoF);
    const allBandsF = ev.bands_to_watch||[];
    const d = parseDate(ev.date);
    const endLabel = ev.end_date ? `<div class="date-end">${icon('arrow-right')} ${fmtDateShort(ev.end_date)}</div>` : '';
    const tagHtml = (ev.tags||[]).map(t => `<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?icon('check')+' Tickets':icon('star')+' Merkliste'}</span>`).join('');
    const bandsHtml = allBandsF.map(b=>`<span class="band-chip">${esc(b)}</span>`).join('');
    const festLogoHtml = ev.logo
      ? `<img class="detail-festival-logo" src="/api/img/${ev.logo}" alt=""
          onclick="openLightbox('/api/img/${ev.logo}')"
          style="cursor:zoom-in" title="Logo vergrößern">`
      : '';
    return `
      <div class="detail-header">
        ${ps}
        <div class="detail-meta">
          <div style="display:flex;gap:7px;align-items:center;margin-bottom:4px">
            <span class="type-badge festival">Festival</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            ${festLogoHtml}
            <div class="detail-title">${esc(ev.name)}</div>
          </div>
          <div class="detail-subtitle">${esc(ev.tour_name||'')}</div>
        </div>
        <div class="detail-close-row">
          <button class="btn-icon" onclick="openEventModal(getEvent('${ev.id}'));closeDetail()" title="Event bearbeiten">${icon('pencil')}</button>
          <button class="btn-icon" onclick="generateInvite('${ev.id}')" title="Event-Einladung erstellen">${icon('link')}</button>
          <button class="btn-icon delete" onclick="showConfirm('Event löschen?',()=>{deleteEvent('${ev.id}');closeDetail()})" title="Event löschen">${icon('trash-2')}</button>
          <button class="btn-close" onclick="closeDetail()">${icon('x')}</button>
        </div>
      </div>
      <div class="detail-concerts">
        <div class="detail-concert-item">
          <div class="date-block festival-date">
            <div class="date-day">${d.day}</div>
            <div class="date-month">${d.month}</div>
            <div class="date-year">${d.year}</div>
            ${endLabel}
          </div>
          <div class="concert-info">
            <div class="concert-venue">${esc(ev.venue)||'–'}</div>
            <div class="concert-city">${icon('map-pin')} ${esc(ev.city)}</div>
            ${ev.time ? `<div class="concert-time">${icon('clock')} ${esc(ev.time)} Uhr</div>` : ''}
            ${bandsHtml ? `<div class="concert-support-acts">${bandsHtml}</div>` : ''}
            ${ev.venue ? venueMapHtml(ev.venue, ev.city) : ''}
          </div>
          <div class="concert-right">
            ${ev.price ? `<div class="concert-price">${fmtPrice(ev.price)}</div>` : ''}
            ${ev.ticket_link ? `<a href="${esc(ev.ticket_link)}" target="_blank" rel="noopener" class="ticket-link-btn">Ticketlink</a>` : ''}
            <div class="tags">${tagHtml}</div>
          </div>
        </div>
      </div>
      ${evIsPastF && allBandsF.length ? `<div style="padding:12px 22px;border-top:1px solid var(--border)">${renderDetailRatings(ev.id, allBandsF)}</div>` : ''}
      <div class="detail-tag-row">
        <button class="tag-toggle ${(ev.tags||[]).includes('tickets')?'active-tickets':''}"
          onclick="setFestivalTag('${ev.id}','tickets',${!(ev.tags||[]).includes('tickets')});void 0">
          ${icon('ticket')} Tickets gekauft
        </button>
        <button class="tag-toggle ${(ev.tags||[]).includes('watchlist')?'active-watchlist':''}"
          onclick="setFestivalTag('${ev.id}','watchlist',${!(ev.tags||[]).includes('watchlist')});void 0">
          ${icon('bookmark')} Merkliste
        </button>
      </div>
      ${commentBlock}`;
  }

  // Tour
  const concerts = ev.concerts || [];
  const todayIso2 = localIso(new Date());
  const evIsPast2 = !!(eventLatestDate(ev) && eventLatestDate(ev) < todayIso2);
  const concHtml = concerts.map(c => {
    const d = parseDate(c.date);
    const endLabel = c.end_date ? `<div class="date-end">${icon('arrow-right')} ${fmtDateShort(c.end_date)}</div>` : '';
    const tagHtml = (c.tags||[]).map(t=>`<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?icon('check')+' Tickets':icon('star')+' Merkliste'}</span>`).join('');
    const actHtml = (c.support_present||[]).map(a=>`<span class="act-chip">${esc(a)}</span>`).join('');
    const allActs = [c.artist, ...(c.support_present||[])].filter(Boolean);
    const detailRatingsHtml = evIsPast2 ? renderDetailRatings(ev.id, allActs) : '';
    return `<div class="detail-concert-item">
      <div class="date-block">
        <div class="date-day">${d.day}</div><div class="date-month">${d.month}</div>
        <div class="date-year">${d.year}</div>${endLabel}
      </div>
      <div class="concert-info">
        <div class="concert-venue">${esc(c.venue)}</div>
        <div class="concert-city">${icon('map-pin')} ${esc(c.city)}</div>
        ${c.time?`<div class="concert-time">${icon('clock')} ${esc(c.time)} Uhr</div>`:''}
        ${actHtml?`<div class="concert-support-acts">${actHtml}</div>`:''}
        ${c.venue ? venueMapHtml(c.venue, c.city) : ''}
      </div>
      <div class="concert-right">
        ${c.price?`<div class="concert-price">${fmtPrice(c.price)}</div>`:''}
        ${c.ticket_link?`<a href="${esc(c.ticket_link)}" target="_blank" rel="noopener" class="ticket-link-btn">Ticketlink</a>`:''}
        <div class="tags">
          <button class="tag-toggle ${(c.tags||[]).includes('tickets')?'active-tickets':''}"
            onclick="event.stopPropagation();setConcertTag('${ev.id}','${c.id}','tickets',${!(c.tags||[]).includes('tickets')});void 0">
            ${icon('ticket')} Tickets
          </button>
          <button class="tag-toggle ${(c.tags||[]).includes('watchlist')?'active-watchlist':''}"
            onclick="event.stopPropagation();setConcertTag('${ev.id}','${c.id}','watchlist',${!(c.tags||[]).includes('watchlist')});void 0">
            ${icon('bookmark')} Merkliste
          </button>
        </div>
      </div>
      ${detailRatingsHtml ? `<div class="detail-ratings-block">${detailRatingsHtml}</div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="detail-header">
      ${ps}
      <div class="detail-meta">
        <div style="display:flex;gap:7px;margin-bottom:4px"><span class="type-badge tour">Tour</span></div>
        <div class="detail-title">${Array.isArray(ev.artist) ? esc(ev.artist.join(' + ')) : esc(ev.artist)}</div>
        <div class="detail-subtitle">${esc(ev.tour_name)}</div>
        ${ev.support.length?`<div class="detail-support"><span style="color:var(--muted)">Support: </span>${esc(ev.support.join(' · '))}</div>`:''}
      </div>
      <div class="detail-close-row">
        <button class="btn-icon" onclick="openEventModal(getEvent('${ev.id}'));closeDetail()">${icon('pencil')}</button>
        <button class="btn-icon" onclick="generateInvite('${ev.id}')" title="Einladung erstellen">${icon('link')}</button>
        <button class="btn-icon delete" onclick="showConfirm('Event löschen?',()=>{deleteEvent('${ev.id}');closeDetail()})">${icon('trash-2')}</button>
        <button class="btn-close" onclick="closeDetail()">${icon('x')}</button>
      </div>
    </div>
    <div class="detail-concerts">${concHtml}</div>
    ${commentBlock}`;
}

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
import { esc, localIso, parseDate, fmtDateShort, fmtDateLong, fmtPrice, eventLatestDate, eventEarliestDate, venueMapHtml } from './utils.js';
import { posterEl, openLightbox } from './ui.js';
import { icon } from './icons.js';
import { getRating, ratingBarHtml, renderDetailRatings } from './ratings.js';
import { eventVisible, getListSort } from './filters.js';

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
    const h3 = sub === 'past' ? 'Keine vergangenen Events' : 'Keine anstehenden Events';
    const p = sub === 'past' ? 'Besuchte Konzerte erscheinen hier.' : 'Leg dein erstes Event mit \u201eNeues Event\u201c an.';
    el.innerHTML = `<div class="empty-state">
      <div class="icon">\uD83C\uDFB8</div><h3>${h3}</h3>
      <p>${p}</p></div>`;
    return;
  }
  group.sort((a, b) => compareEvents(a, b, getListSort()));
  const isPast = sub === 'past';
  if (state.listView === 'wall') {
    el.className = 'poster-wall';
    el.innerHTML = group.map(ev => renderWallCard(ev, isPast)).join('');
  } else {
    el.className = '';
    el.innerHTML = group.map(ev =>
      ev.event_type === 'festival' ? renderFestCard(ev, isPast) : renderTourCard(ev, isPast)
    ).join('');
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
  const dateStr = earliest ? fmtDateShort(earliest) : '';
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
  return `<div class="poster-card${stripe}" onclick="openDetail('${ev.id}')">
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
  </div>`;
}

/**
 * Build the HTML string for a tour event card. When tag filters are active
 * (`state.activeFilters`), only concerts carrying a filtered tag are
 * listed; otherwise all concerts render. The whole card opens the detail
 * panel via the inline `openDetail(...)` onclick (window global).
 * @param {import('./state.js').Event} tour
 * @param {boolean} isPast whether the tour is in the past (enables ratings)
 * @returns {string}
 */
export function renderTourCard(tour, isPast) {
  const ps = posterEl(tour.poster, icon('music'));
  const concerts = state.activeFilters.size
    ? tour.concerts.filter(c => [...state.activeFilters].some(f => c.tags.includes(f)))
    : tour.concerts;
  const concertsHtml = concerts.map(c => renderConcertRow(c, tour.id, isPast)).join('');
  const earliest = concerts.length ? concerts.reduce((min, c) => !min || c.date < min ? c.date : min, null) : null;
  return `<div class="event-card" onclick="openDetail('${tour.id}')">
    <div class="event-header">
      ${ps}
      <div class="event-meta">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
          <span class="type-badge tour">Tour</span>
        </div>
        <div class="event-title">${esc(tour.artist)}</div>
        <div class="event-subtitle">${esc(tour.tour_name)}</div>
        ${tour.support.length ? `<div class="event-support"><span>Support: </span>${esc(tour.support.join(' · '))}</div>` : ''}
      </div>
    </div>
    <div class="concert-list">${concertsHtml}</div>
  </div>`;
}

/**
 * Build the HTML string for a single concert row inside a tour card.
 * `eventId` and `isPast` are accepted for parity with the tour-card caller
 * (ratings/tag hooks live in the detail view, not the row).
 * @param {any} c concert descriptor
 * @param {string} eventId parent tour id
 * @param {boolean} isPast whether the concert is in the past
 * @returns {string}
 */
export function renderConcertRow(c, eventId, isPast) {
  const d = parseDate(c.date);
  const tagHtml = (c.tags||[]).map(t => `<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?icon('check')+' Tickets':icon('star')+' Merkliste'}</span>`).join('');
  const actHtml = (c.support_present||[]).map(a => `<span class="act-chip">${esc(a)}</span>`).join('');
  const endLabel = c.end_date ? `<div class="date-end">${icon('arrow-right')} ${fmtDateShort(c.end_date)}</div>` : '';
  return `<div class="concert-item">
    <div class="date-block">
      <div class="date-day">${d.day}</div>
      <div class="date-month">${d.month}</div>
      <div class="date-year">${d.year}</div>
      ${endLabel}
    </div>
    <div class="concert-info">
      <div class="concert-venue">${esc(c.venue)}</div>
      <div class="concert-city">${icon('map-pin')} ${esc(c.city)}</div>
      ${c.time ? `<div class="concert-time">${icon('clock')} ${esc(c.time)} Uhr</div>` : ''}
      ${actHtml ? `<div class="concert-support-acts">${actHtml}</div>` : ''}
    </div>
    <div class="concert-right">
      ${c.price ? `<div class="concert-price">${fmtPrice(c.price)}</div>` : ''}
      ${c.ticket_link ? `<a href="${esc(c.ticket_link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="ticket-link-btn">Ticketlink</a>` : ''}
      <div class="tags">${tagHtml}</div>
    </div>
  </div>`;
}

/**
 * Build the HTML string for a festival event card. Past festivals compute
 * a rating bar per band in `bands_to_watch` (rendered in the detail view).
 * The whole card opens the detail panel via the inline `openDetail(...)`.
 * @param {import('./state.js').Event} fest
 * @param {boolean} isPast whether the festival is in the past
 * @returns {string}
 */
export function renderFestCard(fest, isPast) {
  const ps = posterEl(fest.poster, icon('disc'));
  const d = parseDate(fest.date);
  const endLabel = fest.end_date ? `<div class="date-end">${icon('arrow-right')} ${fmtDateShort(fest.end_date)}</div>` : '';
  const tagHtml = (fest.tags||[]).map(t => `<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?icon('check')+' Tickets':icon('star')+' Merkliste'}</span>`).join('');
  const bandsHtml = (fest.bands_to_watch||[]).map(b => `<span class="band-chip">${esc(b)}</span>`).join('');
  const allBands = fest.bands_to_watch||[];
  const ratingsHtml = isPast ? allBands.map(b => ratingBarHtml(fest.id, b, true)).join('') : '';
  return `<div class="event-card festival" onclick="openDetail('${fest.id}')">
    <div class="event-header">
      ${ps}
      <div class="event-meta">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px">
          <span class="type-badge festival">Festival</span>
        </div>
        <div class="event-title">${esc(fest.name)}</div>
      </div>
    </div>
    <div class="concert-item">
      <div class="date-block festival-date">
        <div class="date-day">${d.day}</div>
        <div class="date-month">${d.month}</div>
        <div class="date-year">${d.year}</div>
        ${endLabel}
      </div>
      <div class="concert-info">
        <div class="concert-venue">${esc(fest.venue)||'–'}</div>
        <div class="concert-city">${icon('map-pin')} ${esc(fest.city)}</div>
        ${fest.time ? `<div class="concert-time">${icon('clock')} ${esc(fest.time)} Uhr</div>` : ''}
        ${bandsHtml ? `<div class="concert-support-acts">${bandsHtml}</div>` : ''}
      </div>
      <div class="concert-right">
        ${fest.price ? `<div class="concert-price">${fmtPrice(fest.price)}</div>` : ''}
        <div class="tags">${tagHtml}</div>
      </div>
    </div>
  </div>`;
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
  const bd = document.getElementById('detail-bd');
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = buildDetailHTML(ev);
  bd.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/** Close the detail panel and restore body scroll. */
export function closeDetail() {
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
          <button class="btn-icon delete" onclick="if(confirm('Event löschen?')){deleteEvent('${ev.id}');closeDetail()}" title="Event löschen">${icon('trash-2')}</button>
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
          <button class="tag-toggle ${c.tags.includes('tickets')?'active-tickets':''}"
            onclick="event.stopPropagation();setConcertTag('${ev.id}','${c.id}','tickets',${!c.tags.includes('tickets')});void 0">
            ${icon('ticket')} Tickets
          </button>
          <button class="tag-toggle ${c.tags.includes('watchlist')?'active-watchlist':''}"
            onclick="event.stopPropagation();setConcertTag('${ev.id}','${c.id}','watchlist',${!c.tags.includes('watchlist')});void 0">
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
        <button class="btn-icon delete" onclick="if(confirm('Event löschen?')){deleteEvent('${ev.id}');closeDetail()}">${icon('trash-2')}</button>
        <button class="btn-close" onclick="closeDetail()">${icon('x')}</button>
      </div>
    </div>
    <div class="detail-concerts">${concHtml}</div>
    ${commentBlock}`;
}

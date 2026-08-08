// ══════════════════════════════════════════════════════════════════════
// calendar.js — month-grid calendar tab
//
// Renders a classic month grid for `state.calYear` / `state.calMonth`.
// Visible events (per `eventVisible`) are placed on the day cells matching
// their date (or date range), coloured by type (tour / festival) or tag
// (tickets / watchlist). `calNav` shifts the viewed month and wraps the
// year. The detail view is opened through an inline `onclick` attribute
// that calls the global `openDetail(id)`; `openDetail` is deliberately not
// imported — it lives in list.js, and importing it would create a cycle
// (list.js → calendar.js → list.js). The hover popover helpers are imported
// from ui.js (no cycle, since ui.js imports neither calendar nor list).
// ══════════════════════════════════════════════════════════════════════

import { state, today } from './state.js';
import { esc, localIso } from './utils.js';
import { eventVisible } from './filters.js';
import { showPopover, hidePopover } from './ui.js';

/**
 * Render the month grid for `state.calYear` / `state.calMonth`. Tours are
 * expanded to their individual concerts, festivals contribute a single date
 * range; each entry is matched to a day cell and coloured by type/tag.
 * Today's cell receives a `today` class. Clicking an event opens the detail
 * view via an inline `onclick` that calls the global `openDetail(id)`;
 * hovering a tour concert shows the popover.
 */
export function renderCalendar() {
  const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni',
    'Juli','August','September','Oktober','November','Dezember'];
  document.getElementById('cal-title').textContent = `${MONTHS_DE[state.calMonth]} ${state.calYear}`;
  const grid = document.getElementById('cal-grid');
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  let dow = new Date(state.calYear, state.calMonth, 1).getDay();
  dow = dow === 0 ? 6 : dow - 1;
  const dim  = new Date(state.calYear, state.calMonth + 1, 0).getDate();
  const dimp = new Date(state.calYear, state.calMonth, 0).getDate();
  const total = Math.ceil((dow + dim) / 7) * 7;

  const entries = [];
  state.allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      entries.push({ iso: ev.date, end_iso: ev.end_date, label: ev.name, type: 'festival', tags: ev.tags || [], id: ev.id });
    } else {
      (ev.concerts || []).forEach(c => {
        const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        entries.push({ iso: c.date, end_iso: c.end_date, label: artistLabel, type: 'tour', tags: c.tags || [], data: c, id: ev.id });
      });
    }
  });

  for (let i = 0; i < total; i++) {
    let dayNum, isOther = false, cellDate;
    if (i < dow)          { dayNum = dimp - dow + i + 1; isOther = true; cellDate = new Date(state.calYear, state.calMonth - 1, dayNum); }
    else if (i >= dow+dim){ dayNum = i - dow - dim + 1;  isOther = true; cellDate = new Date(state.calYear, state.calMonth + 1, dayNum); }
    else                  { dayNum = i - dow + 1;                       cellDate = new Date(state.calYear, state.calMonth,     dayNum); }

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (isOther ? ' other-month' : '') +
      (cellDate.toDateString() === today.toDateString() ? ' today' : '');

    const dateDiv = document.createElement('div');
    dateDiv.className = 'cal-date'; dateDiv.textContent = dayNum;
    cell.appendChild(dateDiv);

    const iso = localIso(cellDate);
    const evDiv = document.createElement('div');
    evDiv.className = 'cal-events';

    entries.filter(e => e.iso === iso || (e.end_iso && e.iso <= iso && e.end_iso >= iso))
      .forEach(e => {
        const el = document.createElement('div');
        const cls = e.type === 'festival' ? 'ev-festival'
          : e.type === 'tour' ? 'ev-tour'
          : e.tags.includes('tickets') ? 'ev-tickets'
          : e.tags.includes('watchlist') ? 'ev-watchlist' : 'ev-tour';
        el.className = 'cal-event' + (cls ? ' ' + cls : '');
        el.innerHTML = esc(e.label);
        el.setAttribute('onclick', "event.stopPropagation();openDetail('" + e.id + "')");
        if (e.data) {
          el.addEventListener('mouseenter', evt => showPopover(evt, e.data));
          el.addEventListener('mouseleave', hidePopover);
        }
        evDiv.appendChild(el);
      });

    cell.appendChild(evDiv);
    grid.appendChild(cell);
  }
}

/**
 * Move the calendar view by `d` months (negative = backwards), wrapping the
 * year at the month boundaries, then re-render. Bound to the ‹ / › buttons.
 * @param {number} d months to advance (may be negative)
 */
export function calNav(d) {
  state.calMonth += d;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  if (state.calMonth < 0)  { state.calMonth = 11; state.calYear--; }
  renderCalendar();
}

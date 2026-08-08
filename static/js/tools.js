// ══════════════════════════════════════════════════════════════════════
// tools.js — miscellaneous tools: location settings, backup/restore,
// statistics, and data export (CSV / iCal / standalone HTML)
//
// Grouped here because none of these features is large enough to warrant
// its own module, yet all share the same dependencies (state, utils, ui,
// api, theme). Several entry points are referenced from inline onclick
// handlers in the rendered HTML (openStatistics, showStatDetail, …) —
// those strings stay verbatim; the glue module attaches the exports to
// window so the handlers resolve.
//
// Bug fixes folded in during extraction (see DESIGN.md §9):
//   • Removed the dead local `let _statEvents = s.allTicketEvents` in
//     renderStatsHtml that shadowed the module global.
//   • Removed the two local `fmtPrice` definitions (renderStatsHtml,
//     showStatDetail) and use the unified German-comma `fmtPrice` from
//     utils.js instead.
//   • `_locationSettings`, `_statEvents`, `ratings`, `_notifications`,
//     `allEvents` module-globals moved into the shared `state` object.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { esc, localIso, parseDate, fmtDateShort, fmtPrice, dlBlob, eventLatestDate, eventEarliestDate } from './utils.js';
import { openModal, closeModal, closeDrawer } from './ui.js';
import { fetchAll } from './api.js';
import { loadTheme, loadColors } from './theme.js';
import { updateNotifBadge } from './notifications.js';
import { icon } from './icons.js';

// ── Location settings ─────────────────────────────────────────────────

/** Open the location-settings modal, pre-filling fields from `state.locationSettings`. */
export function openLocationSettings() {
  closeDrawer();
  document.getElementById('location-city').value = state.locationSettings.city || '';
  document.getElementById('location-preferred').value = (state.locationSettings.preferred || []).join(', ');
  openModal('location-modal');
}

/** Read the location form, persist to `state.locationSettings` + localStorage, close the modal. */
export function saveLocationSettings() {
  const city = document.getElementById('location-city').value.trim();
  const preferredStr = document.getElementById('location-preferred').value;
  const preferred = preferredStr.split(',').map(s => s.trim()).filter(s => s);
  state.locationSettings = { city, preferred };
  localStorage.setItem('kp-location', JSON.stringify(state.locationSettings));
  closeModal('location-modal');
}

/** The user's home city (empty string when unset). */
export function getLocationCity() { return state.locationSettings.city || ''; }

/** The user's list of preferred cities (empty array when unset). */
export function getPreferredCities() { return state.locationSettings.preferred || []; }

// ── Backup & Restore ──────────────────────────────────────────────────

/** Open the backup modal, clearing any previous status message. */
export function openBackupModal() {
  closeDrawer();
  document.getElementById('backup-status').innerHTML = '';
  openModal('backup-modal');
}

/** Fetch events/artists/venues + local settings and download a versioned JSON backup. */
export async function exportBackup() {
  const [evR, aR, vcR] = await Promise.all([
    fetch('/api/events'), fetch('/api/artists'), fetch('/api/venues-catalogue')
  ]);
  const events = await evR.json();
  const artists = await aR.json();
  const venues = await vcR.json();

  const backup = {
    version: 2,
    exported: new Date().toISOString(),
    events,
    artists,
    venues,
    settings: {
      location: state.locationSettings,
      theme: localStorage.getItem('kp-theme'),
      colors: JSON.parse(localStorage.getItem('kp-colors') || '{}'),
      customCss: localStorage.getItem('kp-custom-css') || ''
    },
    ratings: JSON.parse(localStorage.getItem('kp-ratings') || '{}'),
    notifications: JSON.parse(localStorage.getItem('kp-notifs') || '[]')
  };

  dlBlob(
    JSON.stringify(backup, null, 2),
    `konzertplaner-backup-${new Date().toISOString().split('T')[0]}.json`,
    'application/json'
  );

  document.getElementById('backup-status').innerHTML = `<span style="color:var(--tickets-color)">${icon('check')} Backup erfolgreich heruntergeladen</span>`;
}

/**
 * Parse a backup file, POST its events/artists/venues to the server,
 * restore local settings (theme/colors/location), ratings, notifications,
 * then reload all data.
 * @param {HTMLInputElement} input
 */
export async function importBackup(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const backup = JSON.parse(text);

    if (!backup.version || !backup.events) {
      throw new Error('Ungültiges Backup-Format');
    }

    for (const ev of backup.events) {
      await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ev)
      });
    }

    for (const a of (backup.artists || [])) {
      await fetch('/api/artists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: a.name, logo: a.logo, photo: a.photo, eventim_name: a.eventim_name })
      });
    }

    for (const v of (backup.venues || [])) {
      await fetch('/api/venues-catalogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: v.name, city: v.city })
      });
    }

    if (backup.settings) {
      if (backup.settings.location) {
        state.locationSettings = backup.settings.location;
        localStorage.setItem('kp-location', JSON.stringify(state.locationSettings));
      }
      if (backup.settings.theme) {
        localStorage.setItem('kp-theme', backup.settings.theme);
        loadTheme();
      }
      if (backup.settings.colors) {
        localStorage.setItem('kp-colors', JSON.stringify(backup.settings.colors));
        loadColors();
      }
      if (backup.settings.customCss) {
        localStorage.setItem('kp-custom-css', backup.settings.customCss);
      }
    }

    if (backup.ratings) {
      localStorage.setItem('kp-ratings', JSON.stringify(backup.ratings));
      state.ratings = backup.ratings;
    }

    if (backup.notifications) {
      localStorage.setItem('kp-notifs', JSON.stringify(backup.notifications.slice(-50)));
      state.notifications = backup.notifications.slice(-50);
      updateNotifBadge();
    }

    document.getElementById('backup-status').innerHTML = `<span style="color:var(--tickets-color)">${icon('check')} Backup erfolgreich importiert</span>`;

    await fetchAll();
  } catch (err) {
    document.getElementById('backup-status').innerHTML = '<span style="color:#f87171">Fehler: ' + err.message + '</span>';
  }

  input.value = '';
}

// ── Statistics ────────────────────────────────────────────────────────

/** Compute stats, store the ticketed events on `state.statEvents`, render and open the modal. */
export function openStatistics() {
  closeDrawer();
  const stats = calculateStats();
  state.statEvents = stats.allTicketEvents;
  document.getElementById('stats-content').innerHTML = renderStatsHtml(stats);
  openModal('stats-modal');
}

/**
 * Aggregate totals over `state.allEvents`: concert/festival counts, spend,
 * per-year/per-artist/per-venue breakdowns, upcoming vs past, and the list
 * of ticketed events reused by the detail view.
 */
export function calculateStats() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;
  const twoYearsAgo = thisYear - 2;

  let totalConcerts = 0;
  let totalFestivals = 0;
  let totalSpent = 0;
  let byYear = {};
  let byArtist = {};
  let byVenue = {};
  let upcoming = 0;
  let past = 0;
  let allTicketEvents = [];

  state.allEvents.forEach(ev => {
    const evTags = ev.tags || [];
    const hasTickets = evTags.includes('tickets');

    if (ev.event_type === 'festival') {
      if (hasTickets) {
        totalFestivals++;
        const year = ev.date ? ev.date.substring(0, 4) : 'unbekannt';
        byYear[year] = (byYear[year] || 0) + 1;
        if (ev.venue) byVenue[ev.venue] = (byVenue[ev.venue] || 0) + 1;
        const price = parseFloat(ev.price) || 0;
        if (price > 0) totalSpent += price;
        if (ev.date && ev.date >= thisYear + '-01-01') upcoming++;
        else past++;
        allTicketEvents.push({ ...ev, _type: 'festival', _price: price });
      }
    } else if (ev.concerts) {
      ev.concerts.forEach(c => {
        const cTags = c.tags || [];
        const cHasTickets = cTags.includes('tickets');
        if (cHasTickets) {
          totalConcerts++;
          const year = c.date ? c.date.substring(0, 4) : 'unbekannt';
          byYear[year] = (byYear[year] || 0) + 1;
          const artistKey = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
          if (artistKey) byArtist[artistKey] = (byArtist[artistKey] || 0) + 1;
          if (c.venue) byVenue[c.venue] = (byVenue[c.venue] || 0) + 1;
          const price = parseFloat(c.price) || 0;
          if (price > 0) totalSpent += price;
          if (c.date && c.date >= thisYear + '-01-01') upcoming++;
          else past++;
          allTicketEvents.push({ ...ev, _type: 'tour', _concert: c, _price: price });
        }
      });
    }
  });

  const topArtists = Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topVenues = Object.entries(byVenue).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const thisYearCount = (byYear[thisYear] || 0);
  const lastYearCount = (byYear[lastYear] || 0);
  const twoYearCount = (byYear[twoYearsAgo] || 0);

  return {
    totalConcerts,
    totalFestivals,
    totalEvents: totalConcerts + totalFestivals,
    totalSpent,
    byYear,
    topArtists,
    topVenues,
    upcoming,
    past,
    thisYearCount,
    lastYearCount,
    twoYearCount,
    yearChange: lastYearCount > 0 ? Math.round((thisYearCount - lastYearCount) / lastYearCount * 100) : 0,
    allTicketEvents
  };
}

/** Build the statistics modal HTML (stat cards + top lists + per-year bars). */
export function renderStatsHtml(s) {
  const yearBars = Object.entries(s.byYear).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5);
  const maxYear = Math.max(...Object.values(s.byYear), 1);

  return `<div class="stat-grid">
    <div class="stat-card" onclick="showStatDetail('all')">
      <div class="stat-value">${s.totalEvents}</div>
      <div class="stat-label">Events gesamt</div>
    </div>
    <div class="stat-card" onclick="showStatDetail('concerts')">
      <div class="stat-value">${s.totalConcerts}</div>
      <div class="stat-label">Konzerte</div>
    </div>
    <div class="stat-card" onclick="showStatDetail('festivals')">
      <div class="stat-value">${s.totalFestivals}</div>
      <div class="stat-label">Festivals</div>
    </div>
    <div class="stat-card" onclick="showStatDetail('spent')">
      <div class="stat-value">${fmtPrice(s.totalSpent)}</div>
      <div class="stat-label">Geschätzt ausgegeben</div>
    </div>
    <div class="stat-card full" onclick="showStatDetail('year')">
      <div class="stat-value">${s.thisYearCount}</div>
      <div class="stat-label">${new Date().getFullYear()} ${s.yearChange !== 0 ? `(${s.yearChange > 0 ? '+' : ''}${s.yearChange}%)` : ''}</div>
    </div>
  </div>

  ${s.topArtists.length ? `<div class="stat-section">
    <div class="stat-section-title">Top Künstler</div>
    <div class="stat-list">
      ${s.topArtists.map(([name, count]) => `<div class="stat-list-item"><span>${esc(name)}</span><span style="color:var(--accent)">${count}</span></div>`).join('')}
    </div>
  </div>` : ''}

  ${s.topVenues.length ? `<div class="stat-section">
    <div class="stat-section-title">Top Venues</div>
    <div class="stat-list">
      ${s.topVenues.map(([name, count]) => `<div class="stat-list-item"><span>${esc(name)}</span><span style="color:var(--accent)">${count}</span></div>`).join('')}
    </div>
  </div>` : ''}

  <div class="stat-section">
    <div class="stat-section-title">Termine nach Jahr</div>
    <div class="stat-list">
      ${yearBars.map(([year, count]) => {
        const pct = Math.round(count / maxYear * 100);
        return `<div class="stat-list-item"><span>${year}</span><span style="display:flex;align-items:center;gap:8px"><div style="width:60px;height:6px;background:var(--surface3);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--accent)"></div></div>${count}</span></div>`;
      }).join('')}
    </div>
  </div>`;
}

/**
 * Replace the stats modal with a filtered, date-sorted detail list drawn
 * from `state.statEvents`. `type` selects the filter (all/concerts/
 * festivals/spent/year).
 * @param {string} type
 */
export function showStatDetail(type) {
  const events = state.statEvents;
  const thisYear = new Date().getFullYear();

  let filtered = events;
  let title = '';

  if (type === 'all') {
    title = 'Alle Events mit Tickets';
  } else if (type === 'concerts') {
    filtered = events.filter(e => e._type === 'tour');
    title = 'Alle Konzerte mit Tickets';
  } else if (type === 'festivals') {
    filtered = events.filter(e => e._type === 'festival');
    title = 'Alle Festivals mit Tickets';
  } else if (type === 'spent') {
    filtered = events.filter(e => e._price > 0);
    title = 'Alle Events mit Preis';
  } else if (type === 'year') {
    filtered = events.filter(e => {
      const date = e._type === 'tour' ? (e._concert?.date || '') : (e.date || '');
      return date.startsWith(thisYear);
    });
    title = `Events ${thisYear}`;
  }

  filtered.sort((a, b) => {
    const dateA = a._type === 'tour' ? (a._concert?.date || '') : (a.date || '');
    const dateB = b._type === 'tour' ? (b._concert?.date || '') : (b.date || '');
    return dateA.localeCompare(dateB);
  });

  const listHtml = filtered.map(e => {
    const name = e._type === 'tour' ? (e.artist || 'Unbekannt') : (e.name || 'Unbekannt');
    const date = e._type === 'tour' ? (e._concert?.date || '–') : (e.date || '–');
    const venue = e._type === 'tour' ? (e._concert?.venue || '–') : (e.venue || '–');
    const price = e._price || 0;
    return `<div class="stat-list-item">
      <div>
        <div style="font-weight:500">${esc(name)}</div>
        <div style="font-size:11px;color:var(--muted)">${esc(venue)} · ${esc(date)}</div>
      </div>
      <div style="color:var(--accent)">${fmtPrice(price)}</div>
    </div>`;
  }).join('');

  const total = filtered.reduce((sum, e) => sum + (e._price || 0), 0);

  document.getElementById('stats-content').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <button class="btn-cancel" onclick="openStatistics()">${icon('arrow-left')} Zurück</button>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:1px">${title}</span>
      <span style="color:var(--accent)">${fmtPrice(total)}</span>
    </div>
    <div class="stat-list" style="max-height:60vh">
      ${listHtml || '<div style="text-align:center;color:var(--muted);padding:20px">Keine Events gefunden</div>'}
    </div>
  `;
}

// ── Export ────────────────────────────────────────────────────────────

/** Open the export modal, syncing the format-radio label borders. */
export function openExportModal() {
  updateFmtLabels();
  openModal('export-modal');
}

/** Highlight the border of the currently-checked format radio label. */
export function updateFmtLabels() {
  const fmt = document.querySelector('input[name="exp-fmt"]:checked')?.value || 'html';
  document.getElementById('fmt-html-lbl').style.borderColor = fmt === 'html' ? 'var(--accent)' : 'var(--border)';
  document.getElementById('fmt-csv-lbl').style.borderColor  = fmt === 'csv'  ? 'var(--accent)' : 'var(--border)';
  document.getElementById('fmt-ical-lbl').style.borderColor = fmt === 'ical' ? 'var(--accent)' : 'var(--border)';
}

/**
 * Read the export form, filter `state.allEvents` into upcoming/past by the
 * selected tags + date, then dispatch to the chosen format and close.
 */
export function runExport() {
  const inclTickets   = document.getElementById('exp-tickets').checked;
  const inclWatchlist = document.getElementById('exp-watchlist').checked;
  const inclUntagged  = document.getElementById('exp-untagged').checked;
  const inclPast      = document.getElementById('exp-past').checked;
  const fmt = document.querySelector('input[name="exp-fmt"]:checked')?.value || 'html';

  const todayIso = localIso(new Date());

  function evPassesFilter(ev) {
    const tags = ev.event_type === 'festival' ? (ev.tags || [])
      : (ev.concerts || []).flatMap(c => c.tags || []);
    const hasTickets   = tags.includes('tickets');
    const hasWatchlist = tags.includes('watchlist');
    const hasNone      = !hasTickets && !hasWatchlist;
    return (inclTickets && hasTickets) || (inclWatchlist && hasWatchlist) || (inclUntagged && hasNone);
  }

  let vis = state.allEvents.filter(ev => evPassesFilter(ev));
  let upcoming = vis.filter(ev => !(eventLatestDate(ev) && eventLatestDate(ev) < todayIso));
  let past     = vis.filter(ev =>   eventLatestDate(ev) && eventLatestDate(ev) < todayIso);
  if (!inclPast) past = [];

  upcoming.sort((a, b) => eventEarliestDate(a).localeCompare(eventEarliestDate(b)));
  past.sort((a, b)     => eventEarliestDate(a).localeCompare(eventEarliestDate(b)));

  if (fmt === 'csv') {
    exportCSV(upcoming, past, todayIso);
  } else if (fmt === 'ical') {
    exportICS(upcoming, past, todayIso);
  } else {
    exportHTML(upcoming, past, todayIso);
  }
  closeModal('export-modal');
}

/** Build a CSV (semicolon-tagged, CRLF) from the upcoming/past event slices and download it. */
export function exportCSV(upcoming, past, todayIso) {
  const rows = [['Typ', 'Name/Artist', 'Tour/Festival', 'Datum', 'Enddatum', 'Uhrzeit', 'Stadt', 'Venue', 'Preis', 'Ticketlink', 'Tags', 'Support/Bands', 'Status']];
  function addEv(ev, status) {
    if (ev.event_type === 'festival') {
      rows.push([
        'Festival', ev.name, ev.name, ev.date || '', ev.end_date || '', ev.time || '',
        ev.city || '', ev.venue || '', ev.price || '', ev.ticket_link || '',
        (ev.tags || []).join('; '), (ev.bands_to_watch || []).join('; '), status
      ]);
    } else {
      (ev.concerts || []).forEach(c => {
        const artistForExport = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        rows.push([
          'Konzert', artistForExport, ev.tour_name || '', c.date || '', c.end_date || '', c.time || '',
          c.city || '', c.venue || '', c.price || '', c.ticket_link || '',
          (c.tags || []).join('; '), (c.support_present || []).join('; '), status
        ]);
      });
    }
  }
  upcoming.forEach(ev => addEv(ev, 'anstehend'));
  past.forEach(ev => addEv(ev, 'vergangen'));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  dlBlob(csv, `konzertplaner-${todayIso}.csv`, 'text/csv;charset=utf-8');
}

/** Build an iCalendar feed from the upcoming/past event slices and download it. */
export function exportICS(upcoming, past, todayIso) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Konzertplaner//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Konzertplaner'
  ];

  function addEv(ev, status) {
    if (ev.event_type === 'festival') {
      if (!ev.date) return;
      const uid = `festival-${ev.id || ev.name.replace(/\W/g, '')}@konzertplaner`;
      const dtstart = ev.date.replace(/-/g, '');
      const dtend = (ev.end_date || ev.date).replace(/-/g, '');
      const summary = ev.name || 'Festival';
      const location = [ev.venue, ev.city].filter(Boolean).join(', ');
      const desc = [
        'Festival',
        ev.bands_to_watch?.length ? 'Bands: ' + ev.bands_to_watch.join(', ') : '',
        ev.ticket_link ? 'Tickets: ' + ev.ticket_link : ''
      ].filter(Boolean).join('\\n');
      lines.push(
        'BEGIN:VEVENT',
        'UID:' + uid,
        'DTSTAMP:' + todayIso.replace(/[-:]/g, '').replace('.', 'Z'),
        'DTSTART;VALUE=DATE:' + dtstart,
        'DTEND;VALUE=DATE:' + dtend,
        'SUMMARY:' + summary,
        location ? 'LOCATION:' + location : '',
        desc ? 'DESCRIPTION:' + desc : '',
        'STATUS:' + (status === 'vergangen' ? 'CONFIRMED' : 'TENTATIVE'),
        'END:VEVENT'
      );
    } else {
      (ev.concerts || []).forEach(c => {
        if (!c.date) return;
        const artistForIcal = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        const uid = `concert-${c.id || c.date + '-' + (c.city || '').replace(/\W/g, '') + '-' + (artistForIcal || '').replace(/\W/g, '')}@konzertplaner`;
        const dtstart = (c.date + (c.time ? 'T' + c.time.replace(':', '') + '00' : '')).replace(/[-:]/g, '');
        const dtend = (c.end_date || c.date + (c.time ? 'T' + c.time.replace(':', '') + '00' : '')).replace(/[-:]/g, '');
        const summary = artistForIcal + (ev.tour_name ? ' - ' + ev.tour_name : '');
        const location = [c.venue, c.city].filter(Boolean).join(', ');
        const desc = [
          ev.tour_name ? 'Tour: ' + ev.tour_name : '',
          c.support_present?.length ? 'Support: ' + c.support_present.join(', ') : '',
          c.ticket_link ? 'Tickets: ' + c.ticket_link : ''
        ].filter(Boolean).join('\\n');
        lines.push(
          'BEGIN:VEVENT',
          'UID:' + uid,
          'DTSTAMP:' + todayIso.replace(/[-:]/g, '').replace('.', 'Z'),
          c.time ? 'DTSTART:' + dtstart : 'DTSTART;VALUE=DATE:' + c.date.replace(/-/g, ''),
          c.time ? 'DTEND:' + dtend : 'DTEND;VALUE=DATE:' + (c.end_date || c.date).replace(/-/g, ''),
          'SUMMARY:' + summary,
          location ? 'LOCATION:' + location : '',
          desc ? 'DESCRIPTION:' + desc : '',
          'STATUS:' + (status === 'vergangen' ? 'CONFIRMED' : 'TENTATIVE'),
          'END:VEVENT'
        );
      });
    }
  }

  upcoming.forEach(ev => addEv(ev, 'anstehend'));
  past.forEach(ev => addEv(ev, 'vergangen'));

  lines.push('END:VCALENDAR');

  const ics = lines.filter(l => l.trim()).join('\r\n');
  dlBlob(ics, `konzertplaner-${todayIso}.ics`, 'text/calendar;charset=utf-8');
}

/** Build a standalone, print-friendly HTML document from the event slices and download it. */
export function exportHTML(upcoming, past, todayIso) {
  const accentCol = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8ff47';
  const tourCol   = getComputedStyle(document.documentElement).getPropertyValue('--tour').trim()   || '#19c6e6';
  const festCol   = getComputedStyle(document.documentElement).getPropertyValue('--festival').trim() || '#ff4d8d';

  function evHtml(ev) {
    if (ev.event_type === 'festival') {
      const d = parseDate(ev.date);
      const endStr = ev.end_date ? ` – ${fmtDateShort(ev.end_date)}` : '';
      const tagTxt = (ev.tags || []).map(t => t === 'tickets' ? icon('check') + ' Tickets' : icon('star') + ' Merkliste').join(' · ');
      const bands  = (ev.bands_to_watch || []).join(', ');
      return `<div class="ev-card">
        <div class="ev-header">
          <div class="ev-date-col" style="color:${festCol}">
            <div class="ev-day">${d.day}</div>
            <div class="ev-mon">${d.month}</div>
            <div class="ev-yr">${d.year}${endStr}</div>
          </div>
          <div class="ev-main">
            <div class="ev-badge" style="color:${festCol};border-color:${festCol}">Festival</div>
            <div class="ev-title">${esc(ev.name)}</div>
            <div class="ev-sub">${icon('map-pin')} ${esc(ev.venue)}${ev.city ? ', ' + esc(ev.city) : ''}${ev.time ? ' · ' + icon('clock') + ' ' + esc(ev.time) + ' Uhr' : ''}</div>
            ${ev.price || ev.ticket_link ? `<div class="ev-detail">${ev.price ? '€ ' + fmtPrice(ev.price) : ''}${ev.ticket_link ? ` <a href="${esc(ev.ticket_link)}">${icon('check')} Tickets</a>` : ''}${tagTxt ? ' · ' + tagTxt : ''}</div>` : (tagTxt ? `<div class="ev-detail">${tagTxt}</div>` : '')}
            ${bands ? `<div class="ev-detail" style="color:#999">Bands: ${esc(bands)}</div>` : ''}
          </div>
        </div>
      </div>`;
    }
    const concRows = (ev.concerts || []).map(c => {
      const d = parseDate(c.date);
      const endStr = c.end_date ? `–${new Date(c.end_date + 'T12:00:00').getDate()}` : '';
      const acts = (c.support_present || []).join(', ');
      const tagIcons = (c.tags || []).map(t => t === 'tickets' ? icon('check') : icon('star')).join(' ');
      return `<div class="conc-row">
        <div class="conc-date" style="color:${tourCol}">
          <span class="cd-day">${d.day}${endStr}</span>
          <span class="cd-mon">${d.month}</span>
          <span class="cd-yr">${d.year}</span>
        </div>
        <div class="conc-info">
          <strong>${esc(c.venue)}</strong>, ${esc(c.city)}
          ${c.time ? ' · ' + icon('clock') + ' ' + esc(c.time) + ' Uhr' : ''}
          ${c.price ? ' · € ' + fmtPrice(c.price) : ''}
          ${c.ticket_link ? ` · <a href="${esc(c.ticket_link)}">${icon('check')} Tickets</a>` : ''}
          ${acts ? `<br><span style="color:#777">${esc(acts)}</span>` : ''}
        </div>
        <div class="conc-tags">${tagIcons}</div>
      </div>`;
    }).join('');
    return `<div class="ev-card">
      <div class="ev-artist-header">
        <div class="ev-badge" style="color:${tourCol};border-color:${tourCol}">Tour</div>
        <div class="ev-title">${Array.isArray(ev.artist) ? esc(ev.artist.join(' + ')) : esc(ev.artist)}</div>
        <div class="ev-sub">${esc(ev.tour_name || '')}${ev.support && ev.support.length ? ' · Support: ' + esc(ev.support.join(', ')) : ''}</div>
      </div>
      ${concRows}
    </div>`;
  }

  const html = `<!DOCTYPE html>
<html lang="de"><head><meta charset="UTF-8">
<title>Konzertplaner – ${new Date().toLocaleDateString('de-DE')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #111; color: #f0f0f0; max-width: 900px; margin: 0 auto; padding: 36px 20px; }
  h1  { font-size: 2rem; letter-spacing: 3px; color: ${accentCol}; margin-bottom: 4px; }
  .sub { color: #555; font-size: 13px; margin-bottom: 28px; }
  h2  { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 2px; margin: 28px 0 10px; padding-top: 16px; border-top: 1px solid #2a2a2a; }
  .ev-card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
  .ev-header { display: grid; grid-template-columns: 64px 1fr; gap: 0; }
  .ev-date-col { padding: 14px 0 14px 16px; text-align: center; }
  .ev-day  { font-size: 1.8rem; font-weight: 700; line-height: 1; }
  .ev-mon  { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
  .ev-yr   { font-size: 11px; color: #555; }
  .ev-main { padding: 12px 16px; }
  .ev-artist-header { padding: 14px 16px 8px; border-bottom: 1px solid #2a2a2a; }
  .ev-badge { font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; display: inline-block; padding: 2px 8px; border-radius: 4px; border: 1px solid; margin-bottom: 4px; }
  .ev-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 2px; }
  .ev-sub   { font-size: 12px; color: #777; margin-bottom: 4px; }
  .ev-detail { font-size: 12px; color: #aaa; margin-top: 3px; }
  .conc-row { display: grid; grid-template-columns: 80px 1fr auto; gap: 0; padding: 10px 16px; border-bottom: 1px solid #222; font-size: 13px; align-items: start; }
  .conc-row:last-child { border-bottom: none; }
  .conc-date { display: flex; flex-direction: column; font-weight: 700; }
  .cd-day { font-size: 1.5rem; line-height: 1; }
  .cd-mon { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
  .cd-yr  { font-size: 10px; color: #555; }
  .conc-info { line-height: 1.6; }
  .conc-tags { font-size: 14px; padding-top: 2px; }
  a { color: #1fc8a4; }
  @media print {
    body { background: #fff; color: #111; }
    .ev-card { background: #f8f8f8; border-color: #ddd; }
    .ev-artist-header { border-color: #ddd; }
    .conc-row { border-color: #eee; }
    h2 { border-color: #ddd; }
  }
</style></head><body>
<h1>KONZERTPLANER</h1>
<div class="sub">Stand: ${new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
${upcoming.length ? '<h2>Anstehende Events</h2>' + upcoming.map(evHtml).join('') : ''}
${past.length ? '<h2>Vergangene Events</h2>' + past.map(evHtml).join('') : ''}
</body></html>`;

  dlBlob(html, `konzertplaner-${todayIso}.html`, 'text/html;charset=utf-8');
}

// ══════════════════════════════════════════════════════════════════════
// shows.js — "Shows" tab: rated-act list, grouping/sorting, histograms
//
// The Shows tab lists every rated act across all past events, optionally
// grouped by event/venue/city/artist/year, with rating/year/city
// histograms above the list. Ratings come from `state.ratings`
// (`ratings[eventId][actName] = 1..10`); this module flattens them into
// per-act rows via `getRatedEvents`, then renders cards + histograms.
//
// Shows-tab filter state (type/category/sort) lives in filters.js; this
// module reads it through the `getShowsType`/`getShowsCategory`/
// `getShowsSort` getters. The main filters (tickets/watchlist/past/
// upcoming) do NOT apply here — the original shows list shows every
// rated act regardless of the main filter bar.
//
// Inline `onclick`s:
//   • `renderShowCard` cards call the global `openEventModal(id)` (exposed
//     on `window` by main.js) — not imported, to avoid a circular dep.
//   • Histogram bars call `showHistogramTooltip` / `hideHistogramTooltip`
//     via `onmouseenter`/`onmouseleave`; these are exported here so
//     main.js can attach them to `window`.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { pipColor } from './utils.js';
import { getShowsType, getShowsCategory, getShowsSort } from './filters.js';
import { icon } from './icons.js';

/**
 * Flatten all rated acts across events into one row per (event × act).
 * Each row spreads the event's fields and overrides `actName`, `rating`,
 * `eventType`, `date`, `time`, `venue`, `city`, `price` from the
 * specific concert. Filtered by the shows-tab type filter only (the
 * main filter bar is intentionally not applied). Unrated acts are
 * skipped.
 * @returns {any[]}
 */
function getRatedEvents() {
  const result = [];
  state.allEvents.forEach(event => {
    const eventId = String(event.id);
    const eventRatings = state.ratings[eventId];
    if (!eventRatings) return;

    const eventType = event.event_type || 'tour';
    const typeFilter = getShowsType();
    if (typeFilter !== 'both' && eventType !== typeFilter) return;

    const concerts = event.concerts || [];
    if (concerts.length === 0) {
      const concert = { date: event.date, time: event.time, venue: event.venue, city: event.city, price: event.price };
      processEventActs(event, concert, eventRatings, result, eventType);
    } else {
      concerts.forEach(concert => {
        processEventActs(event, concert, eventRatings, result, eventType);
      });
    }
  });
  return result;
}

/**
 * Collect every act for one event/concert (headliner + support / bands
 * to watch) and push a row per rated act onto `result`.
 */
function processEventActs(event, concert, eventRatings, result, eventType) {
  let allActs = [];

  if (concert.artist) {
    allActs = [concert.artist];
    if (concert.support_present) {
      allActs.push(...concert.support_present);
    }
  } else if (event.support) {
    allActs = [event.artist];
    allActs.push(...event.support);
  } else if (event.bands_to_watch) {
    allActs = [event.artist];
    allActs.push(...event.bands_to_watch);
  } else if (event.supportActs) {
    allActs = [event.artist];
    allActs.push(...event.supportActs);
  } else {
    allActs = [event.artist];
  }

  if (concert.support_present) {
    concert.support_present.forEach(act => {
      if (!allActs.includes(act)) {
        allActs.push(act);
      }
    });
  }

  allActs.forEach(actName => {
    if (!actName) return;
    const rating = eventRatings[actName];
    if (rating && rating > 0) {
      result.push({
        ...event,
        actName: actName,
        rating: rating,
        eventType: eventType,
        date: concert.date,
        time: concert.time,
        venue: concert.venue || event.venue,
        city: concert.city || event.city,
        price: concert.price || event.price
      });
    }
  });
}

/**
 * Render the Shows tab: collect rated acts, sort by the active sort key,
 * optionally group by the active category, render one card per act
 * (clicking a card opens the event modal), then render the histograms.
 */
export function renderShows() {
  const container = document.getElementById('shows-list');
  const ratedEvents = getRatedEvents();

  if (ratedEvents.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon">${icon('star-filled')}</div><h3>Keine bewerteten Shows</h3><p>Bewerte Events, um sie hier zu sehen.</p></div>`;
    renderHistograms([]);
    return;
  }

  const sort = getShowsSort();
  const sorted = [...ratedEvents].sort((a, b) => {
    switch (sort) {
      case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
      case 'rating-asc': return (a.rating || 0) - (b.rating || 0);
      case 'date-desc': return new Date(b.date).getTime() - new Date(a.date).getTime();
      case 'date-asc': return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'price-desc': return (b.price || 0) - (a.price || 0);
      case 'price-asc': return (a.price || 0) - (b.price || 0);
      case 'alpha': return (a.title || '').localeCompare(b.title || '');
      default: return 0;
    }
  });

  const category = getShowsCategory();
  if (category === 'none') {
    container.innerHTML = sorted.map(e => renderShowCard(e)).join('');
  } else {
    const groups = {};
    sorted.forEach(e => {
      let key;
      switch (category) {
        case 'event': key = (e.artist || 'Unbekannt') + (e.tour_name ? ' - ' + e.tour_name : ''); break;
        case 'venue': key = e.venue || 'Unbekannt'; break;
        case 'city': key = e.city || 'Unbekannt'; break;
        case 'artist': key = e.actName || 'Unbekannt'; break;
        case 'year': key = e.date ? new Date(e.date).getFullYear().toString() : 'Unbekannt'; break;
        default: key = 'Alle';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });

    const sortedKeys = Object.keys(groups).sort();
    if (category === 'year') {
      sortedKeys.sort((a, b) => parseInt(b) - parseInt(a));
    }

    let html = '';
    sortedKeys.forEach(key => {
      html += `<div class="shows-category-header">${key}</div>`;
      html += groups[key].map(e => renderShowCard(e)).join('');
    });
    container.innerHTML = html;
  }

  renderHistograms(ratedEvents);
}

/**
 * Build a single compact show card: rating pips + numeric rating, then
 * act • date • event name • venue • city • price on one line. Clicking
 * the card opens the event modal via the global `openEventModal(id)`.
 * @param {any} e
 * @returns {string}
 */
function renderShowCard(e) {
  const date = e.date ? new Date(e.date) : null;
  const dateStr = date ? date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
  const venue = e.venue || 'Unbekannt';
  const city = e.city || '';
  const price = e.price ? e.price + ' €' : '';
  const rating = e.rating || 0;
  const actName = e.actName || e.title || 'Unbekannt';

  const eventType = e.eventType || 'tour';
  let eventName = '';
  if (eventType === 'festival') {
    eventName = e.name || e.title || '';
  } else {
    eventName = (e.artist || '') + (e.tour_name ? ' - ' + e.tour_name : '');
  }

  const pips = Array.from({ length: 10 }, (_, i) => {
    const pos = i + 1;
    const col = pipColor(rating, pos);
    const style = col ? `background:${col};border-color:${col}` : '';
    return `<div class="rating-pip" style="${style}"></div>`;
  }).join('');

  return `<div class="event-card" onclick="openEventModal('${e.id}')" style="padding:12px 16px">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:nowrap;white-space:nowrap;overflow:hidden">
      <div class="rating-bar" style="gap:2px;flex-shrink:0">${pips}</div>
      <strong style="color:${pipColor(rating, rating)};flex-shrink:0">${rating}</strong>
      <span style="color:var(--text)">${actName}</span>
      <span style="color:var(--muted)">•</span>
      <span style="color:var(--muted)">${dateStr}</span>
      <span style="color:var(--muted)">•</span>
      <span style="color:var(--muted)">${eventName}</span>
      <span style="color:var(--muted)">•</span>
      <span style="color:var(--text)">${venue}</span>
      ${city ? `<span style="color:var(--muted)">•</span><span style="color:var(--text)">${city}</span>` : ''}
      ${price ? `<span style="color:var(--muted)">•</span><span style="color:var(--text)">${price}</span>` : ''}
    </div>
    </div>
  </div>`;
}

/**
 * Build the three histograms (rating 1–10, year, city), each split into
 * tour/festival sub-counts, and render them into the `#histogram-*`
 * containers.
 * @param {any[]} events
 */
function renderHistograms(events) {
  const ratingCounts = {};
  const ratingTourCounts = {};
  const ratingFestCounts = {};
  for (let i = 1; i <= 10; i++) {
    ratingCounts[i] = 0;
    ratingTourCounts[i] = 0;
    ratingFestCounts[i] = 0;
  }
  const ratingEvents = {};
  for (let i = 1; i <= 10; i++) ratingEvents[i] = [];

  events.forEach(e => {
    const r = Math.round(e.rating || 0);
    if (r >= 1 && r <= 10) {
      ratingCounts[r]++;
      if (e.eventType === 'festival') {
        ratingFestCounts[r]++;
      } else {
        ratingTourCounts[r]++;
      }
      ratingEvents[r].push(e);
    }
  });

  const yearCounts = {};
  const yearTourCounts = {};
  const yearFestCounts = {};
  const yearEvents = {};
  events.forEach(e => {
    if (e.date) {
      const y = new Date(e.date).getFullYear();
      yearCounts[y] = (yearCounts[y] || 0) + 1;
      if (e.eventType === 'festival') {
        yearFestCounts[y] = (yearFestCounts[y] || 0) + 1;
      } else {
        yearTourCounts[y] = (yearTourCounts[y] || 0) + 1;
      }
      if (!yearEvents[y]) yearEvents[y] = [];
      yearEvents[y].push(e);
    }
  });

  const cityCounts = {};
  const cityTourCounts = {};
  const cityFestCounts = {};
  const cityEvents = {};
  events.forEach(e => {
    const c = e.city || 'Unbekannt';
    cityCounts[c] = (cityCounts[c] || 0) + 1;
    if (e.eventType === 'festival') {
      cityFestCounts[c] = (cityFestCounts[c] || 0) + 1;
    } else {
      cityTourCounts[c] = (cityTourCounts[c] || 0) + 1;
    }
    if (!cityEvents[c]) cityEvents[c] = [];
    cityEvents[c].push(e);
  });

  renderHistogramBars('histogram-ratings', ratingCounts, ratingEvents, 'Bewertung', ratingTourCounts, ratingFestCounts);
  renderHistogramBars('histogram-years', yearCounts, yearEvents, 'Jahr', yearTourCounts, yearFestCounts);
  renderHistogramBars('histogram-cities', cityCounts, cityEvents, 'Stadt', cityTourCounts, cityFestCounts);
}

/**
 * Render the bars for one histogram into `#containerId`. Bars are
 * scaled to the max count; when both tours and festivals contribute,
 * the fill is split into two coloured segments. Each bar wires
 * `showHistogramTooltip`/`hideHistogramTooltip` (global) for the
 * hover list of contributing events.
 * @param {string} containerId
 * @param {Record<string, number>} counts
 * @param {Record<string, Array<object>>} events
 * @param {'Bewertung'|'Jahr'|'Stadt'} type
 * @param {Record<string, number>} [tourCounts]
 * @param {Record<string, number>} [festCounts]
 */
function renderHistogramBars(containerId, counts, events, type, tourCounts, festCounts) {
  const container = document.getElementById(containerId);
  const maxCount = Math.max(...Object.values(counts), 1);

  const tourCol = getComputedStyle(document.documentElement).getPropertyValue('--tour').trim() || '#38bdf8';
  const festCol = getComputedStyle(document.documentElement).getPropertyValue('--festival').trim() || '#a78bfa';

  let html = '';
  Object.entries(counts).sort((a, b) => {
    if (type === 'Jahr') return parseInt(b[0]) - parseInt(a[0]);
    if (type === 'Bewertung') return parseInt(b[0]) - parseInt(a[0]);
    return a[0].localeCompare(b[0]);
  }).forEach(([key, count]) => {
    if (count === 0) return;
    const pct = (count / maxCount) * 100;
    const label = type === 'Bewertung' ? key + ' ' + icon('star-filled') : key;

    const tourCount = tourCounts?.[key] || 0;
    const festCount = festCounts?.[key] || 0;
    const tourPct = (tourCount / maxCount) * 100;
    const festPct = (festCount / maxCount) * 100;

    let barContent = '';
    if (tourCount > 0 && festCount > 0) {
      barContent = `<div class="histogram-bar-fill" style="width:${tourPct}%;background:${tourCol};border-radius:3px 0 0 3px"></div>
        <div class="histogram-bar-fill" style="width:${festPct}%;background:${festCol};border-radius:0 3px 3px 0;margin-left:-1px"></div>`;
    } else if (tourCount > 0) {
      barContent = `<div class="histogram-bar-fill" style="width:${pct}%;background:${tourCol}"></div>`;
    } else if (festCount > 0) {
      barContent = `<div class="histogram-bar-fill" style="width:${pct}%;background:${festCol}"></div>`;
    } else {
      barContent = `<div class="histogram-bar-fill" style="width:${pct}%"></div>`;
    }

    html += `<div class="histogram-bar" onmouseenter="showHistogramTooltip(event, '${key}', ${JSON.stringify(events[key] || []).replace(/"/g, '&quot;')})" onmouseleave="hideHistogramTooltip()">
      <span class="histogram-bar-label">${label}</span>
      <div class="histogram-bar-track" style="display:flex">
        ${barContent}
      </div>
      <span class="histogram-bar-count">${count}</span>
    </div>`;
  });

  container.innerHTML = html || '<div style="color:var(--muted);font-size:12px">Keine Daten</div>';
}

/**
 * Show the histogram tooltip listing the events behind one bar.
 * Positions it just below the hovered bar. Called from the inline
 * `onmouseenter`; main.js exposes it on `window`.
 * @param {MouseEvent} event
 * @param {string} key
 * @param {any[]} eventList
 */
export function showHistogramTooltip(event, key, eventList) {
  const tooltip = document.getElementById('histogram-tooltip');
  if (!eventList || eventList.length === 0) {
    tooltip.style.display = 'none';
    return;
  }

  const listHtml = eventList.map(e => `<div class="histogram-tooltip-item">${e.title || 'Unbekannt'} (${e.city || ''})</div>`).join('');
  tooltip.innerHTML = `<div class="histogram-tooltip-title">${key}</div><div class="histogram-tooltip-list">${listHtml}</div>`;
  tooltip.style.display = 'block';

  const rect = event.target.getBoundingClientRect();
  tooltip.style.left = (rect.left + window.scrollX) + 'px';
  tooltip.style.top = (rect.bottom + window.scrollY + 8) + 'px';
}

/**
 * Hide the histogram tooltip. Called from the inline `onmouseleave`;
 * main.js exposes it on `window`.
 */
export function hideHistogramTooltip() {
  document.getElementById('histogram-tooltip').style.display = 'none';
}

// ══════════════════════════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════════════════════════
let allEvents   = [];
let knownBands  = [];
let knownVenues = [];     // [{id,name,city}]
let artists     = [];     // catalogue
let venuesCat   = [];     // catalogue

let activeFilters = new Set();
let dateFilter = 'both'; // 'past', 'upcoming', or 'both' - default to show all
let currentTab    = 'list';
let eventTypeFilter = 'both'; // 'tour', 'festival', or 'both'
let calYear, calMonth;

// Timeline variables
let timelineStartDate = new Date();
let timelineZoomLevel = 0;
const zoomLabels = ['1 Jahr', '6 Monate', '3 Monate', '1 Monat', '2 Wochen'];
const zoomMonths = [12, 6, 3, 1, 0.5];
let timelineInitialized = false;
let timelineScrollHandlerEnabled = true;

let editingId      = null;
let currentType    = 'tour';
let pendingBlob    = { tour: null, festival: null };
let savedPoster    = { tour: null, festival: null };

// pill state
const pillState = {
  artist:  { tags: [], hi: -1 },
  support: { tags: [], hi: -1 },
  bands:   { tags: [], hi: -1 },
};

function updatePillDisplay(fieldId, inputId, tags) {
  const which = fieldId.replace('-field', '');
  pillState[which].tags = [...tags];
  renderPills(which);
}

const today = new Date();
calYear  = today.getFullYear();
calMonth = today.getMonth();

// ── Color theme ───────────────────────────────────────────────────────
const COLOR_VARS = [
  { key: '--accent',        label: 'Akzentfarbe' },
  { key: '--tour',          label: 'Tour-Farbe' },
  { key: '--festival',      label: 'Festival-Farbe' },
  { key: '--tickets-color', label: 'Tickets-Tag' },
  { key: '--watch-color',   label: 'Merkliste-Tag' },
  { key: '--bg',            label: 'Hintergrund' },
  { key: '--surface',       label: 'Oberfläche 1' },
  { key: '--surface2',      label: 'Oberfläche 2' },
  { key: '--surface3',      label: 'Oberfläche 3' },
  { key: '--text',          label: 'Text' },
  { key: '--muted',         label: 'Gedämpft' },
  { key: '--border',        label: 'Rahmen' },
];

const THEMES = {
  dark: {
    '--bg': '#0d0d0d', '--surface': '#161616', '--surface2': '#1f1f1f',
    '--surface3': '#272727', '--border': '#2a2a2a', '--text': '#f0f0f0',
    '--muted': '#777', '--accent': '#e8ff47', '--tour': '#38bdf8',
    '--festival': '#a78bfa', '--tickets-color': '#4ade80', '--watch-color': '#fb923c',
  },
  light: {
    '--bg': '#f5f5f5', '--surface': '#ffffff', '--surface2': '#f0f0f0',
    '--surface3': '#e8e8e8', '--border': '#d0d0d0', '--text': '#111111',
    '--muted': '#666666', '--accent': '#1a7a00', '--tour': '#0066cc',
    '--festival': '#7c3aed', '--tickets-color': '#16a34a', '--watch-color': '#ea580c',
  },
  midnight: {
    '--bg': '#04040f', '--surface': '#0d0d2b', '--surface2': '#131340',
    '--surface3': '#1a1a55', '--border': '#252570', '--text': '#e8e8ff',
    '--muted': '#6666aa', '--accent': '#00ffcc', '--tour': '#ff6b9d',
    '--festival': '#ffd700', '--tickets-color': '#00e5ff', '--watch-color': '#ff9f43',
  },
};

const DEFAULT_COLORS = {};
COLOR_VARS.forEach(c => DEFAULT_COLORS[c.key] = getComputedStyle(document.documentElement).getPropertyValue(c.key).trim());

function applyTheme(themeKey) {
  const theme = THEMES[themeKey];
  if (!theme) return;
  const saved = JSON.parse(localStorage.getItem('kp-colors') || '{}');
  Object.entries(theme).forEach(([k,v]) => {
    document.documentElement.style.setProperty(k, v);
    saved[k] = v;
  });
  localStorage.setItem('kp-colors', JSON.stringify(saved));
  buildColorGrid();
}
function loadColors() {
  const saved = JSON.parse(localStorage.getItem('kp-colors') || '{}');
  Object.entries(saved).forEach(([k,v]) => document.documentElement.style.setProperty(k, v));
}
function saveColors(key, val) {
  document.documentElement.style.setProperty(key, val);
  const saved = JSON.parse(localStorage.getItem('kp-colors') || '{}');
  saved[key] = val;
  localStorage.setItem('kp-colors', JSON.stringify(saved));
}
function resetColors() {
  localStorage.removeItem('kp-colors');
  COLOR_VARS.forEach(c => document.documentElement.style.removeProperty(c.key));
  buildColorGrid();
}
function buildColorGrid() {
  const grid = document.getElementById('color-grid');
  const presets = `<div style="grid-column:1/-1;display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
    <span style="font-size:12px;color:var(--muted);align-self:center">Preset:</span>
    <button class="btn-sm" onclick="applyTheme('dark')">🌑 Dark (Standard)</button>
    <button class="btn-sm" onclick="applyTheme('light')">☀️ Light</button>
    <button class="btn-sm" onclick="applyTheme('midnight')">🌌 Midnight</button>
  </div>`;
  grid.innerHTML = presets + COLOR_VARS.map(c => {
    const val = getComputedStyle(document.documentElement).getPropertyValue(c.key).trim();
    return `<div class="color-row">
      <label>${c.label}</label>
      <input type="color" value="${val}" oninput="saveColors('${c.key}',this.value)">
    </div>`;
  }).join('');
}
loadColors();

// ── Custom CSS from Design Tool ────────────────────────────────────────
// Applies any custom CSS saved by the standalone design tool at /design-tool
(function applyCustomCss() {
  const css = localStorage.getItem('kp-custom-css');
  if (!css || !css.trim()) return;
  const style = document.createElement('style');
  style.id = 'kp-custom-css';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ══════════════════════════════════════════════════════════════════════
// Boot
// ══════════════════════════════════════════════════════════════════════
async function fetchAll() {
  const [evR, bR, vR, aR, vcR] = await Promise.all([
    fetch('/api/events'), fetch('/api/bands'), fetch('/api/venues'),
    fetch('/api/artists'), fetch('/api/venues-catalogue'),
  ]);
  allEvents   = await evR.json();
  knownBands  = await bR.json();
  knownVenues = await vR.json();
  artists     = await aR.json();
  venuesCat   = await vcR.json();
  renderList();
  renderCalendar();
  
  // Initialize timeline before renderTimeline to ensure correct start date and zoom level
  initTimeline();
  
  // Now render timeline with correct values
  renderTimeline();
  // Scroll to today at 10% position after render
  setTimeout(timelineToday, 100);
}
fetchAll();
loadTheme();

// Check for invite success message
const inviteSuccess = localStorage.getItem('invite_success');
if (inviteSuccess) {
  localStorage.removeItem('invite_success');
  setTimeout(() => alert(inviteSuccess), 500);
}

// ══════════════════════════════════════════════════════════════════════
// Tabs / filters
// ══════════════════════════════════════════════════════════════════════
function switchTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-list').style.display        = tab === 'list'        ? 'block' : 'none';
  document.getElementById('tab-calendar').style.display    = tab === 'calendar'    ? 'block' : 'none';
  document.getElementById('tab-map').style.display         = tab === 'map'         ? 'block' : 'none';
  document.getElementById('tab-shows').style.display       = tab === 'shows'       ? 'block' : 'none';
  document.getElementById('tab-favourites').style.display  = tab === 'favourites'  ? 'block' : 'none';
  
  // Show/hide filter bars based on tab
  const filterBar = document.getElementById('filter-bar');
  const showsFilterBar = document.getElementById('shows-filter-bar');
  if (tab === 'favourites' || tab === 'shows') {
    filterBar.style.display = 'none';
  } else {
    filterBar.style.display = 'flex';
  }
  if (tab === 'shows') {
    showsFilterBar.style.display = 'flex';
  } else {
    showsFilterBar.style.display = 'none';
  }
   
  // Set default filters per tab
  if (tab === 'list' || tab === 'calendar') {
    // Konzertliste & Kalender: show all events (no filters active)
    dateFilter = 'both';
    eventTypeFilter = 'both';
    activeFilters.clear();
    updateAllFilterVisuals();
  } else if (tab === 'calendar') {
    // Reset timeline to start further in the past to allow dragging
    timelineStartDate = new Date();
    timelineStartDate.setDate(1);
    timelineStartDate.setMonth(timelineStartDate.getMonth() - 3); // Start 3 months before today
    timelineZoomLevel = 0; // Default to 1 year view
    document.getElementById('timeline-zoom-label').textContent = zoomLabels[timelineZoomLevel];
    timelineInitialized = false; // Reset to trigger scroll to today
    renderTimeline();
    // Scroll to today after render
    setTimeout(timelineToday, 150);
  } else if (tab === 'map') {
    // Karte: show past events with purchased tickets
    dateFilter = 'past';
    eventTypeFilter = 'both';
    activeFilters.clear();
    activeFilters.add('tickets');
    updateAllFilterVisuals();
  }
   
  if (tab === 'favourites') renderFavourites();
  if (tab === 'map') initMap();
  if (tab === 'shows') renderShows();
}

// ── Shows Tab ────────────────────────────────────────────────────────
let showsCategory = 'none';
let showsSort = 'rating-desc';
let showsTypeFilter = 'both';

function setShowsTypeFilter(type) {
  showsTypeFilter = type;
  // Update visual state - use same classes as main filter bar
  document.querySelectorAll('[id^="type-"]').forEach(el => {
    el.classList.remove('active-tour', 'active-festival', 'active-shows-type');
  });
  const btn = document.getElementById('type-' + type);
  if (type === 'tour') btn.classList.add('active-tour');
  else if (type === 'festival') btn.classList.add('active-festival');
  else if (type === 'both') btn.classList.add('active-shows-type');
  renderShows();
}

function setShowsCategory(cat) {
  showsCategory = cat;
  // Update visual state
  document.querySelectorAll('[id^="cat-"]').forEach(el => el.classList.remove('active-shows-cat'));
  document.getElementById('cat-' + cat).classList.add('active-shows-cat');
  renderShows();
}

function setShowsSort(sort) {
  showsSort = sort;
  // Update visual state
  document.querySelectorAll('[id^="sort-"]').forEach(el => el.classList.remove('active-shows-sort'));
  document.getElementById('sort-' + sort).classList.add('active-shows-sort');
  renderShows();
}

function getRatedEvents() {
  // Get all rated acts from all events
  // ratings[eventId][actName] = 1-10 or null
  const result = [];
   
  allEvents.forEach(event => {
    const eventId = String(event.id);
    const eventRatings = ratings[eventId];
    if (!eventRatings) return;
    
    // Determine event type (tour or festival)
    const eventType = event.event_type || 'tour';
    
    // Filter by type
    if (showsTypeFilter !== 'both' && eventType !== showsTypeFilter) return;
    
    // Get all concerts for this event
    const concerts = event.concerts || [];
    if (concerts.length === 0) {
      // Single event without concerts array - treat as one concert
      const concert = { date: event.date, time: event.time, venue: event.venue, city: event.city, price: event.price };
      processEventActs(event, concert, eventRatings, result, eventType);
    } else {
      // Multiple concerts - process each one
      concerts.forEach(concert => {
        processEventActs(event, concert, eventRatings, result, eventType);
      });
    }
  });
   
  return result;
}

function processEventActs(event, concert, eventRatings, result, eventType) {
  // Get all acts for this event/concert
  // For tours: event.artist + event.support
  // For festivals: event.artist + event.bands_to_watch
  // For single concerts: concert.artist + concert.support_present
  let allActs = [];
  
  if (concert.artist) {
    // This is a concert with its own artist
    allActs = [concert.artist];
    if (concert.support_present) {
      allActs.push(...concert.support_present);
    }
  } else if (event.support) {
    // Tour with global support list
    allActs = [event.artist];
    allActs.push(...event.support);
  } else if (event.bands_to_watch) {
    // Festival with bands_to_watch
    allActs = [event.artist];
    allActs.push(...event.bands_to_watch);
  } else if (event.supportActs) {
    // Festival with support acts (legacy)
    allActs = [event.artist];
    allActs.push(...event.supportActs);
  } else {
    // Fallback
    allActs = [event.artist];
  }
  
  // Also check for support_present on the concert
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

function renderShows() {
  const container = document.getElementById('shows-list');
  const ratedEvents = getRatedEvents();
  
  if (ratedEvents.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="icon">⭐</div><h3>Keine bewerteten Shows</h3><p>Bewerte Events, um sie hier zu sehen.</p></div>';
    renderHistograms([]);
    return;
  }
  
  // Sort events
  const sorted = [...ratedEvents].sort((a, b) => {
    switch (showsSort) {
      case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
      case 'rating-asc': return (a.rating || 0) - (b.rating || 0);
      case 'date-desc': return new Date(b.date) - new Date(a.date);
      case 'date-asc': return new Date(a.date) - new Date(b.date);
      case 'price-desc': return (b.price || 0) - (a.price || 0);
      case 'price-asc': return (a.price || 0) - (b.price || 0);
      case 'alpha': return (a.title || '').localeCompare(b.title || '');
      default: return 0;
    }
  });
  
  // Render based on category
  if (showsCategory === 'none') {
    container.innerHTML = sorted.map(e => renderShowCard(e)).join('');
  } else {
    // Group by category
    const groups = {};
    sorted.forEach(e => {
      let key;
      switch (showsCategory) {
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
    
    // Sort groups
    const sortedKeys = Object.keys(groups).sort();
    if (showsCategory === 'year') {
      sortedKeys.sort((a, b) => parseInt(b) - parseInt(a));
    }
    
    let html = '';
    sortedKeys.forEach(key => {
      html += `<div class="shows-category-header">${key}</div>`;
      html += groups[key].map(e => renderShowCard(e)).join('');
    });
    container.innerHTML = html;
  }
  
  // Render histograms
  renderHistograms(ratedEvents);
}

function renderShowCard(e) {
  const date = e.date ? new Date(e.date) : null;
  const dateStr = date ? date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
  const venue = e.venue || 'Unbekannt';
  const city = e.city || '';
  const price = e.price ? e.price + ' €' : '';
  const rating = e.rating || 0;
  const actName = e.actName || e.title || 'Unbekannt';
  
  // Event name: "[artist] - [tour_name]" for tours, "[name]" for festivals
  const eventType = e.eventType || 'tour';
  let eventName = '';
  if (eventType === 'festival') {
    eventName = e.name || e.title || '';
  } else {
    eventName = (e.artist || '') + (e.tour_name ? ' - ' + e.tour_name : '');
  }
   
  // Generate rating pips with color scale
  const pips = Array.from({length: 10}, (_, i) => {
    const pos = i + 1;
    const col = pipColor(rating, pos);
    const style = col ? `background:${col};border-color:${col}` : '';
    return `<div class="rating-pip" style="${style}"></div>`;
  }).join('');
   
  // All info in one line: Act • Date • EventName • Venue • City • Rating • Price
  return `<div class="event-card" onclick="openEventModal(${e.id})" style="padding:12px 16px">
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

function renderHistograms(events) {
  // Rating histogram (1-10) - track tour/festival separately
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
  
  // Year histogram - track tour/festival separately
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
  
  // City histogram - track tour/festival separately
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

function renderHistogramBars(containerId, counts, events, type, tourCounts, festCounts) {
  const container = document.getElementById(containerId);
  const maxCount = Math.max(...Object.values(counts), 1);
  
  // Get CSS colors
  const tourCol = getComputedStyle(document.documentElement).getPropertyValue('--tour').trim() || '#38bdf8';
  const festCol = getComputedStyle(document.documentElement).getPropertyValue('--festival').trim() || '#a78bfa';
  
  let html = '';
  Object.entries(counts).sort((a, b) => {
    if (type === 'Jahr') return parseInt(b[0]) - parseInt(a[0]);
    if (type === 'Bewertung') return parseInt(b[0]) - parseInt(a[0]); // Highest rating first
    return a[0].localeCompare(b[0]);
  }).forEach(([key, count]) => {
    if (count === 0) return;
    const pct = (count / maxCount) * 100;
    const label = type === 'Bewertung' ? key + ' ⭐' : key;
    
    // Calculate tour/festival proportions, scaled to maxCount
    const tourCount = tourCounts?.[key] || 0;
    const festCount = festCounts?.[key] || 0;
    const tourPct = (tourCount / maxCount) * 100;
    const festPct = (festCount / maxCount) * 100;
    
    let barContent = '';
    if (tourCount > 0 && festCount > 0) {
      // Two-colored bar - both scaled to maxCount
      barContent = `<div class="histogram-bar-fill" style="width:${tourPct}%;background:${tourCol};border-radius:3px 0 0 3px"></div>
        <div class="histogram-bar-fill" style="width:${festPct}%;background:${festCol};border-radius:0 3px 3px 0;margin-left:-1px"></div>`;
    } else if (tourCount > 0) {
      // Only tours - scaled to maxCount
      barContent = `<div class="histogram-bar-fill" style="width:${pct}%;background:${tourCol}"></div>`;
    } else if (festCount > 0) {
      // Only festivals - scaled to maxCount
      barContent = `<div class="histogram-bar-fill" style="width:${pct}%;background:${festCol}"></div>`;
    } else {
      // Fallback
      barContent = `<div class="histogram-bar-fill" style="width:${pct}%"></div>`;
    }
    
    html += `<div class="histogram-bar" onmouseenter="showHistogramTooltip(event, '${key}', ${JSON.stringify(events[key] || []).replace(/"/g, '"')})" onmouseleave="hideHistogramTooltip()">
      <span class="histogram-bar-label">${label}</span>
      <div class="histogram-bar-track" style="display:flex">
        ${barContent}
      </div>
      <span class="histogram-bar-count">${count}</span>
    </div>`;
  });
  
  container.innerHTML = html || '<div style="color:var(--muted);font-size:12px">Keine Daten</div>';
}

function showHistogramTooltip(event, key, eventList) {
  const tooltip = document.getElementById('histogram-tooltip');
  if (!eventList || eventList.length === 0) {
    tooltip.style.display = 'none';
    return;
  }
  
  const listHtml = eventList.map(e => `<div class="histogram-tooltip-item">${e.title || 'Unbekannt'} (${e.city || ''})</div>`).join('');
  tooltip.innerHTML = `<div class="histogram-tooltip-title">${key}</div><div class="histogram-tooltip-list">${listHtml}</div>`;
  tooltip.style.display = 'block';
  
  // Position tooltip
  const rect = event.target.getBoundingClientRect();
  tooltip.style.left = (rect.left + window.scrollX) + 'px';
  tooltip.style.top = (rect.bottom + window.scrollY + 8) + 'px';
}

function hideHistogramTooltip() {
  document.getElementById('histogram-tooltip').style.display = 'none';
}

function updateAllFilterVisuals() {
  const chipPast = document.getElementById('chip-past');
  const chipUpcoming = document.getElementById('chip-upcoming');
  const chipTour = document.getElementById('chip-tour');
  const chipFestival = document.getElementById('chip-festival');
  const chipTickets = document.getElementById('chip-tickets');
  const chipWatchlist = document.getElementById('chip-watchlist');
  
  // Date filter visuals
  if (dateFilter === 'past') {
    chipPast.className = 'filter-chip active-past';
    chipUpcoming.className = 'filter-chip';
  } else if (dateFilter === 'upcoming') {
    chipPast.className = 'filter-chip';
    chipUpcoming.className = 'filter-chip active-upcoming';
  } else {
    chipPast.className = 'filter-chip active-past';
    chipUpcoming.className = 'filter-chip active-upcoming';
  }
  
  // Event type filter visuals
  if (eventTypeFilter === 'both') {
    chipTour.className = 'filter-chip active-tour';
    chipFestival.className = 'filter-chip active-festival';
  } else if (eventTypeFilter === 'tour') {
    chipTour.className = 'filter-chip active-tour';
    chipFestival.className = 'filter-chip';
  } else {
    chipTour.className = 'filter-chip';
    chipFestival.className = 'filter-chip active-festival';
  }
  
  // Tag filter visuals
  if (activeFilters.has('tickets')) {
    chipTickets.className = 'filter-chip active-tickets';
  } else {
    chipTickets.className = 'filter-chip';
  }
  if (activeFilters.has('watchlist')) {
    chipWatchlist.className = 'filter-chip active-watchlist';
  } else {
    chipWatchlist.className = 'filter-chip';
  }
}
function toggleFilter(tag) {
  const chip = document.getElementById('chip-' + tag);
  if (activeFilters.has(tag)) {
    activeFilters.delete(tag);
    chip.className = 'filter-chip';
  } else {
    activeFilters.add(tag);
    chip.className = 'filter-chip active-' + tag;
  }
  // Update visual state: if no filters active, neither should be highlighted
  updateFilterVisualState();
  renderList(); renderCalendar(); renderTimeline();
  // Refresh map if initialized and visible
  if (mapInstance && currentTab === 'map') {
    // Remove existing map and markers
    mapMarkers.forEach(m => mapInstance.removeLayer(m));
    mapMarkers = [];
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    mapInitialized = false;
    // Reinitialize after a short delay
    setTimeout(() => initMap(), 100);
  }
}

function updateFilterVisualState() {
  // Tag filters: if none active, neither chip should be highlighted
  const chipTickets = document.getElementById('chip-tickets');
  const chipWatchlist = document.getElementById('chip-watchlist');
  if (activeFilters.size === 0) {
    chipTickets.className = 'filter-chip';
    chipWatchlist.className = 'filter-chip';
  } else if (!activeFilters.has('tickets') && !activeFilters.has('watchlist')) {
    // This shouldn't happen but just in case
    chipTickets.className = 'filter-chip';
    chipWatchlist.className = 'filter-chip';
  }
}

function toggleEventTypeFilter(type) {
  const chipTour = document.getElementById('chip-tour');
  const chipFestival = document.getElementById('chip-festival');
  
  if (eventTypeFilter === 'both') {
    // First click: switch to the selected type
    eventTypeFilter = type;
    if (type === 'tour') {
      chipTour.className = 'filter-chip active-tour';
      chipFestival.className = 'filter-chip';
    } else {
      chipTour.className = 'filter-chip';
      chipFestival.className = 'filter-chip active-festival';
    }
  } else if (eventTypeFilter === type) {
    // Clicking same type again: switch to "both" (all highlighted)
    eventTypeFilter = 'both';
    chipTour.className = 'filter-chip active-tour';
    chipFestival.className = 'filter-chip active-festival';
  } else {
    // Switching from one type to the other
    eventTypeFilter = type;
    if (type === 'tour') {
      chipTour.className = 'filter-chip active-tour';
      chipFestival.className = 'filter-chip';
    } else {
      chipTour.className = 'filter-chip';
      chipFestival.className = 'filter-chip active-festival';
    }
  }
  renderList(); renderCalendar(); renderTimeline();
  // Refresh map if initialized and visible
  if (mapInstance && currentTab === 'map') {
    mapMarkers.forEach(m => mapInstance.removeLayer(m));
    mapMarkers = [];
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    mapInitialized = false;
    setTimeout(() => initMap(), 100);
  }
}
function toggleDateFilter(type) {
  const chipPast = document.getElementById('chip-past');
  const chipUpcoming = document.getElementById('chip-upcoming');
  
  if (type === 'past') {
    if (dateFilter === 'past') {
      // If already showing past, also show upcoming (toggle behavior)
      dateFilter = 'both';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip active-upcoming';
    } else if (dateFilter === 'both') {
      // Switch to upcoming only
      dateFilter = 'upcoming';
      chipPast.className = 'filter-chip';
      chipUpcoming.className = 'filter-chip active-upcoming';
    } else {
      // Switch to past only
      dateFilter = 'past';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip';
    }
  } else if (type === 'upcoming') {
    if (dateFilter === 'upcoming') {
      // If already showing upcoming, also show past
      dateFilter = 'both';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip active-upcoming';
    } else if (dateFilter === 'both') {
      // Switch to past only
      dateFilter = 'past';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip';
    } else {
      // Switch to upcoming only
      dateFilter = 'upcoming';
      chipPast.className = 'filter-chip';
      chipUpcoming.className = 'filter-chip active-upcoming';
    }
  }
  // Only refresh list/calendar if not on map tab (date filter only applies to map)
  if (currentTab !== 'map') {
    renderList(); renderCalendar(); renderTimeline();
  }
  // Always refresh map if initialized and visible
  if (mapInstance && currentTab === 'map') {
    mapMarkers.forEach(m => mapInstance.removeLayer(m));
    mapMarkers = [];
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }
    mapInitialized = false;
    setTimeout(() => initMap(), 100);
  }
}
function eventVisible(ev) {
  // Event type filter - always apply
  if (eventTypeFilter !== 'both' && ev.event_type !== eventTypeFilter) return false;
  
  // Date filter - only apply to Map tab
  if (currentTab === 'map') {
    const todayIso = localIso(new Date());
    const latestDate = eventLatestDate(ev);
    const isPast = latestDate && latestDate < todayIso;
    
    if (dateFilter === 'past' && !isPast) return false;
    if (dateFilter === 'upcoming' && isPast) return false;
    // dateFilter === 'both' shows all events regardless of date
  }
  
  // Tag filter - only apply if any tag filters are active
  if (!activeFilters.size) return true;
  const tags = ev.event_type === 'festival' ? (ev.tags||[])
    : (ev.concerts||[]).flatMap(c => c.tags||[]);
  return [...activeFilters].some(f => tags.includes(f));
}

// ══════════════════════════════════════════════════════════════════════
// List render
// ══════════════════════════════════════════════════════════════════════
// Returns the latest ISO date string for an event (for past detection)
function eventLatestDate(ev) {
  if (ev.event_type === 'festival') return ev.end_date || ev.date || '';
  if (!ev.concerts || !ev.concerts.length) return '';
  return ev.concerts.reduce((max, c) => { const d = c.end_date || c.date || ''; return d > max ? d : max; }, '');
}
// Returns the earliest ISO date string for an event (for sorting)
function eventEarliestDate(ev) {
  if (ev.event_type === 'festival') return ev.date || '';
  if (!ev.concerts || !ev.concerts.length) return '';
  return ev.concerts.reduce((min, c) => { const d = c.date || ''; return (min === '' || d < min) ? d : min; }, '');
}

function renderList() {
  const el = document.getElementById('event-list');
  const vis = allEvents.filter(ev => eventVisible(ev));
  if (!vis.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">\uD83C\uDFB8</div><h3>Keine Events</h3>
      <p>Leg dein erstes Event mit \u201eNeues Event\u201c an.</p></div>`;
    return;
  }
  const todayIso = localIso(new Date());
  const upcoming = [], past = [];
  vis.forEach(ev => {
    const latest = eventLatestDate(ev);
    if (latest && latest < todayIso) past.push(ev);
    else upcoming.push(ev);
  });
  const byEarliest = (a, b) => eventEarliestDate(a).localeCompare(eventEarliestDate(b));
  upcoming.sort(byEarliest);
  past.sort(byEarliest);

  const upcomingHtml = upcoming.map(ev =>
    ev.event_type === 'festival' ? renderFestCard(ev, false) : renderTourCard(ev, false)
  ).join('');

  let pastHtml = '';
  if (past.length) {
    const pastCards = past.map(ev =>
      ev.event_type === 'festival' ? renderFestCard(ev, true) : renderTourCard(ev, true)
    ).join('');
    pastHtml = `<div class="past-section-divider"></div>
      <button class="past-section-toggle" id="past-toggle" onclick="togglePastSection()">
        <span class="pst-arrow">\u25B6</span>
        <span class="pst-label">Vergangene Events</span>
        <span class="pst-count">${past.length}</span>
      </button>
      <div class="past-events" id="past-events">${pastCards}</div>`;
  }
  el.innerHTML = upcomingHtml + pastHtml;
}

function togglePastSection() {
  const btn = document.getElementById('past-toggle');
  const body = document.getElementById('past-events');
  if (!btn) return;
  btn.classList.toggle('open');
  body.classList.toggle('open');
}

// ── Ratings helpers ──────────────────────────────────────────────────
// ratings stored as: ratings[eventId][actName] = 1-10 | null
let ratings = JSON.parse(localStorage.getItem('kp-ratings') || '{}');

function saveRatings() { localStorage.setItem('kp-ratings', JSON.stringify(ratings)); }

function getRating(eventId, act) {
  return ratings[eventId]?.[act] ?? null;
}
function setRating(eventId, act, val) {
  if (!ratings[eventId]) ratings[eventId] = {};
  ratings[eventId][act] = val;
  saveRatings();
  refreshAfterRating(eventId);
}
function resetRating(eventId, act) {
  if (ratings[eventId]) delete ratings[eventId][act];
  saveRatings();
  refreshAfterRating(eventId);
}
// ── Inline tag editing from detail view ───────────────────────────────
async function setConcertTag(eventId, concertId, tag, add) {
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'tour') return;
  const conc = (ev.concerts||[]).find(c => c.id === concertId);
  if (!conc) return;
  if (add) { if (!conc.tags.includes(tag)) conc.tags.push(tag); }
  else      { conc.tags = conc.tags.filter(t => t !== tag); }
  await patchEvent(ev);
}

async function setFestivalTag(eventId, tag, add) {
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'festival') return;
  if (add) { if (!ev.tags.includes(tag)) ev.tags.push(tag); }
  else      { ev.tags = ev.tags.filter(t => t !== tag); }
  await patchEvent(ev);
}

// ── Add support act to past event ─────────────────────────────────────
async function promptAddSupport(eventId, concertId) {
  const name = prompt('Support-Act Name:');
  if (!name || !name.trim()) return;
  
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'tour') return;
  const conc = (ev.concerts||[]).find(c => c.id === concertId);
  if (!conc) return;
  
  // Add the support act
  if (!conc.support_present) conc.support_present = [];
  if (!conc.support_present.includes(name.trim())) {
    conc.support_present.push(name.trim());
  }
  
  await patchEvent(ev);
  
  // Refresh the detail view to show the new support act in ratings
  // Get the updated event from allEvents (patchEvent reloads from server)
  const updatedEv = getEvent(eventId);
  if (updatedEv && document.getElementById('detail-bd').classList.contains('open')) {
    document.getElementById('detail-panel').innerHTML = buildDetailHTML(updatedEv);
  }
}

// ── Add band to past festival ─────────────────────────────────────────
async function promptAddFestivalBand(eventId) {
  const name = prompt('Band Name:');
  if (!name || !name.trim()) return;
  
  const ev = getEvent(eventId);
  if (!ev || ev.event_type !== 'festival') return;
  
  // Add the band to bands_to_watch
  if (!ev.bands_to_watch) ev.bands_to_watch = [];
  if (!ev.bands_to_watch.includes(name.trim())) {
    ev.bands_to_watch.push(name.trim());
  }
  
  await patchEvent(ev);
  
  // Refresh the detail view to show the new band in ratings
  // Get the updated event from allEvents (patchEvent reloads from server)
  const updatedEv = getEvent(eventId);
  if (updatedEv && document.getElementById('detail-bd').classList.contains('open')) {
    document.getElementById('detail-panel').innerHTML = buildDetailHTML(updatedEv);
  }
}

async function patchEvent(ev) {
  await fetch(`/api/events/${ev.id}`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(ev.to_dict ? ev.to_dict() : ev),
  });
  // Reload from server to get canonical state
  const r = await fetch('/api/events');
  allEvents = await r.json();
  renderList(); renderCalendar(); renderTimeline();
  // Re-render detail panel with updated data
  const updated = getEvent(ev.id);
  if (updated && document.getElementById('detail-bd').classList.contains('open')) {
    document.getElementById('detail-panel').innerHTML = buildDetailHTML(updated);
  }
}

function refreshAfterRating(eventId) {
  // Re-render the detail panel in place if it is currently showing this event
  const bd = document.getElementById('detail-bd');
  if (bd.classList.contains('open')) {
    const ev = getEvent(eventId);
    if (ev) {
      document.getElementById('detail-panel').innerHTML = buildDetailHTML(ev);
    }
  }
  // Also refresh the list so past-event cards (if visible) stay in sync
  renderList();
}

// Color for a rating pip at position pos (1-10), given total rating val
function pipColor(val, pos) {
  if (val === null || pos > val) return null; // grey
  // Interpolate hue: 0° (dark red) → 120° (dark green), sat/light fixed
  const t = (val - 1) / 9; // 0 at rating 1, 1 at rating 10
  const hue = Math.round(t * 120);
  return `hsl(${hue},70%,35%)`;
}

function ratingBarHtml(eventId, actName, isPast) {
  if (!isPast) return '';
  const val = getRating(eventId, actName);
  const pips = Array.from({length:10}, (_,i) => {
    const pos = i+1;
    const col = pipColor(val, pos);
    const style = col ? `background:${col};border-color:${col}` : '';
    return `<div class="rating-pip" style="${style}"
      onclick="event.stopPropagation();setRating('${eventId}','${actName.replace(/'/g,"\\'")}',${pos})"
      title="${pos}/10"></div>`;
  }).join('');
  const reset = val !== null
    ? `<button class="rating-reset" onclick="event.stopPropagation();resetRating('${eventId}','${actName.replace(/'/g,"\\'")}')" title="Zurücksetzen">✕</button>`
    : '';
  return `<div class="rating-row">
    <span class="rating-label">${esc(actName)}</span>
    <div class="rating-bar">${pips}${reset}</div>
  </div>`;
}

// ── Detail ratings block (shown only in detail/event-card view) ──────
// Renders all rating bars for a list of act names, aligned via fixed-width label
function renderDetailRatings(eventId, actNames) {
  return actNames.map(a => ratingBarHtml(eventId, a, true)).join('');
}

// ── Price formatter ───────────────────────────────────────────────────
function fmtPrice(p) {
  if (p == null || p === '') return '';
  const n = parseFloat(p);
  if (isNaN(n)) return String(p);
  return Number.isInteger(n) ? `${n} €` : `${n.toFixed(2)} €`;
}

// ── Google Maps embed ─────────────────────────────────────────────────
function venueMapHtml(venue, city, zoom = 15) {
  if (!venue) return '';
  const query = encodeURIComponent(`${venue}, ${city || ''}`.replace(/,\s*$/, ''));
  const embedUrl = `https://maps.google.com/maps?q=${query}&t=&z=${zoom}&ie=UTF8&iwloc=&output=embed`;
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
  return `<div class="venue-map" data-zoom="${zoom}" data-query="${query}">
    <iframe src="${embedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
    <div class="venue-map-controls">
      <a class="venue-map-zoom" onclick="event.stopPropagation();var m=this.closest('.venue-map');var z=Math.max(3,parseInt(m.dataset.zoom)-1);m.dataset.zoom=z;m.querySelector('iframe').src='https://maps.google.com/maps?q='+m.dataset.query+'&t=&z='+z+'&ie=UTF8&iwloc=&output=embed'">− Zoom out</a>
      <a class="venue-map-zoom" onclick="event.stopPropagation();var m=this.closest('.venue-map');var z=Math.min(20,parseInt(m.dataset.zoom)+1);m.dataset.zoom=z;m.querySelector('iframe').src='https://maps.google.com/maps?q='+m.dataset.query+'&t=&z='+z+'&ie=UTF8&iwloc=&output=embed'">+ Zoom in</a>
      <a class="venue-map-link" href="${searchUrl}" target="_blank">In Google Maps öffnen →</a>
    </div>
  </div>`;
}

// ── Poster clickable ──────────────────────────────────────────────────
function posterEl(poster, placeholder) {
  if (!poster) return `<div class="event-poster-placeholder">${placeholder}</div>`;
  return `<img class="event-poster" src="/static/posters/${poster}" alt=""
    onclick="event.stopPropagation();openLightbox('/static/posters/${poster}')" title="Poster vergrößern"
    style="cursor:zoom-in">`;
}
function openLightbox(src) {
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

// ── Render helpers ────────────────────────────────────────────────────
function renderTourCard(tour, isPast) {
  const ps = posterEl(tour.poster, '♪');
  const concerts = activeFilters.size
    ? tour.concerts.filter(c => [...activeFilters].some(f => c.tags.includes(f)))
    : tour.concerts;
  const concertsHtml = concerts.map(c => renderConcertRow(c, tour.id, isPast)).join('');
  // Get earliest date for header display
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

function renderConcertRow(c, eventId, isPast) {
  const d = parseDate(c.date);
  const tagHtml = (c.tags||[]).map(t => `<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?'✓ Tickets':'☆ Merkliste'}</span>`).join('');
  const actHtml = (c.support_present||[]).map(a => `<span class="act-chip">${esc(a)}</span>`).join('');
  const endLabel = c.end_date ? `<div class="date-end">→ ${fmtDateShort(c.end_date)}</div>` : '';
  return `<div class="concert-item">
    <div class="date-block">
      <div class="date-day">${d.day}</div>
      <div class="date-month">${d.month}</div>
      <div class="date-year">${d.year}</div>
      ${endLabel}
    </div>
    <div class="concert-info">
      <div class="concert-venue">${esc(c.venue)}</div>
      <div class="concert-city">📍 ${esc(c.city)}</div>
      ${c.time ? `<div class="concert-time">🕓 ${esc(c.time)} Uhr</div>` : ''}
      ${actHtml ? `<div class="concert-support-acts">${actHtml}</div>` : ''}
    </div>
    <div class="concert-right">
      ${c.price ? `<div class="concert-price">${fmtPrice(c.price)}</div>` : ''}
      ${c.ticket_link ? `<a href="${esc(c.ticket_link)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="ticket-link-btn">Ticketlink</a>` : ''}
      <div class="tags">${tagHtml}</div>
    </div>
  </div>`;
}

function renderFestCard(fest, isPast) {
  const ps = posterEl(fest.poster, '◉');
  const d = parseDate(fest.date);
  const endLabel = fest.end_date ? `<div class="date-end">→ ${fmtDateShort(fest.end_date)}</div>` : '';
  const tagHtml = (fest.tags||[]).map(t => `<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?'✓ Tickets':'☆ Merkliste'}</span>`).join('');
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
        <div class="concert-city">📍 ${esc(fest.city)}</div>
        ${fest.time ? `<div class="concert-time">🕓 ${esc(fest.time)} Uhr</div>` : ''}
        ${bandsHtml ? `<div class="concert-support-acts">${bandsHtml}</div>` : ''}
      </div>
      <div class="concert-right">
        ${fest.price ? `<div class="concert-price">${fmtPrice(fest.price)}</div>` : ''}
        <div class="tags">${tagHtml}</div>
      </div>
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════
// Detail view
// ══════════════════════════════════════════════════════════════════════
function openDetail(id) {
  // Always get fresh data from allEvents to ensure we have the latest
  const ev = getEvent(id);
  if (!ev) return;
  const bd = document.getElementById('detail-bd');
  const panel = document.getElementById('detail-panel');
  panel.innerHTML = buildDetailHTML(ev);
  bd.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeDetail() {
  document.getElementById('detail-bd').classList.remove('open');
  document.body.style.overflow = '';
}
function closeDetailOnBg(e) {
  if (e.target === document.getElementById('detail-bd')) closeDetail();
}

// ══════════════════════════════════════════════════════════════════════
// Event Invitation
// ══════════════════════════════════════════════════════════════════════
async function generateInvite(eventId) {
  try {
    const resp = await fetch('/api/events/' + eventId + '/invite');
    const data = await resp.json();
    
    if (!resp.ok) {
      alert(data.error || 'Einladung konnte nicht erstellt werden');
      return;
    }
    
    // Build full URL
    const fullUrl = window.location.origin + data.invite_url;
    
    // Copy to clipboard
    await navigator.clipboard.writeText(fullUrl);
    alert('Einladungslink wurde in die Zwischenablage kopiert!\n\n' + fullUrl);
    
  } catch (err) {
    alert('Fehler: ' + err.message);
  }
}

function buildDetailHTML(ev) {
  const ps = ev.poster
    ? `<img class="detail-poster" src="/static/posters/${ev.poster}" alt=""
        onclick="openLightbox('/static/posters/${ev.poster}')"
        style="cursor:zoom-in" title="Poster vergrößern">`
    : `<div class="detail-poster-ph">${ev.event_type==='festival'?'◉':'♪'}</div>`;

  const commentBlock = ev.comment
    ? `<div class="detail-comment"><div class="detail-comment-label">Notiz</div>${esc(ev.comment)}</div>` : '';

  if (ev.event_type === 'festival') {
    const todayIsoF = localIso(new Date());
    const evIsPastF = !!(eventLatestDate(ev) && eventLatestDate(ev) < todayIsoF);
    const allBandsF = ev.bands_to_watch||[];
    const d = parseDate(ev.date);
    const endLabel = ev.end_date ? `<div class="date-end">→ ${fmtDateShort(ev.end_date)}</div>` : '';
    const tagHtml = (ev.tags||[]).map(t => `<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?'✓ Tickets':'☆ Merkliste'}</span>`).join('');
    const bandsHtml = allBandsF.map(b=>`<span class="band-chip">${esc(b)}</span>`).join('');
    return `
      <div class="detail-header">
        ${ps}
        <div class="detail-meta">
          <div style="display:flex;gap:7px;align-items:center;margin-bottom:4px">
            <span class="type-badge festival">Festival</span>
          </div>
          <div class="detail-title">${esc(ev.name)}</div>
          <div class="detail-subtitle">${esc(ev.tour_name||'')}</div>
        </div>
        <div class="detail-close-row">
          <button class="btn-icon" onclick="openEventModal(getEvent('${ev.id}'));closeDetail()" title="Event bearbeiten">✏️</button>
          <button class="btn-icon" onclick="generateInvite('${ev.id}')" title="Event-Einladung erstellen">🔗</button>
          <button class="btn-icon delete" onclick="if(confirm('Event löschen?')){deleteEvent('${ev.id}');closeDetail()}" title="Event löschen">🗑</button>
          <button class="btn-close" onclick="closeDetail()">✕</button>
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
            <div class="concert-city">📍 ${esc(ev.city)}</div>
            ${ev.time ? `<div class="concert-time">🕓 ${esc(ev.time)} Uhr</div>` : ''}
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
          🎟 Tickets gekauft
        </button>
        <button class="tag-toggle ${(ev.tags||[]).includes('watchlist')?'active-watchlist':''}"
          onclick="setFestivalTag('${ev.id}','watchlist',${!(ev.tags||[]).includes('watchlist')});void 0">
          🔖 Merkliste
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
    const endLabel = c.end_date ? `<div class="date-end">→ ${fmtDateShort(c.end_date)}</div>` : '';
    const tagHtml = (c.tags||[]).map(t=>`<span class="tag ${t==='tickets'?'tag-tickets':'tag-watchlist'}">${t==='tickets'?'✓ Tickets':'☆ Merkliste'}</span>`).join('');
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
        <div class="concert-city">📍 ${esc(c.city)}</div>
        ${c.time?`<div class="concert-time">🕓 ${esc(c.time)} Uhr</div>`:''}
        ${actHtml?`<div class="concert-support-acts">${actHtml}</div>`:''}
        ${c.venue ? venueMapHtml(c.venue, c.city) : ''}
      </div>
      <div class="concert-right">
        ${c.price?`<div class="concert-price">${fmtPrice(c.price)}</div>`:''}
        ${c.ticket_link?`<a href="${esc(c.ticket_link)}" target="_blank" rel="noopener" class="ticket-link-btn">Ticketlink</a>`:''}
        <div class="tags">
          <button class="tag-toggle ${c.tags.includes('tickets')?'active-tickets':''}"
            onclick="event.stopPropagation();setConcertTag('${ev.id}','${c.id}','tickets',${!c.tags.includes('tickets')});void 0">
            🎟 Tickets
          </button>
          <button class="tag-toggle ${c.tags.includes('watchlist')?'active-watchlist':''}"
            onclick="event.stopPropagation();setConcertTag('${ev.id}','${c.id}','watchlist',${!c.tags.includes('watchlist')});void 0">
            🔖 Merkliste
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
        <button class="btn-icon" onclick="openEventModal(getEvent('${ev.id}'));closeDetail()">✏️</button>
        <button class="btn-icon" onclick="generateInvite('${ev.id}')" title="Einladung erstellen">🔗</button>
        <button class="btn-icon delete" onclick="if(confirm('Event löschen?')){deleteEvent('${ev.id}');closeDetail()}">🗑</button>
        <button class="btn-close" onclick="closeDetail()">✕</button>
      </div>
    </div>
    <div class="detail-concerts">${concHtml}</div>
    ${commentBlock}`;
}

let mapInstance = null;
let mapMarkers = [];

// ══════════════════════════════════════════════════════════════════════
// Map
// ══════════════════════════════════════════════════════════════════════
function getVenueCache() {
  try { return JSON.parse(localStorage.getItem('kp-venue-cache') || '{}'); }
  catch { return {}; }
}
function saveVenueCache(cache) {
  localStorage.setItem('kp-venue-cache', JSON.stringify(cache));
}
async function getVenueCoords(venue, city) {
  const cache = getVenueCache();
  const key = `${venue}|${city}`;
  if (cache[key]) return cache[key];
  // Use Nominatim for geocoding (free, no API key needed)
  const query = encodeURIComponent(`${venue}, ${city || ''}`.replace(/,\s*$/, ''));
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
      headers: { 'User-Agent': 'Konzertplaner/1.0' }
    });
    const data = await resp.json();
    if (data && data.length > 0) {
      const coords = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      cache[key] = coords;
      saveVenueCache(cache);
      return coords;
    }
  } catch (e) { console.error('Geocoding error:', e); }
  return null;
}
let mapInitialized = false;
async function initMap() {
  console.log('initMap called, mapInitialized:', mapInitialized);
  if (mapInitialized) {
    setTimeout(() => mapInstance?.invalidateSize(), 100);
    return;
  }
  // Check if Leaflet is loaded
  if (typeof L === 'undefined') {
    console.error('Leaflet not loaded');
    document.getElementById('map').innerHTML = '<div style="padding:20px;color:red">Leaflet konnte nicht geladen werden. Bitte Seite neu laden.</div>';
    return;
  }
  console.log('Leaflet loaded, L:', typeof L);
  mapInitialized = true;
  // Wait for tab to be visible
  await new Promise(r => setTimeout(r, 100));
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  
  // Clean up any existing map instance
  if (mapInstance) {
    try { mapInstance.remove(); } catch(e) {}
    mapInstance = null;
  }
  
  try {
    mapInstance = L.map('map').setView([51.1657, 10.4515], 6);
    console.log('Map created, mapInstance:', mapInstance);
  } catch (e) {
    console.error('Error initializing map:', e);
    document.getElementById('map').innerHTML = '<div style="padding:20px;color:red">Fehler beim Erstellen der Karte: ' + e.message + '</div>';
    return;
  }
  try {
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18
    }).addTo(mapInstance);
    console.log('Tile layer added');
  } catch (e) {
    console.error('Error adding tile layer:', e);
  }
  // Add markers for all events - group by venue
  const events = allEvents.filter(ev => eventVisible(ev));
  const venueGroups = {};
  const unrecognizedVenues = []; // Track venues that couldn't be geocoded
  for (const ev of events) {
    if (ev.event_type === 'festival') {
      if (ev.venue && ev.city) {
        const coords = await getVenueCoords(ev.venue, ev.city);
        if (coords) {
          const key = `${coords.lat},${coords.lon}`;
          if (!venueGroups[key]) {
            venueGroups[key] = { lat: coords.lat, lon: coords.lon, venue: ev.venue, city: ev.city, concerts: [] };
          }
          venueGroups[key].concerts.push({ title: ev.name, date: ev.date, type: 'festival' });
        } else {
          // Track unrecognized venue
          const key = `${ev.venue}|${ev.city}`;
          if (!unrecognizedVenues.some(v => `${v.venue}|${v.city}` === key)) {
            unrecognizedVenues.push({ venue: ev.venue, city: ev.city });
          }
        }
      }
    } else {
      for (const c of ev.concerts || []) {
        if (c.venue && c.city) {
          const coords = await getVenueCoords(c.venue, c.city);
          if (coords) {
            const key = `${coords.lat},${coords.lon}`;
            if (!venueGroups[key]) {
              venueGroups[key] = { lat: coords.lat, lon: coords.lon, venue: c.venue, city: c.city, concerts: [] };
            }
            venueGroups[key].concerts.push({ title: Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist, date: c.date, type: 'tour' });
          } else {
            // Track unrecognized venue
            const key = `${c.venue}|${c.city}`;
            if (!unrecognizedVenues.some(v => `${v.venue}|${v.city}` === key)) {
              unrecognizedVenues.push({ venue: c.venue, city: c.city });
            }
          }
        }
      }
    }
  }
  
  // Display unrecognized venues list
  const unrecognizedDiv = document.getElementById('unrecognized-venues');
  const unrecognizedList = document.getElementById('unrecognized-venues-list');
  if (unrecognizedVenues.length > 0) {
    unrecognizedDiv.style.display = 'block';
    unrecognizedList.innerHTML = unrecognizedVenues.map(v =>
      `<div class="unrecognized-item">
        <div class="unrecognized-info"><span>${esc(v.venue)}</span> <span>${esc(v.city)}</span></div>
        <button class="btn-sm" onclick="addUnrecognizedVenueMarker('${esc(v.venue)}', '${esc(v.city)}')">📍 Markieren</button>
      </div>`
    ).join('');
  } else {
    unrecognizedDiv.style.display = 'none';
    unrecognizedList.innerHTML = '';
  }
  // Add markers for each venue group
  Object.values(venueGroups).forEach(vg => {
    const count = vg.concerts.length;
    // Determine marker type: only show "mixed" if there are BOTH tours AND festivals
    const hasTours = vg.concerts.some(c => c.type === 'tour');
    const hasFestivals = vg.concerts.some(c => c.type === 'festival');
    let typeClass;
    if (hasTours && hasFestivals) {
      typeClass = 'mixed';
    } else if (hasFestivals) {
      typeClass = 'festival';
    } else {
      typeClass = 'tour';
    }
    // Create marker with count badge
    const icon = L.divIcon({
      className: 'venue-marker',
      html: `<div class="venue-marker-inner ${typeClass}"><span>${count}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
    const marker = L.marker([vg.lat, vg.lon], {
      icon,
      venueKey: `${vg.venue}|${vg.city}`,
      draggable: true
    }).addTo(mapInstance);
    
    // Disable dragging initially
    if (marker.dragging) {
      marker.dragging.disable();
    }
    
    // Build popup content with all concerts
    const concertsList = vg.concerts.map(c =>
      `<div class="venue-popup-concert">
        <span class="venue-popup-type ${c.type}">${c.type === 'festival' ? '◉' : '♪'}</span>
        <span class="venue-popup-title">${esc(c.title)}</span>
        <span class="venue-popup-date">${c.date}</span>
      </div>`
    ).join('');
    const popupContent = `
      <div class="venue-popup">
        <div class="venue-popup-header">${esc(vg.venue)}</div>
        <div class="venue-popup-city">📍 ${esc(vg.city)}</div>
        <div class="venue-popup-list">${concertsList}</div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
          <button class="venue-popup-edit" onclick="editVenueMarker(this, '${esc(vg.venue)}', '${esc(vg.city)}')">📍 Bearbeiten</button>
          <button class="venue-popup-delete" onclick="deleteVenueMarker('${esc(vg.venue)}', '${esc(vg.city)}')">🗑️ Löschen</button>
        </div>
      </div>
    `;
    marker.bindPopup(popupContent);
    
    // Save marker for later reference
    marker.venueKey = `${vg.venue}|${vg.city}`;
    mapMarkers.push(marker);
  });
  // Fit bounds
  if (mapMarkers.length > 0) {
    const group = L.featureGroup(mapMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.1));
  }
  // Remove loading message
  if (mapEl && mapEl.firstChild && mapEl.firstChild.tagName === 'DIV') {
    mapEl.innerHTML = '';
  }
  setTimeout(() => mapInstance?.invalidateSize(), 300);
  console.log('initMap completed, markers:', mapMarkers.length);
}

// Edit venue marker position - manual save
let pendingEditMarker = null;
let pendingEditVenue = null;
let pendingEditCity = null;
let editMarkerClickHandler = null;

function editVenueMarker(btn, venue, city) {
  const marker = mapMarkers.find(m => m.venueKey === `${venue}|${city}`);
  if (!marker) {
    console.error('Marker not found for:', venue, city);
    return;
  }
  
  // Clean up any existing edit state
  if (editMarkerClickHandler) {
    mapInstance.off('click', editMarkerClickHandler);
    editMarkerClickHandler = null;
  }
  if (pendingEditMarker && pendingEditMarker.dragging) {
    pendingEditMarker.dragging.disable();
  }
  
  // Close popup
  mapInstance.closePopup();
  
  // Store pending edit
  pendingEditMarker = marker;
  pendingEditVenue = venue;
  pendingEditCity = city;
  
  // Enable dragging
  if (marker.dragging) {
    marker.dragging.enable();
  }
  
  // Create popup with Save button
  const popupContent = `
    <div style="min-width: 150px; text-align: center;">
      <b>${venue}</b><br>
      <span style="color: #666; font-size: 12px;">${city}</span><br><br>
      <span style="font-size: 11px; color: var(--muted);">Ziehe den Marker oder klicke auf die Karte</span><br><br>
      <button class="btn-save-marker" onclick="saveEditedVenueMarker()">💾 Speichern</button>
    </div>
  `;
  marker.bindPopup(popupContent).openPopup();
  
  // Listen for map click to update position (but not save)
  editMarkerClickHandler = function(e) {
    marker.setLatLng(e.latlng);
  };
  
  mapInstance.on('click', editMarkerClickHandler);
}

// Save the edited venue marker
function saveEditedVenueMarker() {
  if (!pendingEditMarker || !pendingEditVenue || !pendingEditCity) {
    console.error('No pending edit to save');
    return;
  }
  
  const { venue, city } = { venue: pendingEditVenue, city: pendingEditCity };
  const latLng = pendingEditMarker.getLatLng();
  const newLat = latLng.lat;
  const newLon = latLng.lng;
  
  // Update cache
  const cache = getVenueCache();
  cache[`${venue}|${city}`] = { lat: newLat, lon: newLon };
  saveVenueCache(cache);
  
  // Clean up
  if (editMarkerClickHandler) {
    mapInstance.off('click', editMarkerClickHandler);
    editMarkerClickHandler = null;
  }
  if (pendingEditMarker.dragging) {
    pendingEditMarker.dragging.disable();
  }
  pendingEditMarker.closePopup();
  pendingEditMarker = null;
  pendingEditVenue = null;
  pendingEditCity = null;
  
  // Show confirmation
  alert(`Position von "${venue}" gespeichert:\n${newLat.toFixed(5)}, ${newLon.toFixed(5)}`);
  
  // Refresh the map
  mapInitialized = false;
  initMap();
}

// Add marker for unrecognized venue - click on map to place
let pendingUnrecognizedVenue = null;
let tempMarkerInstance = null;
let tempMarkerClickHandler = null;

async function addUnrecognizedVenueMarker(venue, city) {
  if (!mapInstance) {
    alert('Bitte wechsle zuerst zur Karten-Ansicht.');
    return;
  }
  
  // Clean up any existing pending marker
  if (tempMarkerInstance) {
    if (tempMarkerClickHandler) {
      mapInstance.off('click', tempMarkerClickHandler);
      tempMarkerClickHandler = null;
    }
    tempMarkerInstance.remove();
    tempMarkerInstance = null;
  }
  
  // Close any popups
  mapInstance.closePopup();
  
  // Store pending venue
  pendingUnrecognizedVenue = { venue, city };
  
  // Try Google Maps geocoding first (using Places API via direct fetch)
  let initialLatLng = null;
  const query = encodeURIComponent(`${venue}, ${city || ''}`.replace(/,\s*$/, ''));
  
  // Try Google Maps geocoding (no API key needed for basic geocoding)
  try {
    const googleResp = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${query}&sensor=false`);
    const googleData = await googleResp.json();
    if (googleData.status === 'OK' && googleData.results && googleData.results.length > 0) {
      initialLatLng = {
        lat: googleData.results[0].geometry.location.lat,
        lng: googleData.results[0].geometry.location.lng
      };
      console.log('Google geocoding found:', initialLatLng);
    }
  } catch (e) {
    console.log('Google geocoding failed, trying manual placement:', e);
  }
  
  // If no Google result, use map center
  if (!initialLatLng) {
    initialLatLng = mapInstance.getCenter();
  }
  
  // Add a temporary marker at the position
  tempMarkerInstance = L.marker(initialLatLng, { draggable: true }).addTo(mapInstance);
  
  // Create popup with Save button
  const popupContent = `
    <div style="min-width: 150px; text-align: center;">
      <b>${venue}</b><br>
      <span style="color: #666; font-size: 12px;">${city}</span><br><br>
      <button class="btn-save-marker" onclick="saveUnrecognizedVenueMarker()">💾 Speichern</button>
    </div>
  `;
  tempMarkerInstance.bindPopup(popupContent).openPopup();
  
  // Listen for clicks to update position (but not save)
  tempMarkerClickHandler = function(e) {
    tempMarkerInstance.setLatLng(e.latlng);
  };
  
  mapInstance.on('click', tempMarkerClickHandler);
}

// Save the pending unrecognized venue marker
function saveUnrecognizedVenueMarker() {
  if (!pendingUnrecognizedVenue || !tempMarkerInstance) {
    console.error('No pending venue to save');
    return;
  }
  
  const { venue, city } = pendingUnrecognizedVenue;
  const latLng = tempMarkerInstance.getLatLng();
  const newLat = latLng.lat;
  const newLon = latLng.lng;
  
  // Save to cache
  const cache = getVenueCache();
  cache[`${venue}|${city}`] = { lat: newLat, lon: newLon };
  saveVenueCache(cache);
  
  // Clean up
  if (tempMarkerClickHandler) {
    mapInstance.off('click', tempMarkerClickHandler);
    tempMarkerClickHandler = null;
  }
  tempMarkerInstance.closePopup();
  tempMarkerInstance.remove();
  tempMarkerInstance = null;
  pendingUnrecognizedVenue = null;
  
  // Show confirmation
  alert(`Position von "${venue}" gespeichert:\n${newLat.toFixed(5)}, ${newLon.toFixed(5)}`);
  
  // Refresh the map to show the new marker
  mapInitialized = false;
  initMap();
}

// Delete a known venue marker and add it back to the unknown list
function deleteVenueMarker(venue, city) {
  if (!confirm(`Möchtest du den Marker für "${venue}" in ${city} wirklich löschen? Der Veranstaltungsort wird wieder in die Liste der unbekannten Orte aufgenommen.`)) {
    return;
  }
  
  // Remove from cache
  const cache = getVenueCache();
  delete cache[`${venue}|${city}`];
  saveVenueCache(cache);
  
  // Find and remove the marker from the map
  const markerIndex = mapMarkers.findIndex(m => m.venueKey === `${venue}|${city}`);
  if (markerIndex !== -1) {
    const marker = mapMarkers[markerIndex];
    mapInstance.removeLayer(marker);
    mapMarkers.splice(markerIndex, 1);
  }
  
  // Refresh the map
  mapInitialized = false;
  initMap();
}

// ══════════════════════════════════════════════════════════════════════
// Calendar
// ══════════════════════════════════════════════════════════════════════
function renderCalendar() {
  const MONTHS_DE = ['Januar','Februar','März','April','Mai','Juni',
    'Juli','August','September','Oktober','November','Dezember'];
  document.getElementById('cal-title').textContent = `${MONTHS_DE[calMonth]} ${calYear}`;
  const grid = document.getElementById('cal-grid');
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);

  let dow = new Date(calYear, calMonth, 1).getDay();
  dow = dow === 0 ? 6 : dow - 1;
  const dim  = new Date(calYear, calMonth+1, 0).getDate();
  const dimp = new Date(calYear, calMonth, 0).getDate();
  const total = Math.ceil((dow + dim) / 7) * 7;

  const entries = [];
  allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      entries.push({ iso: ev.date, end_iso: ev.end_date, label: ev.name, type: 'festival', tags: ev.tags||[], id: ev.id });
    } else {
      (ev.concerts||[]).forEach(c => {
        const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        entries.push({ iso: c.date, end_iso: c.end_date, label: artistLabel, type: 'tour', tags: c.tags||[], data: c, id: ev.id });
      });
    }
  });

  for (let i = 0; i < total; i++) {
    let dayNum, isOther = false, cellDate;
    if (i < dow)         { dayNum = dimp - dow + i + 1; isOther = true; cellDate = new Date(calYear, calMonth-1, dayNum); }
    else if (i >= dow+dim){ dayNum = i - dow - dim + 1;  isOther = true; cellDate = new Date(calYear, calMonth+1, dayNum); }
    else                  { dayNum = i - dow + 1;                        cellDate = new Date(calYear, calMonth,   dayNum); }

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (isOther ? ' other-month' : '') +
      (cellDate.toDateString() === today.toDateString() ? ' today' : '');

    const dateDiv = document.createElement('div');
    dateDiv.className = 'cal-date'; dateDiv.textContent = dayNum;
    cell.appendChild(dateDiv);

    // Build ISO from LOCAL date parts to avoid UTC-offset shift
    const iso = `${cellDate.getFullYear()}-${String(cellDate.getMonth()+1).padStart(2,'0')}-${String(cellDate.getDate()).padStart(2,'0')}`;
    const evDiv = document.createElement('div');
    evDiv.className = 'cal-events';

    entries.filter(e => e.iso === iso || (e.end_iso && e.iso <= iso && e.end_iso >= iso))
      .forEach(e => {
        const el = document.createElement('div');
        const cls = e.type === 'festival' ? 'ev-festival'
          : e.type === 'tour' ? 'ev-tour'
          : e.tags.includes('tickets') ? 'ev-tickets'
          : e.tags.includes('watchlist') ? 'ev-watchlist' : 'ev-tour';
        el.className = 'cal-event' + (cls ? ' '+cls : '');
        el.textContent = e.label;
        el.addEventListener('click', ev => { ev.stopPropagation(); openDetail(e.id); });
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
function calNav(d) {
  calMonth += d;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0)  { calMonth = 11; calYear--; }
  renderCalendar();
}

// ══════════════════════════════════════════════════════════════════════
// Timeline
// ══════════════════════════════════════════════════════════════════════

function initTimeline() {
  const viewport = document.getElementById('timeline-viewport');
  if (!viewport) return; // Element not found yet
  
  let isDown = false;
  let startX;
  let scrollLeft;
  
  // Mouse events
  viewport.addEventListener('mousedown', (e) => {
    isDown = true;
    viewport.classList.add('active');
    startX = e.pageX - viewport.offsetLeft;
    scrollLeft = viewport.scrollLeft;
  });
  
  viewport.addEventListener('mouseleave', () => {
    isDown = false;
    viewport.classList.remove('active');
  });
  
  viewport.addEventListener('mouseup', () => {
    isDown = false;
    viewport.classList.remove('active');
  });
  
  viewport.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - viewport.offsetLeft;
    const walk = (x - startX) * 1.5;
    viewport.scrollLeft = scrollLeft - walk;
  });
  
  // Touch events for mobile
  viewport.addEventListener('touchstart', (e) => {
    isDown = true;
    viewport.classList.add('active');
    startX = e.touches[0].pageX - viewport.offsetLeft;
    scrollLeft = viewport.scrollLeft;
  }, { passive: true });
  
  viewport.addEventListener('touchend', () => {
    isDown = false;
    viewport.classList.remove('active');
  });
  
  viewport.addEventListener('touchmove', (e) => {
    if (!isDown) return;
    const x = e.touches[0].pageX - viewport.offsetLeft;
    const walk = (x - startX) * 1.5;
    viewport.scrollLeft = scrollLeft - walk;
  }, { passive: true });
  
  // Initialize timeline with all events loaded
  // Calculate the full time range from first to last event
  const allEventDates = [];
  allEvents.forEach(ev => {
    if (ev.event_type === 'festival') {
      allEventDates.push(new Date(ev.date));
      if (ev.end_date) allEventDates.push(new Date(ev.end_date));
    } else {
      (ev.concerts || []).forEach(c => {
        allEventDates.push(new Date(c.date));
        if (c.end_date) allEventDates.push(new Date(c.end_date));
      });
    }
  });
  
  if (allEventDates.length > 0) {
    allEventDates.sort((a, b) => a - b);
    const firstDate = allEventDates[0];
    const lastDate = allEventDates[allEventDates.length - 1];
    
    // Set timeline start to show first event at left edge with 1 month buffer
    timelineStartDate = new Date(firstDate);
    timelineStartDate.setDate(1);
    timelineStartDate.setMonth(timelineStartDate.getMonth() - 1);
    
    // Calculate total months to show (full range from first to last event)
    const totalMonths = Math.ceil((lastDate - timelineStartDate) / (1000 * 60 * 60 * 24 * 30));
    
    // Adjust zoom level to fit all events in the viewport
    timelineZoomLevel = 0; // Start with 1 year view
    const zoomMonthsTotal = zoomMonths[timelineZoomLevel] * 30;
    while (totalMonths > zoomMonthsTotal && timelineZoomLevel < 4) {
      timelineZoomLevel++;
    }
    
    // Store the full time range for consistent day width calculation
    timelineFullMonths = totalMonths;
  } else {
    // No events - use default
    timelineStartDate = new Date();
    timelineStartDate.setDate(1);
    timelineStartDate.setMonth(timelineStartDate.getMonth() - 1);
    timelineZoomLevel = 0;
    timelineFullMonths = 12; // Default 1 year
  }
  
  // Store for use in renderTimeline
  timelineFullRangeCalculated = true;
}

function timelineZoom(direction) {
  timelineZoomLevel += direction;
  if (timelineZoomLevel < 0) timelineZoomLevel = 0;
  if (timelineZoomLevel > 4) timelineZoomLevel = 4;
  document.getElementById('timeline-zoom-label').textContent = zoomLabels[timelineZoomLevel];
  // Disable scroll handler during zoom to prevent jumping
  timelineScrollHandlerEnabled = false;
  renderTimeline();
  // Re-enable after scroll
  setTimeout(() => { timelineScrollHandlerEnabled = true; }, 100);
}

function timelineNav(months) {
  // Move timeline start date by specified months (negative = past, positive = future)
  timelineStartDate.setMonth(timelineStartDate.getMonth() + months);
  // Disable scroll handler during navigation to prevent jumping
  timelineScrollHandlerEnabled = false;
  renderTimeline();
  // Re-enable after scroll
  setTimeout(() => { timelineScrollHandlerEnabled = true; }, 100);
}

function timelineNavEvent(direction) {
  // direction: -1 = previous event, 1 = next event
  const viewport = document.getElementById('timeline-viewport');
  if (!viewport) return;
  
  const start = new Date(timelineStartDate);
  const months = zoomMonths[timelineZoomLevel];
  const totalDays = months * 30;
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + totalDays);
  
  // Collect all event dates
  const eventDates = [];
  allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      eventDates.push(new Date(ev.date));
    } else {
      (ev.concerts || []).forEach(c => {
        eventDates.push(new Date(c.date));
      });
    }
  });
  
  if (eventDates.length === 0) return;
  
  eventDates.sort((a, b) => a - b);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find the closest event in the requested direction
  let targetEvent = null;
  if (direction === 1) {
    // Next event: find first event after today
    targetEvent = eventDates.find(d => d >= today);
    if (!targetEvent) targetEvent = eventDates[eventDates.length - 1]; // Wrap to last if none after today
  } else {
    // Previous event: find last event before or on today
    const pastEvents = eventDates.filter(d => d < today);
    if (pastEvents.length > 0) {
      targetEvent = pastEvents[pastEvents.length - 1];
    } else {
      targetEvent = eventDates[0]; // Wrap to first if none before today
    }
  }
  
  // Calculate new start date to show the target event at 10%
  const dayWidth = getDayWidth();
  const daysSinceStart = Math.floor((targetEvent - start) / (1000 * 60 * 60 * 24));
  const scrollPos = daysSinceStart * dayWidth - viewport.offsetWidth * 0.1;
  viewport.scrollLeft = Math.max(0, scrollPos);
}

function getDayWidth() {
  // Calculate day width based on full time range to show all events at once
  const fullMonths = timelineFullMonths || 12;
  const viewportWidth = document.getElementById('timeline-viewport')?.offsetWidth || 800;
  const totalDays = Math.ceil(fullMonths * 30);
  return Math.max(viewportWidth / totalDays, 10); // At least 10px per day
}

function timelineToday() {
  const viewport = document.getElementById('timeline-viewport');
  const track = document.getElementById('timeline-track');
  if (!viewport || !track) return;
  const today = new Date();
  const start = new Date(timelineStartDate);
  const dayWidth = getDayWidth();
  const daysSinceStart = Math.floor((today - start) / (1000 * 60 * 60 * 24));
  // Scroll to position today at 10% of the visible area (left 10% = past, right 90% = future)
  const scrollPos = daysSinceStart * dayWidth - viewport.offsetWidth * 0.1;
  viewport.scrollLeft = Math.max(0, scrollPos);
}

function renderTimeline() {
  const axis = document.getElementById('timeline-axis');
  const eventsContainer = document.getElementById('timeline-events');
  const track = document.getElementById('timeline-track');
  const viewport = document.getElementById('timeline-viewport');
  
  // Guard: elements not ready yet
  if (!axis || !eventsContainer || !track || !viewport) return;
  
  // Calculate the full time range from first to last event for consistent day width
  const fullMonths = timelineFullMonths || 12;
  const fullTotalDays = Math.ceil(fullMonths * 30);
  
  // Calculate day width based on full time range to show all events at once
  const viewportWidth = viewport.offsetWidth || 800;
  const dayWidth = Math.max(viewportWidth / fullTotalDays, 10); // At least 10px per day
  
  // Calculate the visible time range based on zoom level
  const months = zoomMonths[timelineZoomLevel];
  const totalDays = Math.ceil(months * 30);
  const trackWidth = fullTotalDays * dayWidth;
  
  track.style.width = trackWidth + 'px';
  axis.innerHTML = '';
  eventsContainer.innerHTML = '';
  
  const start = new Date(timelineStartDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Render month markers (below day labels) - based on full time range
  const monthsNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  for (let m = 0; m <= fullMonths; m++) {
    const markerDate = new Date(start);
    markerDate.setMonth(markerDate.getMonth() + m);
    const daysFromStart = (markerDate - start) / (1000 * 60 * 60 * 24);
    const left = daysFromStart * dayWidth;
    
    if (left <= trackWidth) {
      const marker = document.createElement('div');
      marker.className = 'timeline-month-marker';
      marker.style.left = left + 'px';
      marker.innerHTML = '<span class="timeline-month-label">' + monthsNames[markerDate.getMonth()] + ' ' + markerDate.getFullYear().toString().slice(2) + '</span>';
      axis.appendChild(marker);
    }
  }
  
  // Render daily minor ticks (only when zoomed in enough)
  if (months <= 6) { // Show daily ticks for 6 months or less
    for (let d = 0; d <= fullTotalDays; d++) {
      const tickDate = new Date(start);
      tickDate.setDate(tickDate.getDate() + d);
      const daysFromStart = d;
      const left = daysFromStart * dayWidth;
      
      if (left <= trackWidth) {
        const tick = document.createElement('div');
        tick.className = 'timeline-day-tick';
        tick.style.left = left + 'px';
        // Only show day number
        const dayOfWeek = tickDate.getDay(); // 0 = Sunday
        if (dayOfWeek === 1 || d % 1 === 0) {
          tick.innerHTML = '<span class="timeline-day-label">' + tickDate.getDate() + '</span>';
        }
        axis.appendChild(tick);
      }
    }
  }
  
  // Render today line
  const daysSinceStart = (today - start) / (1000 * 60 * 60 * 24);
  if (daysSinceStart >= 0 && daysSinceStart <= fullTotalDays) {
    const todayLine = document.createElement('div');
    todayLine.className = 'timeline-today-line';
    todayLine.style.left = (daysSinceStart * dayWidth) + 'px';
    todayLine.innerHTML = '<span class="timeline-today-label">HEUTE</span>';
    eventsContainer.appendChild(todayLine);
  }
  
  // Collect and render events
  const entries = [];
  allEvents.filter(ev => eventVisible(ev)).forEach(ev => {
    if (ev.event_type === 'festival') {
      entries.push({
        iso: ev.date,
        end_iso: ev.end_date || ev.date,
        label: ev.name,
        type: 'festival',
        tags: ev.tags || [],
        id: ev.id,
        poster: ev.poster || null
      });
    } else {
      (ev.concerts || []).forEach(c => {
        const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        entries.push({
          iso: c.date,
          end_iso: c.end_date || c.date,
          label: artistLabel,
          type: 'tour',
          tags: c.tags || [],
          data: c,
          id: ev.id,
          poster: ev.poster || null,
          artist: ev.artist || []
        });
      });
    }
  });
  
  // Sort by date
  entries.sort((a, b) => new Date(a.iso) - new Date(b.iso));
  
  // Track rows for overlapping events - store event info for height calculation
  const rows = [];
  
  // Check if we should show logos/posters (only for 1 month and 2 weeks zoom levels)
  const showMedia = timelineZoomLevel >= 3; // 3 = 1 Monat, 4 = 2 Wochen
  
  // Calculate available height for events (viewport height - axis height - date label space)
  // Use fixed values to ensure consistent height across all zoom levels
  const viewportHeight = 200; // Fixed viewport height
  const axisHeight = 28; // Fixed axis height
  const dateLabelHeight = 16; // Fixed date label height
  const availableHeight = viewportHeight - axisHeight - dateLabelHeight - 8; // 8px padding
  
  // First pass: assign rows and collect row info
  entries.forEach(e => {
    const eventStart = new Date(e.iso);
    const eventEnd = new Date(e.end_iso);
    
    // Calculate event position relative to timeline start
    const eventStartDays = (eventStart - start) / (1000 * 60 * 60 * 24);
    const eventEndDays = (eventEnd - start) / (1000 * 60 * 60 * 24);
    
    // Calculate event duration in days (at least 1 day for single-day events)
    const eventDurationDays = Math.max(1, eventEndDays - eventStartDays + 1);
    
    // Find available row - render all events, not just those in visible range
    let row = 0;
    while (true) {
      const rowEnd = rows[row]?.endDay || 0;
      if (eventStartDays >= rowEnd) {
        if (!rows[row]) rows[row] = { events: [], endDay: 0 };
        rows[row].events.push(e);
        rows[row].endDay = eventEndDays;
        break;
      }
      row++;
      if (row > 10) break; // Max 11 rows
    }
  });
  
  // Calculate how many rows have events
  const activeRows = rows.filter(r => r && r.events.length > 0);
  let rowCount = activeRows.length || 1;
  
  // Limit rows to fit within available height (with some padding)
  const maxRows = Math.floor(availableHeight / 40); // At least 40px per row
  if (rowCount > maxRows) rowCount = maxRows;
  
  // Use a fixed height per row that doesn't change when scrolling
  // This ensures consistent event heights regardless of which events are visible
  const heightPerRow = 40; // Fixed height per row
  
  // Second pass: render events with proper heights
  let currentRowIndex = 0;
  rows.forEach((rowData, rowIndex) => {
    if (!rowData || rowData.events.length === 0) return;
    
    const eventsInRow = rowData.events;
    const eventsInRowCount = eventsInRow.length;
    
    // If only one event in row, use full row height. If multiple, divide equally.
    const heightForThisRow = eventsInRowCount === 1 ? heightPerRow : Math.floor(heightPerRow / eventsInRowCount);
    
    eventsInRow.forEach((e, eventIndex) => {
      const eventStart = new Date(e.iso);
      const eventEnd = new Date(e.end_iso);
      
      const eventStartDays = (eventStart - start) / (1000 * 60 * 60 * 24);
      const eventEndDays = (eventEnd - start) / (1000 * 60 * 60 * 24);
      
      const eventDurationDays = Math.max(1, eventEndDays - eventStartDays + 1);
      
      const left = Math.max(0, eventStartDays) * dayWidth;
      const width = eventDurationDays * dayWidth;
      
      const el = document.createElement('div');
      let cls = e.type;
      
      el.className = 'timeline-event ' + cls;
      el.style.left = left + 'px';
      el.style.width = width + 'px';
      el.style.top = (currentRowIndex * heightPerRow + 4) + 'px';
      el.style.height = (heightForThisRow - 8) + 'px';
      
      // For tours: show artist logos stacked; for festivals: show poster
      // Only show media for zoom levels 1 Monat (3) and 2 Wochen (4)
      if (showMedia) {
        if (e.type === 'festival') {
          // Festival: use poster
          if (e.poster) {
            el.innerHTML = `<img src="/static/posters/${e.poster}" alt="${esc(e.label)}" style="width:100%;height:100%;object-fit:cover;border-radius:4px;">`;
          } else {
            el.textContent = e.label;
          }
        } else {
          // Tour: show artist logos - full width, proportional height per band
          const headliner = e.artist || e.data?.artist || e.label;
          const headlinerList = Array.isArray(headliner) ? headliner : (headliner ? [headliner] : []);
          const supportActs = e.data?.support_present || [];
          const allActs = [...headlinerList, ...supportActs].filter(Boolean);
          const stringActs = allActs.filter(a => typeof a === 'string');
          const uniqueActs = [...new Set(stringActs.map(a => a.toLowerCase()))].map(l => stringActs.find(a => a.toLowerCase() === l));
          
          const logoHtml = [];
          const logoHeight = Math.max(24, Math.floor(heightPerEvent * 0.7 / uniqueActs.length)); // Proportional height
          
          for (const artistName of uniqueActs) {
            const artist = artists.find(a => a.name.toLowerCase() === artistName.toLowerCase());
            if (artist && artist.logo) {
              logoHtml.push(`<img src="/static/logos/${artist.logo}" alt="${esc(artistName)}" style="width:${logoHeight}px;height:${logoHeight}px;border-radius:50%;object-fit:cover;border:1px solid var(--bg);flex-shrink:0;">`);
            }
          }
          if (logoHtml.length > 0) {
            el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:center;width:100%;height:100%;padding:2px;">${logoHtml.join('')}</div>`;
          } else {
            el.textContent = e.label;
            el.style.fontSize = '11px';
          }
        }
      } else {
        // For zoom levels 1 Jahr, 6 Monate, 3 Monate: show vertical text
        el.innerHTML = `<div class="timeline-event-vertical">${esc(e.label)}</div>`;
      }
      el.title = e.label + '\n' + e.iso + (e.end_iso !== e.iso ? ' - ' + e.end_iso : '');
      
      // Add date label above event
      const dateLabel = document.createElement('div');
      dateLabel.className = 'timeline-event-date';
      const dateParts = e.iso.split('-');
      const day = dateParts[2];
      const month = dateParts[1];
      dateLabel.textContent = day + '.' + month + '.';
      el.appendChild(dateLabel);
      
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openDetail(e.id);
      });
      
      if (e.data) {
        el.addEventListener('mouseenter', evt => showPopover(evt, e.data));
        el.addEventListener('mouseleave', hidePopover);
      }
      
      eventsContainer.appendChild(el);
    });
    
    currentRowIndex++;
  });
  
  // Scroll to today on first render (handled in fetchAll)
  if (!timelineInitialized) {
    timelineInitialized = true;
  }
}

// ══════════════════════════════════════════════════════════════════════
// Popover
// ══════════════════════════════════════════════════════════════════════
function showPopover(e, c) {
  const p = document.getElementById('popover');
  p.innerHTML = `<div class="pop-title">${esc(c.artist||'')}</div>
    <div class="pop-row">📅 <span>${fmtDateLong(c.date)}${c.end_date?' – '+fmtDateLong(c.end_date):''}</span></div>
    ${c.time?`<div class="pop-row">🕓 <span>${esc(c.time)} Uhr</span></div>`:''}
    <div class="pop-row">📍 <span>${esc(c.venue)}, ${esc(c.city)}</span></div>
    ${c.price?`<div class="pop-row">€ <span>${fmtPrice(c.price)}</span></div>`:''}`;
  p.style.left = (e.clientX+12)+'px'; p.style.top = (e.clientY-10)+'px';
  p.classList.add('vis');
}
function hidePopover() { document.getElementById('popover').classList.remove('vis'); }

// ══════════════════════════════════════════════════════════════════════
// Drawer
// ══════════════════════════════════════════════════════════════════════
function toggleDrawer() {
  document.getElementById('drawer-backdrop').classList.toggle('open');
}
function closeDrawerOnBg(e) {
  if (e.target.classList.contains('drawer-overlay')) toggleDrawer();
}
function closeDrawer() {
  document.getElementById('drawer-backdrop').classList.remove('open');
}

// ══════════════════════════════════════════════════════════════════════
// Generic modal helpers
// ══════════════════════════════════════════════════════════════════════
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
function closeMbg(id, e) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

// ══════════════════════════════════════════════════════════════════════
// Event modal
// ══════════════════════════════════════════════════════════════════════
function openEventModal(ev) {
  closeDrawer();
  editingId = ev ? ev.id : null;
  pendingBlob = { tour: null, festival: null };
  savedPoster = { tour: ev?.poster||null, festival: ev?.poster||null };

  document.getElementById('type-chooser').style.display = ev ? 'none' : 'block';
  document.getElementById('event-modal-title').textContent = ev ? 'Event bearbeiten' : 'Neues Event';

  selectType(ev ? ev.event_type : 'tour', false);

  if (!ev || ev.event_type === 'tour') {
    // Handle both single artist (string) and multiple artists (list)
    const artistData = ev?.artist;
    if (Array.isArray(artistData)) {
      pillState.artist.tags = [...artistData];
    } else if (artistData) {
      pillState.artist.tags = [artistData];
    } else {
      pillState.artist.tags = [];
    }
    renderPills('artist');
    document.getElementById('f-tourname').value = ev?.tour_name || '';
    document.getElementById('f-tour-comment').value = ev?.comment || '';
    pillState.support.tags = [...(ev?.support||[])];
    renderPills('support');
    document.getElementById('concert-blocks').innerHTML = '';
    (ev?.concerts||[]).forEach(c => addConcertBlock(c));
    setPosterPreview('tour', ev?.poster||null);
  }
  if (!ev || ev.event_type === 'festival') {
    document.getElementById('f-fest-name').value     = ev?.name || '';
    document.getElementById('f-fest-city').value     = ev?.city || '';
    document.getElementById('f-fest-venue').value    = ev?.venue || '';
    document.getElementById('f-fest-date').value     = ev?.date || '';
    document.getElementById('f-fest-time').value     = ev?.time || '';
    document.getElementById('f-fest-price').value      = ev?.price != null ? ev.price : '';
    document.getElementById('f-fest-ticketlink').value = ev?.ticket_link || '';
    document.getElementById('f-fest-enddate').value  = ev?.end_date || '';
    const multi = !!(ev?.end_date);
    document.getElementById('f-fest-multi').checked  = multi;
    document.getElementById('fest-end-grp').classList.toggle('visible', multi);
    document.getElementById('f-fest-tag-tickets').checked   = (ev?.tags||[]).includes('tickets');
    document.getElementById('f-fest-tag-watchlist').checked = (ev?.tags||[]).includes('watchlist');
    document.getElementById('f-fest-comment').value = ev?.comment || '';
    pillState.bands.tags = [...(ev?.bands_to_watch||[])];
    renderPills('bands');
    setPosterPreview('festival', ev?.poster||null);
  }

  openModal('event-modal');
}

function selectType(type, resetFields = true) {
  currentType = type;
  document.getElementById('tour-form').style.display     = type === 'tour'     ? 'block' : 'none';
  document.getElementById('festival-form').style.display = type === 'festival' ? 'block' : 'none';
  document.getElementById('opt-tour').className     = 'type-option' + (type === 'tour'     ? ' sel-tour'     : '');
  document.getElementById('opt-festival').className = 'type-option' + (type === 'festival' ? ' sel-festival' : '');
}

function toggleFestMulti() {
  const c = document.getElementById('f-fest-multi').checked;
  document.getElementById('fest-end-grp').classList.toggle('visible', c);
  if (c) syncEndDateMin('f-fest-date', 'f-fest-enddate');
}

// ── Poster ───────────────────────────────────────────────────────────
function setPosterPreview(which, filename) {
  const el = document.getElementById('pu-'+which);
  el.innerHTML = '';
  if (filename) {
    savedPoster[which] = filename;
    const img = document.createElement('img'); img.src = `/static/posters/${filename}`; el.appendChild(img);
  } else {
    savedPoster[which] = null;
    el.innerHTML = '<div class="pu-icon">🖌</div><div class="pu-label">Poster hochladen</div>';
  }
}
function previewBlob(which, blob) {
  pendingBlob[which] = blob;
  const url = URL.createObjectURL(blob);
  const el = document.getElementById('pu-'+which);
  el.innerHTML = ''; const img = document.createElement('img'); img.src = url; el.appendChild(img);
}
function handleFile(e, which) { const f = e.target.files[0]; if (f) previewBlob(which, f); }
function handleDrop(e, which) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) previewBlob(which, f);
}
document.addEventListener('paste', e => {
  if (!document.getElementById('event-modal').classList.contains('open')) return;
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) { previewBlob(currentType, item.getAsFile()); break; }
  }
});
async function uploadBlobIfNeeded(which) {
  const blob = pendingBlob[which];
  if (!blob) return savedPoster[which];
  const fd = new FormData(); fd.append('poster', blob);
  const r = await fetch('/api/upload-poster', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Upload fehlgeschlagen');
  return (await r.json()).filename;
}

// ── Concert blocks ───────────────────────────────────────────────────
let blockCount = 0;
function addConcertBlock(prefill) {
  blockCount++;
  const id = 'cb-'+blockCount;
  const div = document.createElement('div');
  div.className = 'concert-block'; div.id = id;
  // Store concert ID for later use
  if (prefill?.id) {
    div.dataset.concertId = prefill.id;
  }

  // support checkboxes - use existing support_present if editing, otherwise select all
  const currentSupport = pillState.support.tags;
  const presentList = prefill?.support_present ?? [...currentSupport];
  const supChecks = currentSupport.length
    ? `<div class="form-group full">
        <label>Support bei diesem Termin</label>
        <div class="support-checks">
          ${currentSupport.map(act => `
            <label class="sup-check">
              <input type="checkbox" class="cb-sup" data-act="${esc(act)}" ${presentList.includes(act)?'checked':''}>
              <div class="check-box">✓</div>
              <span>${esc(act)}</span>
            </label>`).join('')}
        </div>
      </div>` : '';

  div.innerHTML = `
    <div class="cb-head">
      <span class="cb-title">Termin ${blockCount}</span>
      <button type="button" class="btn-remove" onclick="document.getElementById('${id}').remove()">✕</button>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Datum *</label>
        <input type="date" class="cb-date" value="${prefill?.date||''}"
          oninput="syncEndDateMin(this, this.closest('.concert-block').querySelector('.cb-enddate'))">
      </div>
      <div class="form-group" style="justify-content:flex-end;padding-bottom:4px">
        <label class="toggle-row">
          <input type="checkbox" class="cb-multi" onchange="toggleCbMulti(this,'${id}')">
          <div class="toggle-track"></div>
          Mehrtägig
        </label>
      </div>
      <div class="form-group collapsible ${prefill?.end_date?'visible':''}" id="${id}-end">
        <label>Enddatum</label>
        <input type="date" class="cb-enddate" value="${prefill?.end_date||''}">
      </div>
      <div class="form-group">
        <label>Uhrzeit</label>
        <input type="time" class="cb-time" value="${prefill?.time||''}">
      </div>
      <div class="form-group">
        <label>Stadt *</label>
        <div class="pill-wrap">
          <input type="text" class="cb-city" placeholder="z.B. Berlin" value="${prefill?esc(prefill.city):''}"
            oninput="onVenueInput(this,'','venue-drop-${id}')"
            onblur="setTimeout(()=>closeAcDrop('venue-drop-${id}'),150)">
          <div class="ac-drop" id="venue-drop-${id}"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Venue *</label>
        <div class="pill-wrap">
          <input type="text" class="cb-venue" placeholder="z.B. Columbiahalle" value="${prefill?esc(prefill.venue):''}"
            oninput="onVenueInput(this,'','venue-drop2-${id}')"
            onblur="setTimeout(()=>closeAcDrop('venue-drop2-${id}'),150)">
          <div class="ac-drop" id="venue-drop2-${id}"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Preis (€)</label>
        <input type="number" class="cb-price" placeholder="Optional" min="0" step="0.01"
          value="${prefill?.price!=null?prefill.price:''}">
      </div>
      <div class="form-group">
        <label>Ticketlink</label>
        <input type="text" class="cb-ticketlink" placeholder="https://…"
          value="${prefill?.ticket_link||''}">
      </div>
      <div class="form-group">
        <label>Tags</label>
        <div class="tag-checks">
          <label class="tag-check"><input type="checkbox" class="cb-tag-tickets" ${prefill?.tags?.includes('tickets')?'checked':''}><div class="check-box">✓</div><span>🎟 Tickets</span></label>
          <label class="tag-check"><input type="checkbox" class="cb-tag-watchlist" ${prefill?.tags?.includes('watchlist')?'checked':''}><div class="check-box">✓</div><span>🔖 Merkliste</span></label>
        </div>
      </div>
      ${supChecks}
    </div>`;
  document.getElementById('concert-blocks').appendChild(div);

  if (prefill?.end_date) {
    div.querySelector('.cb-multi').checked = true;
  }
}
function toggleCbMulti(cb, id) {
  document.getElementById(id+'-end').classList.toggle('visible', cb.checked);
  if (cb.checked) {
    // sync min date for end date input
    const block = cb.closest('.concert-block');
    const startEl = block.querySelector('.cb-date');
    const endEl = block.querySelector('.cb-enddate');
    syncEndDateMin(startEl, endEl);
  }
}
function syncEndDateMin(startEl, endEl) {
  const startInput = typeof startEl === 'string' ? document.getElementById(startEl) : startEl;
  const endInput   = typeof endEl   === 'string' ? document.getElementById(endEl)   : endEl;
  if (!startInput || !endInput) return;
  const val = startInput.value;
  if (val) {
    endInput.min = val;
    // If end date is already set but before new start, clear it
    if (endInput.value && endInput.value < val) endInput.value = '';
    // Jump the end date picker calendar to the same month/year as start
    // (browsers don't expose a way to set the initial view, but setting value
    //  as a default is the next best thing when field is empty)
    if (!endInput.value) endInput.value = val;
  }
}

// ── Venue autocomplete in concert blocks / festival ──────────────────
function onVenueInput(inputEl, cityInputIdOrEl, dropId) {
  const input = typeof inputEl === 'string' ? document.getElementById(inputEl) : inputEl;
  const q = input.value.trim().toLowerCase();
  // Determine if the triggering input is a city field or a venue field
  const isCity = input.classList.contains('cb-city') || input.id === 'f-fest-city';
  const cityEl = typeof cityInputIdOrEl === 'string' && cityInputIdOrEl
    ? document.getElementById(cityInputIdOrEl)
    : (input.closest('.concert-block') ? input.closest('.concert-block').querySelector('.cb-city') : null);
  const city = cityEl ? cityEl.value.trim().toLowerCase() : '';
  const drop = document.getElementById(dropId);
  if (!drop) return;
  // Store which type of field triggered this, so pickVenue knows what to fill
  drop.dataset.fieldType = isCity ? 'city' : 'venue';
  if (!q) { drop.classList.remove('open'); return; }
  let suggestions = knownVenues.filter(v => {
    const matches = v.name.toLowerCase().includes(q) || v.city.toLowerCase().includes(q);
    if (!matches) return false;
    if (city && !isCity) return v.city.toLowerCase() === city;
    return true;
  }).slice(0, 8);
  if (!suggestions.length) { drop.classList.remove('open'); return; }
  drop.innerHTML = suggestions.map(v =>
    `<div class="ac-item" onmousedown="event.preventDefault()"
      onclick="pickVenue(this,'${dropId}','${esc(v.name)}','${esc(v.city)}')">
      ${esc(v.name)}<span style="color:var(--muted);font-size:12px"> · ${esc(v.city)}</span>
    </div>`
  ).join('');
  drop.classList.add('open');
}
function onFestCityInput() {
  const venue = document.getElementById('f-fest-venue');
  if (venue.value) onVenueInput('f-fest-venue', 'f-fest-city', 'venue-drop-fest');
}
function pickVenue(itemEl, dropId, venueName, cityName) {
  const drop = document.getElementById(dropId);
  const fieldType = drop.dataset.fieldType || 'venue';
  // The input that owns this dropdown is the one just before it in the DOM
  const container = drop.previousElementSibling;
  if (container) {
    const input = container.tagName === 'INPUT' ? container : container.querySelector('input');
    if (input) {
      // Fill the correct value based on which field type triggered the dropdown
      input.value = fieldType === 'city' ? cityName : venueName;
    }
    // For venue inputs in a concert block: also fill city if empty
    if (fieldType === 'venue') {
      const block = drop.closest('.concert-block');
      if (block) {
        const cityInput = block.querySelector('.cb-city');
        if (cityInput && !cityInput.value) cityInput.value = cityName;
      }
      // For festival venue field: fill city field if empty
      const festCity = document.getElementById('f-fest-city');
      if (festCity && !festCity.value) festCity.value = cityName;
    }
  }
  closeAcDrop(dropId);
}
function closeAcDrop(id) {
  const el = document.getElementById(id); if (el) el.classList.remove('open');
}

// ── Save ─────────────────────────────────────────────────────────────
async function saveEvent() {
  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Speichern…';
  try {
    const poster = await uploadBlobIfNeeded(currentType);
    let payload;
    if (currentType === 'festival') {
      const name = document.getElementById('f-fest-name').value.trim();
      const date = document.getElementById('f-fest-date').value;
      if (!name) { alert('Bitte Festivalnamen angeben.'); return; }
      if (!date) { alert('Bitte Startdatum angeben.'); return; }
      const tags = [];
      if (document.getElementById('f-fest-tag-tickets').checked)   tags.push('tickets');
      if (document.getElementById('f-fest-tag-watchlist').checked) tags.push('watchlist');
      payload = {
        event_type: 'festival', name,
        city:   document.getElementById('f-fest-city').value.trim(),
        venue:  document.getElementById('f-fest-venue').value.trim(),
        date,
        end_date: document.getElementById('f-fest-multi').checked ? document.getElementById('f-fest-enddate').value||null : null,
        time:  document.getElementById('f-fest-time').value||null,
        price: document.getElementById('f-fest-price').value||null,
        ticket_link: document.getElementById('f-fest-ticketlink').value.trim()||null,
        bands_to_watch: [...pillState.bands.tags],
        tags, poster,
        comment: document.getElementById('f-fest-comment').value.trim(),
      };
    } else {
      // Get artist list from pill state
      const artistList = [...pillState.artist.tags];
      if (!artistList.length) { alert('Bitte Artist angeben.'); return; }
      const blocks = document.querySelectorAll('.concert-block');
      const concerts = [];
      for (const b of blocks) {
        const date  = b.querySelector('.cb-date').value;
        const city  = b.querySelector('.cb-city').value.trim();
        const venue = b.querySelector('.cb-venue').value.trim();
        if (!date||!city||!venue) { alert('Bitte alle Pflichtfelder der Konzerttermine ausfüllen.'); return; }
        const tags = [];
        if (b.querySelector('.cb-tag-tickets').checked)   tags.push('tickets');
        if (b.querySelector('.cb-tag-watchlist').checked) tags.push('watchlist');
        const supPresent = [...b.querySelectorAll('.cb-sup:checked')].map(cb => cb.dataset.act);
        const concertId = b.dataset.concertId || null;
        concerts.push({
          id: concertId,
          date, city, venue,
          time:     b.querySelector('.cb-time').value||null,
          end_date: b.querySelector('.cb-multi').checked ? b.querySelector('.cb-enddate').value||null : null,
          price:    b.querySelector('.cb-price').value||null,
          ticket_link: b.querySelector('.cb-ticketlink')?.value?.trim()||null,
          tags, support_present: supPresent,
        });
      }
      payload = {
        event_type: 'tour', artist: artistList,
        tour_name: document.getElementById('f-tourname').value.trim()||'Tour',
        support: [...pillState.support.tags],
        concerts, poster,
        comment: document.getElementById('f-tour-comment').value.trim(),
      };
    }
    const url    = editingId ? `/api/events/${editingId}` : '/api/events';
    const method = editingId ? 'PUT' : 'POST';
    const r = await fetch(url, { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error('Server error');
    closeModal('event-modal');
    await fetchAll();
    // Small delay to ensure data is fully processed
    await new Promise(resolve => setTimeout(resolve, 50));
    // Re-open detail view with updated event
    if (editingId) {
      // Close detail view first to force complete re-render
      closeDetail();
      // Open detail view with fresh data
      openDetail(editingId);
    }
  } catch(err) {
    alert('Fehler: '+err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Speichern';
  }
}

// ── Delete ───────────────────────────────────────────────────────────
async function deleteEvent(id) {
  if (!confirm('Event wirklich löschen?')) return;
  await fetch('/api/events/'+id, { method: 'DELETE' });
  await fetchAll();
}
function getEvent(id) { return allEvents.find(e => e.id === id); }

// ══════════════════════════════════════════════════════════════════════
// Pill / autocomplete generic
// ══════════════════════════════════════════════════════════════════════
function focusPill(id) { document.getElementById(id).focus(); }

function renderPills(which) {
  const field = document.getElementById(which+'-field');
  const input = document.getElementById(which+'-input');
  field.querySelectorAll('.pill').forEach(p => p.remove());
  pillState[which].tags.forEach((tag, i) => {
    const pill = document.createElement('div'); pill.className = 'pill';
    pill.draggable = true;
    pill.dataset.index = i;
    pill.innerHTML = `${esc(tag)}<button type="button" class="p-rm" onclick="removePill('${which}',${i})">✕</button>`;
    
    // Drag events for pill reordering
    pill.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', i.toString());
      e.dataTransfer.setData('which', which);
      pill.classList.add('dragging');
    });
    pill.addEventListener('dragend', () => {
      pill.classList.remove('dragging');
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('drag-over'));
    });
    pill.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!pill.classList.contains('dragging')) {
        pill.classList.add('drag-over');
      }
    });
    pill.addEventListener('dragleave', () => {
      pill.classList.remove('drag-over');
    });
    pill.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const fromWhich = e.dataTransfer.getData('which');
      const toIndex = parseInt(pill.dataset.index);
      
      if (fromWhich === which && fromIndex !== toIndex) {
        // Reorder the tags array
        const tags = pillState[which].tags;
        const [moved] = tags.splice(fromIndex, 1);
        tags.splice(toIndex, 0, moved);
        renderPills(which);
      }
      pill.classList.remove('drag-over');
    });
    
    field.insertBefore(pill, input);
  });
  // Update concert blocks when support pills change
  if (which === 'support') {
    updateConcertBlockSupportChecks();
  }
}

function updateConcertBlockSupportChecks() {
  const currentSupport = pillState.support.tags;
  document.querySelectorAll('.concert-block').forEach(block => {
    // Remove existing support checks
    const existingGroup = block.querySelector('.form-group.full');
    if (existingGroup && existingGroup.querySelector('.support-checks')) {
      existingGroup.remove();
    }
    // Add new support checks if there are any
    if (currentSupport.length > 0) {
      const presentList = [...currentSupport];
      const supChecks = `<div class="form-group full">
        <label>Support bei diesem Termin</label>
        <div class="support-checks">
          ${currentSupport.map(act => `
            <label class="sup-check">
              <input type="checkbox" class="cb-sup" data-act="${esc(act)}" ${presentList.includes(act)?'checked':''}>
              <div class="check-box">✓</div>
              <span>${esc(act)}</span>
            </label>`).join('')}
        </div>
      </div>`;
      // Insert after the first form-group in the grid
      const firstFormGroup = block.querySelector('.form-grid > .form-group');
      if (firstFormGroup) {
        firstFormGroup.insertAdjacentHTML('afterend', supChecks);
      }
    }
  });
}
function removePill(which, i) { pillState[which].tags.splice(i,1); renderPills(which); }
function addPillTag(which, val) {
  val = val.trim();
  if (val && !pillState[which].tags.includes(val)) pillState[which].tags.push(val);
  document.getElementById(which+'-input').value = '';
  renderPills(which);
  closeAcDrop(which+'-drop');
}

function onPillInput(which) {
  const q = document.getElementById(which+'-input').value.trim().toLowerCase();
  if (!q) { closeAcDrop(which+'-drop'); return; }
  const starts   = knownBands.filter(b => b.toLowerCase().startsWith(q) && !pillState[which].tags.includes(b));
  const contains = knownBands.filter(b => b.toLowerCase().includes(q) && !b.toLowerCase().startsWith(q) && !pillState[which].tags.includes(b));
  const suggestions = [...starts, ...contains].slice(0,8);
  const drop = document.getElementById(which+'-drop');
  if (!suggestions.length) { drop.classList.remove('open'); return; }
  drop.innerHTML = suggestions.map(s => {
    const idx = s.toLowerCase().indexOf(q);
    const h = idx >= 0 ? esc(s.slice(0,idx))+'<span class="hi-text">'+esc(s.slice(idx,idx+q.length))+'</span>'+esc(s.slice(idx+q.length)) : esc(s);
    return `<div class="ac-item" onmousedown="event.preventDefault()" onclick="addPillTag('${which}','${s.replace(/'/g,"\\'")}')">
      ${h}</div>`;
  }).join('');
  drop.classList.add('open');
  pillState[which].hi = -1;
}
function onPillFocus(which) { onPillInput(which); }
function onPillBlur(which)  { setTimeout(() => closeAcDrop(which+'-drop'), 150); }
function onPillKey(e, which) {
  const items = document.querySelectorAll('#'+which+'-drop .ac-item');
  if (e.key === 'Enter') {
    e.preventDefault();
    const hi = pillState[which].hi;
    if (hi >= 0 && items[hi]) items[hi].click();
    else addPillTag(which, document.getElementById(which+'-input').value);
  } else if (e.key === 'Backspace' && !document.getElementById(which+'-input').value && pillState[which].tags.length) {
    pillState[which].tags.pop(); renderPills(which);
  } else if (e.key === ',' ) {
    e.preventDefault(); addPillTag(which, document.getElementById(which+'-input').value);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault(); pillState[which].hi = Math.min(pillState[which].hi+1, items.length-1);
    items.forEach((it,i) => it.classList.toggle('hi', i === pillState[which].hi));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); pillState[which].hi = Math.max(pillState[which].hi-1, -1);
    items.forEach((it,i) => it.classList.toggle('hi', i === pillState[which].hi));
  }
}

// ══════════════════════════════════════════════════════════════════════
// Artist catalogue
// ══════════════════════════════════════════════════════════════════════
function openArtistCatalogue() {
  closeDrawer();
  renderArtistList();
  openModal('artist-modal');
}

let _admStore = [];  // temp array to pass artist objects safely via index
function renderArtistList() {
  _admStore = [];
  const el = document.getElementById('artist-list');
  if (!artists.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">Noch keine Artists gespeichert.</div>';
    return;
  }
  el.innerHTML = artists.map(a => {
    const logoEl = a.logo
      ? `<div class="logo-drop-zone" style="border-style:solid"><img src="/static/logos/${a.logo}" alt=""></div>`
      : `<div class="logo-drop-zone">\uD83C\uDFAD</div>`;
    const nameEl = `<span style="flex:1;font-size:14px">${esc(a.name)}</span>`;
    const ratingsSummary = artistRatingsSummary(a.name);
    if (a.derived) {
      const followStar = a.followed ? '★' : '☆';
      const followStyle = a.followed ? 'color:var(--accent)' : 'color:var(--muted)';
      return `<div class="cat-item" style="cursor:pointer;flex-wrap:wrap" onclick="openArtistDetailById(${_admStore.push(a)-1})">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          ${logoEl}${nameEl}
        </div>
        <div class="cat-item-actions" onclick="event.stopPropagation()">
          <button class="follow-btn" title="${a.followed?'Entfolgen':'Folgen'}" style="${followStyle}"
            onclick="toggleFollow('${a.id}',${!a.followed})">${followStar}</button>
        </div>
        ${ratingsSummary ? `<div style="width:100%;padding:6px 0 2px 60px">${ratingsSummary}</div>` : ''}
      </div>`;
    }
    const followStar = a.followed ? '★' : '☆';
    const followStyle = a.followed ? 'color:var(--accent)' : 'color:var(--muted)';
    return `<div class="cat-item" style="cursor:pointer;flex-wrap:wrap" onclick="openArtistDetailById(${_admStore.push(a)-1})">
      <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
        ${logoEl}${nameEl}
      </div>
      <div class="cat-item-actions" onclick="event.stopPropagation()">
        <button class="follow-btn" title="${a.followed?'Entfolgen':'Folgen'}" style="${followStyle}"
          onclick="toggleFollow('${a.id}',${!a.followed})">${followStar}</button>
      </div>
      ${ratingsSummary ? `<div style="width:100%;padding:6px 0 2px 60px;font-size:12px;color:var(--muted)">${ratingsSummary}</div>` : ''}
    </div>`;
  }).join('');
}

// ── Artist detail popup ───────────────────────────────────────────────
let _admCurrentArtist = null;
let _admPendingBlob   = null;

function openArtistDetailById(idx) { openArtistDetail(_admStore[idx]); }
function openArtistDetail(a) {
  _admCurrentArtist = typeof a === 'string' ? JSON.parse(a) : a;
  _admPendingBlob   = { logo: null, photo: null };
  _admLastSlot      = 'logo';
  document.getElementById('adm-title').textContent = _admCurrentArtist.derived ? 'Artist speichern' : 'Artist bearbeiten';
  document.getElementById('adm-name').value = _admCurrentArtist.name;
  const logoZone  = document.getElementById('adm-logo-zone');
  const photoZone = document.getElementById('adm-photo-zone');
  if (_admCurrentArtist.logo) {
    logoZone.classList.add('has-img');
    document.getElementById('adm-logo-inner').innerHTML = `<img src="/static/logos/${_admCurrentArtist.logo}" alt="">`;
  } else {
    logoZone.classList.remove('has-img');
    document.getElementById('adm-logo-inner').innerHTML = '\uD83C\uDFAD';
  }
  if (_admCurrentArtist.photo) {
    photoZone.classList.add('has-img');
    document.getElementById('adm-photo-inner').innerHTML = `<img src="/static/logos/${_admCurrentArtist.photo}" alt="">`;
  } else {
    photoZone.classList.remove('has-img');
    document.getElementById('adm-photo-inner').innerHTML = '\uD83D\uDCF7';
  }
  // Show ratings
  document.getElementById('adm-ratings').innerHTML = artistDetailRatingsHtml(_admCurrentArtist.name);
  openModal('artist-detail-modal');
}

let _admLastSlot = 'logo'; // which slot was last interacted with (for paste)

function admPickFile(slot) {
  _admLastSlot = slot;
  // sync radio
  const radio = document.getElementById('adm-slot-'+slot);
  if (radio) radio.checked = true;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.onchange = () => { if (input.files[0]) admPreviewBlob(input.files[0], slot); };
  input.click();
}
function admHandleDrop(e, slot) {
  e.preventDefault();
  _admLastSlot = slot;
  const radio = document.getElementById('adm-slot-'+slot);
  if (radio) radio.checked = true;
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) admPreviewBlob(f, slot);
}
function admPreviewBlob(blob, slot) {
  _admPendingBlob[slot] = blob;
  const zoneId  = slot === 'logo' ? 'adm-logo-zone'  : 'adm-photo-zone';
  const innerId = slot === 'logo' ? 'adm-logo-inner'  : 'adm-photo-inner';
  const zone = document.getElementById(zoneId);
  zone.classList.add('has-img');
  document.getElementById(innerId).innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="">`;
}

document.addEventListener('paste', async e => {
  if (!document.getElementById('artist-detail-modal').classList.contains('open')) return;
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith('image/')) { admPreviewBlob(item.getAsFile(), _admLastSlot); break; }
  }
}, true);

async function uploadArtistImg(blob, artistName = null, imgType = 'logo') {
  if (!blob) return null;
  const fd = new FormData(); fd.append('logo', blob);
  if (artistName) fd.append('artist', artistName);
  fd.append('type', imgType);
  const r = await fetch('/api/upload-logo', { method:'POST', body: fd });
  return (await r.json()).filename;
}

async function deleteCurrentArtist() {
  const a = _admCurrentArtist;
  if (!a || a.derived) {
    // For derived artists, just close the modal (they don't exist in the database)
    closeModal('artist-detail-modal');
    return;
  }
  if (!confirm(`Artist "${a.name}" löschen?`)) return;
  await fetch('/api/artists/'+a.id, { method:'DELETE' });
  await reloadCatalogue();
  renderArtistList();
  closeModal('artist-detail-modal');
}

async function saveArtistDetail() {
  const name = document.getElementById('adm-name').value.trim();
  if (!name) { alert('Bitte einen Namen eingeben.'); return; }
  const a = _admCurrentArtist;
  const logoFilename  = _admPendingBlob.logo  ? await uploadArtistImg(_admPendingBlob.logo, name, 'logo')  : (a.logo  || null);
  const photoFilename = _admPendingBlob.photo ? await uploadArtistImg(_admPendingBlob.photo, name, 'photo') : (a.photo || null);
  const payload = { name, logo: logoFilename, photo: photoFilename };
  if (a.derived || !a.id) {
    await fetch('/api/artists', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  } else {
    await fetch('/api/artists/'+a.id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  }
  await reloadCatalogue();
  renderArtistList();
  closeModal('artist-detail-modal');
}

// ── Artist ratings summary (for catalogue list) ──────────────────────
function artistRatingsSummary(name) {
  const entries = [];
  const todayIso = localIso(new Date());
  allEvents.forEach(ev => {
    const latest = eventLatestDate(ev);
    if (!latest || latest >= todayIso) return; // only past
    if (ev.event_type === 'tour') {
      ev.concerts.forEach(c => {
        const allActs = [c.artist, ...(c.support_present||[])];
        if (allActs.some(a => a && a.toLowerCase() === name.toLowerCase())) {
          const r = getRating(ev.id, name);
          const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
          if (r !== null) entries.push({ label: `${esc(artistLabel)} · ${fmtDateShort(c.date)}`, rating: r });
        }
      });
    } else if (ev.event_type === 'festival') {
      if ((ev.bands_to_watch||[]).some(b => b.toLowerCase() === name.toLowerCase())) {
        const r = getRating(ev.id, name);
        if (r !== null) entries.push({ label: `${esc(ev.name)} · ${fmtDateShort(ev.date)}`, rating: r });
      }
    }
  });
  if (!entries.length) return '';
  // Build compact bar rows with event label
  return entries.map(e => {
    const pips = Array.from({length:10}, (_,i) => {
      const pos = i+1;
      const col = pipColor(e.rating, pos);
      const style = col ? `background:${col};border-color:${col}` : '';
      return `<div class="rating-pip" style="${style};width:14px;height:7px;cursor:default"></div>`;
    }).join('');
    const col = pipColor(e.rating, e.rating);
    return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px">
      <span style="color:var(--muted);min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.label}</span>
      <div style="display:flex;gap:2px;flex-shrink:0">${pips}</div>
      <strong style="color:${col};width:28px;text-align:right;flex-shrink:0">${e.rating}/10</strong>
    </div>`;
  }).join('');
}

// ── Artist detail: ratings display ───────────────────────────────────
function artistDetailRatingsHtml(name) {
  const entries = [];
  const todayIso = localIso(new Date());
  allEvents.forEach(ev => {
    const latest = eventLatestDate(ev);
    if (!latest || latest >= todayIso) return;
    if (ev.event_type === 'tour') {
      ev.concerts.forEach(c => {
        const allActs = [c.artist, ...(c.support_present||[])];
        if (allActs.some(a => a && a.toLowerCase() === name.toLowerCase())) {
          const r = getRating(ev.id, name);
          const artistLabel = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
          if (r !== null) entries.push({ label: `${esc(artistLabel)} – ${fmtDateShort(c.date)}`, sublabel: esc(c.venue), rating: r });
        }
      });
    } else if (ev.event_type === 'festival') {
      if ((ev.bands_to_watch||[]).some(b => b.toLowerCase() === name.toLowerCase())) {
        const r = getRating(ev.id, name);
        if (r !== null) entries.push({ label: esc(ev.name), sublabel: fmtDateShort(ev.date), rating: r });
      }
    }
  });
  if (!entries.length) return '';
  const rows = entries.map(e => {
    const pips = Array.from({length:10}, (_,i) => {
      const pos = i+1;
      const col = pipColor(e.rating, pos);
      const style = col ? `background:${col};border-color:${col}` : '';
      return `<div class="rating-pip" style="${style};cursor:default"></div>`;
    }).join('');
    const col = pipColor(e.rating, e.rating);
    return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:var(--text)">${e.label}</div>
        <div style="font-size:11px;color:var(--muted)">${e.sublabel}</div>
      </div>
      <div style="display:flex;gap:3px;flex-shrink:0">${pips}</div>
      <strong style="color:${col};width:32px;text-align:right;flex-shrink:0;font-size:13px">${e.rating}/10</strong>
    </div>`;
  }).join('');
  return `<div>
    <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Bewertungen</div>
    ${rows}
  </div>`;
}

async function addArtist() {
  const name = document.getElementById('new-artist-name').value.trim();
  if (!name) return;
  await fetch('/api/artists', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name}) });
  document.getElementById('new-artist-name').value = '';
  await reloadCatalogue();
  renderArtistList();
}

async function deleteArtist(id) {
  if (!confirm('Artist löschen?')) return;
  await fetch('/api/artists/'+id, { method:'DELETE' });
  await reloadCatalogue();
  renderArtistList();
}

// ══════════════════════════════════════════════════════════════════════
function openVenueCatalogue() { closeDrawer(); renderVenueList(); openModal('venue-modal'); }
function renderVenueList() {
  const el = document.getElementById('venue-list');
  if (!venuesCat.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px 0">Noch keine Venues gespeichert.</div>'; return; }
  el.innerHTML = venuesCat.map(v => {
    if (v.derived) {
      return `<div class="cat-item" style="opacity:.75">
        <div class="cat-logo">🏟</div>
        <span style="flex:1;font-size:14px;color:var(--muted)">${esc(v.name)}</span>
        <span style="font-size:12px;color:var(--muted);min-width:80px">${esc(v.city)}</span>
        <div class="cat-item-actions">
          <button class="btn-sm" onclick="promoteVenue('${esc(v.name).replace(/'/g,"\'")}','${esc(v.city).replace(/'/g,"\'")}')">＋ Speichern</button>
        </div>
      </div>`;
    }
    return `<div class="cat-item">
      <div class="cat-logo">🏟</div>
      <input class="cat-name-input" value="${esc(v.name)}" id="vn-${v.id}" onblur="saveVenue('${v.id}')">
      <input class="cat-city-input" value="${esc(v.city)}" id="vc-${v.id}" placeholder="Stadt" onblur="saveVenue('${v.id}')">
      <div class="cat-item-actions">
        <button class="btn-sm danger" onclick="deleteVenue('${v.id}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}
async function promoteVenue(name, city) {
  await fetch('/api/venues-catalogue', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, city}) });
  await reloadCatalogue();
  renderVenueList();
}
async function addVenue() {
  const name = document.getElementById('new-venue-name').value.trim();
  const city = document.getElementById('new-venue-city').value.trim();
  if (!name) return;
  await fetch('/api/venues-catalogue', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,city}) });
  document.getElementById('new-venue-name').value = '';
  document.getElementById('new-venue-city').value = '';
  await reloadCatalogue();
  renderVenueList();
}
async function saveVenue(id) {
  const name = document.getElementById('vn-'+id).value.trim();
  const city = document.getElementById('vc-'+id).value.trim();
  await fetch('/api/venues-catalogue/'+id, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name,city}) });
  await reloadCatalogue();
}
async function deleteVenue(id) {
  if (!confirm('Venue löschen?')) return;
  await fetch('/api/venues-catalogue/'+id, { method:'DELETE' });
  await reloadCatalogue();
  renderVenueList();
}

async function reloadCatalogue() {
  const [aR, vcR, bR, vR] = await Promise.all([
    fetch('/api/artists'), fetch('/api/venues-catalogue'),
    fetch('/api/bands'), fetch('/api/venues'),
  ]);
  artists     = await aR.json();
  venuesCat   = await vcR.json();
  knownBands  = await bR.json();
  knownVenues = await vR.json();
}

// ══════════════════════════════════════════════════════════════════════
// Design panel
// ══════════════════════════════════════════════════════════════════════
// Location settings
let _locationSettings = JSON.parse(localStorage.getItem('kp-location') || '{"city":"","preferred":[]}');

function openLocationSettings() {
  closeDrawer();
  document.getElementById('location-city').value = _locationSettings.city || '';
  document.getElementById('location-preferred').value = (_locationSettings.preferred || []).join(', ');
  openModal('location-modal');
}

function saveLocationSettings() {
  const city = document.getElementById('location-city').value.trim();
  const preferredStr = document.getElementById('location-preferred').value;
  const preferred = preferredStr.split(',').map(s => s.trim()).filter(s => s);
  _locationSettings = { city, preferred };
  localStorage.setItem('kp-location', JSON.stringify(_locationSettings));
  closeModal('location-modal');
}

function getLocationCity() { return _locationSettings.city || ''; }
function getPreferredCities() { return _locationSettings.preferred || []; }

// ══════════════════════════════════════════════════════════════════════
// Backup & Restore
function openBackupModal() {
  closeDrawer();
  document.getElementById('backup-status').innerHTML = '';
  openModal('backup-modal');
}

async function exportBackup() {
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
      location: _locationSettings,
      theme: localStorage.getItem('kp-theme'),
      colors: JSON.parse(localStorage.getItem('kp-colors') || '{}'),
      customCss: localStorage.getItem('kp-custom-css') || ''
    },
    // Additional local data
    ratings: JSON.parse(localStorage.getItem('kp-ratings') || '{}'),
    notifications: JSON.parse(localStorage.getItem('kp-notifs') || '[]')
  };
  
  const blob = new Blob([JSON.stringify(backup, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `konzertplaner-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  document.getElementById('backup-status').innerHTML = '<span style="color:var(--tickets-color)">✓ Backup erfolgreich heruntergeladen</span>';
}

async function importBackup(input) {
  const file = input.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const backup = JSON.parse(text);
    
    if (!backup.version || !backup.events) {
      throw new Error('Ungültiges Backup-Format');
    }
    
    // Import events
    for (const ev of backup.events) {
      await fetch('/api/events', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(ev)
      });
    }
    
    // Import artists
    for (const a of (backup.artists || [])) {
      await fetch('/api/artists', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: a.name, logo: a.logo, photo: a.photo, eventim_name: a.eventim_name})
      });
    }
    
    // Import venues
    for (const v of (backup.venues || [])) {
      await fetch('/api/venues-catalogue', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: v.name, city: v.city})
      });
    }
    
    // Import settings
    if (backup.settings) {
      if (backup.settings.location) {
        _locationSettings = backup.settings.location;
        localStorage.setItem('kp-location', JSON.stringify(_locationSettings));
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
    
    // Import ratings (version 2+)
    if (backup.ratings) {
      localStorage.setItem('kp-ratings', JSON.stringify(backup.ratings));
      ratings = backup.ratings;
    }
    
    // Import notifications (version 2+)
    if (backup.notifications) {
      localStorage.setItem('kp-notifs', JSON.stringify(backup.notifications.slice(-50)));
      _notifications = backup.notifications.slice(-50);
      updateNotifBadge();
    }
    
    document.getElementById('backup-status').innerHTML = '<span style="color:var(--tickets-color)">✓ Backup erfolgreich importiert</span>';
    
    // Reload data
    await fetchAll();
    
  } catch (err) {
    document.getElementById('backup-status').innerHTML = '<span style="color:#f87171">Fehler: ' + err.message + '</span>';
  }
  
  input.value = '';
}

// ══════════════════════════════════════════════════════════════════════
// Statistics
function openStatistics() {
  closeDrawer();
  const stats = calculateStats();
  _statEvents = stats.allTicketEvents;
  document.getElementById('stats-content').innerHTML = renderStatsHtml(stats);
  openModal('stats-modal');
}

function calculateStats() {
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
  let allTicketEvents = []; // Store all events with tickets for detail view
  
  allEvents.forEach(ev => {
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
        allTicketEvents.push({...ev, _type: 'festival', _price: price});
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
          allTicketEvents.push({...ev, _type: 'tour', _concert: c, _price: price});
        }
      });
    }
  });
  
  // Top artists
  const topArtists = Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topVenues = Object.entries(byVenue).sort((a, b) => b[1] - a[1]).slice(0, 5);
  
  // This year vs last year
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

function renderStatsHtml(s) {
  const fmtPrice = (p) => p ? (Number(p) || 0).toFixed(2).replace('.', ',') + ' €' : '–';
  const yearBars = Object.entries(s.byYear).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 5);
  const maxYear = Math.max(...Object.values(s.byYear), 1);
  
  let _statEvents = s.allTicketEvents;
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

let _statEvents = [];

function showStatDetail(type) {
  const events = _statEvents;
  const fmtPrice = (p) => p ? (Number(p) || 0).toFixed(2).replace('.', ',') + ' €' : '–';
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
  
  // Sort by date
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
      <button class="btn-cancel" onclick="openStatistics()">← Zurück</button>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:1.3rem;letter-spacing:1px">${title}</span>
      <span style="color:var(--accent)">${fmtPrice(total)}</span>
    </div>
    <div class="stat-list" style="max-height:60vh">
      ${listHtml || '<div style="text-align:center;color:var(--muted);padding:20px">Keine Events gefunden</div>'}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════
function openDesignPanel() { closeDrawer(); buildColorGrid(); openModal('design-modal'); }

// ══════════════════════════════════════════════════════════════════════
// Utilities
// ══════════════════════════════════════════════════════════════════════
// Theme toggle
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('kp-theme', isLight ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = isLight ? '🌙' : '☀️';
}

function loadTheme() {
  const theme = localStorage.getItem('kp-theme');
  if (theme === 'light') {
    document.documentElement.classList.add('light');
    document.getElementById('theme-toggle').textContent = '🌙';
  }
}

// ══════════════════════════════════════════════════════════════════════
function esc(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Export ────────────────────────────────────────────────────────────
function openExportModal() {
  updateFmtLabels();
  openModal('export-modal');
}

function updateFmtLabels() {
  const fmt = document.querySelector('input[name="exp-fmt"]:checked')?.value || 'html';
  document.getElementById('fmt-html-lbl').style.borderColor = fmt === 'html' ? 'var(--accent)' : 'var(--border)';
  document.getElementById('fmt-csv-lbl').style.borderColor  = fmt === 'csv'  ? 'var(--accent)' : 'var(--border)';
  document.getElementById('fmt-ical-lbl').style.borderColor = fmt === 'ical' ? 'var(--accent)' : 'var(--border)';
}

function runExport() {
  const inclTickets   = document.getElementById('exp-tickets').checked;
  const inclWatchlist = document.getElementById('exp-watchlist').checked;
  const inclUntagged  = document.getElementById('exp-untagged').checked;
  const inclPast      = document.getElementById('exp-past').checked;
  const fmt = document.querySelector('input[name="exp-fmt"]:checked')?.value || 'html';

  const todayIso = localIso(new Date());

  // Filter helper: does event pass the tag selections?
  function evPassesFilter(ev) {
    const tags = ev.event_type === 'festival' ? (ev.tags||[])
      : (ev.concerts||[]).flatMap(c => c.tags||[]);
    const hasTickets   = tags.includes('tickets');
    const hasWatchlist = tags.includes('watchlist');
    const hasNone      = !hasTickets && !hasWatchlist;
    return (inclTickets && hasTickets) || (inclWatchlist && hasWatchlist) || (inclUntagged && hasNone);
  }

  let vis = allEvents.filter(ev => evPassesFilter(ev));
  let upcoming = vis.filter(ev => !(eventLatestDate(ev) && eventLatestDate(ev) < todayIso));
  let past     = vis.filter(ev =>   eventLatestDate(ev) && eventLatestDate(ev) < todayIso);
  if (!inclPast) past = [];

  upcoming.sort((a,b) => eventEarliestDate(a).localeCompare(eventEarliestDate(b)));
  past.sort((a,b)     => eventEarliestDate(a).localeCompare(eventEarliestDate(b)));

  if (fmt === 'csv') {
    exportCSV(upcoming, past, todayIso);
  } else if (fmt === 'ical') {
    exportICS(upcoming, past, todayIso);
  } else {
    exportHTML(upcoming, past, todayIso);
  }
  closeModal('export-modal');
}

// ── CSV export ────────────────────────────────────────────────────────
function exportCSV(upcoming, past, todayIso) {
  const rows = [['Typ','Name/Artist','Tour/Festival','Datum','Enddatum','Uhrzeit','Stadt','Venue','Preis','Ticketlink','Tags','Support/Bands','Status']];
  function addEv(ev, status) {
    if (ev.event_type === 'festival') {
      rows.push([
        'Festival', ev.name, ev.name, ev.date||'', ev.end_date||'', ev.time||'',
        ev.city||'', ev.venue||'', ev.price||'', ev.ticket_link||'',
        (ev.tags||[]).join('; '), (ev.bands_to_watch||[]).join('; '), status
      ]);
    } else {
      (ev.concerts||[]).forEach(c => {
        const artistForExport = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        rows.push([
          'Konzert', artistForExport, ev.tour_name||'', c.date||'', c.end_date||'', c.time||'',
          c.city||'', c.venue||'', c.price||'', c.ticket_link||'',
          (c.tags||[]).join('; '), (c.support_present||[]).join('; '), status
        ]);
      });
    }
  }
  upcoming.forEach(ev => addEv(ev, 'anstehend'));
  past.forEach(ev => addEv(ev, 'vergangen'));
  const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
  dlBlob(csv, `konzertplaner-${todayIso}.csv`, 'text/csv;charset=utf-8');
}

// ── iCal export ───────────────────────────────────────────────────────
function exportICS(upcoming, past, todayIso) {
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
      // Festival: single multi-day event
      if (!ev.date) return;
      const uid = `festival-${ev.id || ev.name.replace(/\W/g,'')}@konzertplaner`;
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
        'DTSTAMP:' + todayIso.replace(/[-:]/g,'').replace('.','Z'),
        'DTSTART;VALUE=DATE:' + dtstart,
        'DTEND;VALUE=DATE:' + dtend,
        'SUMMARY:' + summary,
        location ? 'LOCATION:' + location : '',
        desc ? 'DESCRIPTION:' + desc : '',
        'STATUS:' + (status === 'vergangen' ? 'CONFIRMED' : 'TENTATIVE'),
        'END:VEVENT'
      );
    } else {
      // Tour: one event per concert
      (ev.concerts||[]).forEach(c => {
        if (!c.date) return;
        const artistForIcal = Array.isArray(ev.artist) ? ev.artist.join(' + ') : ev.artist;
        const uid = `concert-${c.id || c.date + '-' + (c.city||'').replace(/\W/g,'') + '-' + (artistForIcal||'').replace(/\W/g,'')}@konzertplaner`;
        const dtstart = (c.date + (c.time ? 'T' + c.time.replace(':','') + '00' : '')).replace(/[-:]/g,'');
        const dtend = (c.end_date || c.date + (c.time ? 'T' + c.time.replace(':','') + '00' : '')).replace(/[-:]/g,'');
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
          'DTSTAMP:' + todayIso.replace(/[-:]/g,'').replace('.','Z'),
          c.time ? 'DTSTART:' + dtstart : 'DTSTART;VALUE=DATE:' + c.date.replace(/-/g,''),
          c.time ? 'DTEND:' + dtend : 'DTEND;VALUE=DATE:' + (c.end_date || c.date).replace(/-/g,''),
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

  // Filter out empty lines
  const ics = lines.filter(l => l.trim()).join('\r\n');
  dlBlob(ics, `konzertplaner-${todayIso}.ics`, 'text/calendar;charset=utf-8');
}

// ── HTML export ───────────────────────────────────────────────────────
function exportHTML(upcoming, past, todayIso) {
  const accentCol = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8ff47';
  const tourCol   = getComputedStyle(document.documentElement).getPropertyValue('--tour').trim()   || '#38bdf8';
  const festCol   = getComputedStyle(document.documentElement).getPropertyValue('--festival').trim()|| '#a78bfa';

  function evHtml(ev) {
    if (ev.event_type === 'festival') {
      const d = parseDate(ev.date);
      const endStr = ev.end_date ? ` – ${fmtDateShort(ev.end_date)}` : '';
      const tagTxt = (ev.tags||[]).map(t => t==='tickets'?'✓ Tickets':'☆ Merkliste').join(' · ');
      const bands  = (ev.bands_to_watch||[]).join(', ');
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
            <div class="ev-sub">📍 ${esc(ev.venue)}${ev.city?', '+esc(ev.city):''}${ev.time?' · 🕓 '+esc(ev.time)+' Uhr':''}</div>
            ${ev.price||ev.ticket_link ? `<div class="ev-detail">${ev.price?'€ '+fmtPrice(ev.price):''}${ev.ticket_link?` <a href="${esc(ev.ticket_link)}">✓ Tickets</a>`:''}${tagTxt?' · '+tagTxt:''}</div>` : (tagTxt?`<div class="ev-detail">${tagTxt}</div>`:'')}
            ${bands ? `<div class="ev-detail" style="color:#999">Bands: ${esc(bands)}</div>` : ''}
          </div>
        </div>
      </div>`;
    }
    const concRows = (ev.concerts||[]).map(c => {
      const d = parseDate(c.date);
      const endStr = c.end_date ? `–${new Date(c.end_date+'T12:00:00').getDate()}` : '';
      const acts = (c.support_present||[]).join(', ');
      const tagIcons = (c.tags||[]).map(t=>t==='tickets'?'✓':'☆').join(' ');
      return `<div class="conc-row">
        <div class="conc-date" style="color:${tourCol}">
          <span class="cd-day">${d.day}${endStr}</span>
          <span class="cd-mon">${d.month}</span>
          <span class="cd-yr">${d.year}</span>
        </div>
        <div class="conc-info">
          <strong>${esc(c.venue)}</strong>, ${esc(c.city)}
          ${c.time?' · 🕓 '+esc(c.time)+' Uhr':''}
          ${c.price?' · € '+fmtPrice(c.price):''}
          ${c.ticket_link?` · <a href="${esc(c.ticket_link)}">✓ Tickets</a>`:''}
          ${acts?`<br><span style="color:#777">${esc(acts)}</span>`:''}
        </div>
        <div class="conc-tags">${tagIcons}</div>
      </div>`;
    }).join('');
    return `<div class="ev-card">
      <div class="ev-artist-header">
        <div class="ev-badge" style="color:${tourCol};border-color:${tourCol}">Tour</div>
        <div class="ev-title">${Array.isArray(ev.artist) ? esc(ev.artist.join(' + ')) : esc(ev.artist)}</div>
        <div class="ev-sub">${esc(ev.tour_name||'')}${ev.support&&ev.support.length ? ' · Support: '+esc(ev.support.join(', ')) : ''}</div>
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
  a { color: #4ade80; }
  @media print {
    body { background: #fff; color: #111; }
    .ev-card { background: #f8f8f8; border-color: #ddd; }
    .ev-artist-header { border-color: #ddd; }
    .conc-row { border-color: #eee; }
    h2 { border-color: #ddd; }
  }
</style></head><body>
<h1>KONZERTPLANER</h1>
<div class="sub">Stand: ${new Date().toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric'})}</div>
${upcoming.length ? '<h2>Anstehende Events</h2>'+upcoming.map(evHtml).join('') : ''}
${past.length ? '<h2>Vergangene Events</h2>'+past.map(evHtml).join('') : ''}
</body></html>`;

  dlBlob(html, `konzertplaner-${todayIso}.html`, 'text/html;charset=utf-8');
}

function dlBlob(data, filename, mime) {
  const blob = new Blob([data], {type: mime});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
function localIso(d) {
  // Returns YYYY-MM-DD in LOCAL timezone (avoids UTC offset shifting the date)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseDate(iso) {
  if (!iso) return { day:'?', month:'???', year:'????' };
  const d = new Date(iso+'T12:00:00');
  return {
    day:   d.getDate(),
    month: d.toLocaleDateString('de-DE',{month:'short'}),
    year:  d.getFullYear(),
  };
}
function fmtDateShort(iso) {
  if (!iso) return '';
  return new Date(iso+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'short'});
}
function fmtDateLong(iso) {
  if (!iso) return '';
  return new Date(iso+'T12:00:00').toLocaleDateString('de-DE',{day:'numeric',month:'long',year:'numeric'});
}

document.addEventListener('click', e => {
  const panel = document.getElementById('eventim-tours-panel');
  const input = document.getElementById('eventim-search');
  if (panel && panel.classList.contains('open') &&
      !panel.contains(e.target) && e.target !== input) {
    closeSearchPanel();
  }
  // Close notif panel on outside click
  const notifPanel = document.getElementById('notif-panel');
  const notifBtn   = document.getElementById('notif-btn');
  if (notifPanel && notifPanel.classList.contains('open') &&
      !notifPanel.contains(e.target) && notifBtn && !notifBtn.contains(e.target)) {
    notifPanel.classList.remove('open');
  }
});

// ══════════════════════════════════════════════════════════════════════
// Follow / Favourites
// ══════════════════════════════════════════════════════════════════════
async function toggleFollow(artistId, follow) {
  if (!artistId) {
    // Derived artist (id=null) — cannot save follow state without a real catalogue entry
    // This should not happen since derived artists don't show the follow button, but guard anyway
    return;
  }
  await fetch('/api/artists/' + artistId, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ followed: follow }),
  });
  await reloadCatalogue();
  renderArtistList();
  if (currentTab === 'favourites') renderFavourites();
}

// ── Favourites tab ────────────────────────────────────────────────────
let _favCardState = {};

async function renderFavourites() {
  const el = document.getElementById('fav-list');
  const followed = artists.filter(a => a.followed && a.id);
  if (!followed.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="icon">★</div><h3>Keine Favoriten</h3>
      <p>Füge Artists über „＋ Artist hinzufügen" oder die Artist-Liste hinzu.</p>
    </div>`;
    return;
  }
  el.innerHTML = followed.map(a => buildFavCard(a)).join('');
}

function buildFavCard(a) {
  const state = _favCardState[a.id] || {};
  const isOpen = !!state.open;
  const logoHtml = a.logo
    ? `<div class="fav-artist-logo"><img src="/static/logos/${a.logo}" alt=""></div>`
    : `<div class="fav-artist-logo">🎤</div>`;
  const evimLabel = a.eventim_name
    ? `<div class="fav-artist-meta">Eventim: ${esc(a.eventim_name)}</div>` : '';
  let bodyHtml = '';
  if (isOpen) {
    if (state.loading) {
      bodyHtml = `<div class="fav-loading">⏳ Lade Eventim-Events…</div>`;
    } else if (state.error) {
      bodyHtml = `<div class="fav-empty">❌ ${esc(state.error)}</div>`;
    } else if (state.suggestions && state.suggestions.length) {
      bodyHtml = `<div class="fav-no-match">
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px">
          Artist „${esc(a.name)}" nicht eindeutig auf Eventim gefunden. Ähnliche Treffer:
        </div>
        ${state.suggestions.map(s => `
          <div class="fav-suggestion">
            <span>${esc(s.name)} <span style="color:var(--muted);font-size:11px">(${s.event_count} Events)</span></span>
            <button class="btn-sm" onclick="confirmEventimArtist('${a.id}','${s.name.replace(/'/g,"\'")}')">Als Eventim-Artist setzen</button>
          </div>`).join('')}
      </div>`;
    } else if (state.concerts && state.concerts.length) {
      bodyHtml = state.concerts.map(c => {
        const d = parseDate(c.date);
        const cJson = encodeURIComponent(JSON.stringify(c));
        const aJson = encodeURIComponent(JSON.stringify(a.name));
        return `<div class="fav-event-row" onclick="openNotifEventModalEnc('${cJson}','${aJson}')">
          <div class="date-block" style="padding-top:0">
            <div class="date-day" style="font-size:1.5rem">${d.day}</div>
            <div class="date-month">${d.month}</div>
            <div class="date-year">${d.year}</div>
          </div>
          <div class="concert-info">
            <div class="concert-venue">${esc(c.venue||c.name||'–')}</div>
            <div class="concert-city">📍 ${esc(c.city)}</div>
            ${c.time ? `<div class="concert-time">🕓 ${esc(c.time)} Uhr</div>` : ''}
          </div>
          <div class="fav-event-actions">
            ${c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener" class="ticket-link-btn" onclick="event.stopPropagation()" style="font-size:11px">✓</a>` : ''}
            ${c.inStock ? '<span style="font-size:10px;color:var(--tickets-color)">✓</span>' : ''}
          </div>
        </div>`;
      }).join('');
    } else {
      bodyHtml = `<div class="fav-empty">Keine anstehenden Events auf Eventim gefunden.</div>`;
    }
  }
  return `<div class="fav-card ${isOpen?'open':''}" id="fav-card-${a.id}">
    <div class="fav-card-header" onclick="toggleFavCard('${a.id}','${(a.eventim_name||a.name).replace(/'/g,"\'")}')">
      ${logoHtml}
      <div style="flex:1;min-width:0">
        <div class="fav-artist-name">${esc(a.name)}</div>
        ${evimLabel}
      </div>
      <span class="fav-chevron">▶</span>
    </div>
    <div class="fav-events-body">${bodyHtml}</div>
  </div>`;
}

function openNotifEventModalEnc(cEnc, aEnc) {
  openNotifEventModal(JSON.parse(decodeURIComponent(cEnc)), JSON.parse(decodeURIComponent(aEnc)));
}

async function toggleFavCard(artistId, eventimName) {
  const state = _favCardState[artistId] || {};
  if (state.open) { _favCardState[artistId] = {...state, open:false}; renderFavourites(); return; }
  const now = Date.now();
  if (state.concerts !== undefined && state.loadedAt && (now - state.loadedAt) < 5*60*1000) {
    _favCardState[artistId] = {...state, open:true}; renderFavourites(); return;
  }
  _favCardState[artistId] = {open:true, loading:true};
  renderFavourites();
  await loadFavArtistEvents(artistId, eventimName);
}

async function loadFavArtistEvents(artistId, searchName) {
  try {
    const r = await fetch(`/api/eventim/artist-search?q=${encodeURIComponent(searchName)}&top=8`);
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    const exactMatch = (data.artists||[]).find(a=>a.name.toLowerCase()===searchName.toLowerCase());
    if (!exactMatch && (data.artists||[]).length > 0) {
      _favCardState[artistId] = {open:true, loading:false, loadedAt:Date.now(), suggestions:data.artists.slice(0,5)};
      renderFavourites(); return;
    }
    const confirmedName = exactMatch ? exactMatch.name : searchName;
    const r2 = await fetch(`/api/eventim/artist-events?name=${encodeURIComponent(confirmedName)}`);
    const d2 = await r2.json();
    if (d2.error) throw new Error(d2.error);
    _favCardState[artistId] = {open:true, loading:false, loadedAt:Date.now(), concerts:d2.concerts||[], confirmedName};
    renderFavourites();
  } catch(err) {
    _favCardState[artistId] = {open:true, loading:false, error:err.message};
    renderFavourites();
  }
}

async function confirmEventimArtist(artistId, eventimName) {
  await fetch('/api/artists/'+artistId, {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventim_name:eventimName})});
  await reloadCatalogue();
  _favCardState[artistId] = {open:true, loading:true};
  renderFavourites();
  await loadFavArtistEvents(artistId, eventimName);
}

// ── Add Favourite modal ───────────────────────────────────────────────
let _favSearchTimeout = null;

function openAddFavouriteModal() {
  document.getElementById('fav-search-input').value = '';
  document.getElementById('fav-search-results').innerHTML = '';
  openModal('add-fav-modal');
  setTimeout(()=>document.getElementById('fav-search-input').focus(), 100);
}
function onFavSearchInput() {
  const q = document.getElementById('fav-search-input').value.trim();
  clearTimeout(_favSearchTimeout);
  if (q.length < 2) return;
  _favSearchTimeout = setTimeout(()=>doFavSearch(q), 400);
}
async function doFavSearch(q) {
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
        <button class="btn-sm" onclick="addFavouriteArtist('${a.name.replace(/'/g,"\'")}')">★ Folgen</button>
      </div>`).join('');
  } catch(err) {
    el.innerHTML = `<div class="fav-empty">Fehler: ${esc(err.message)}</div>`;
  }
}
async function addFavouriteArtist(eventimName) {
  const existing = artists.find(a=>a.name.toLowerCase()===eventimName.toLowerCase()&&a.id);
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

// ── Notifications ─────────────────────────────────────────────────────
let _notifications = JSON.parse(localStorage.getItem('kp-notifs')||'[]');

function saveNotifications() { _notifications=_notifications.slice(-50); localStorage.setItem('kp-notifs',JSON.stringify(_notifications)); }
function updateNotifBadge() {
  const unread = _notifications.filter(n=>!n.read).length;
  const badge = document.getElementById('notif-badge');
  badge.textContent = unread>9?'9+':String(unread);
  badge.classList.toggle('visible', unread>0);
}
function toggleNotifPanel() {
  const p = document.getElementById('notif-panel');
  p.classList.toggle('open');
  if (p.classList.contains('open')) renderNotifPanel();
}
function renderNotifPanel() {
  const el = document.getElementById('notif-list');
  if (!_notifications.length) { el.innerHTML=`<div class="notif-empty">Keine Benachrichtigungen</div>`; return; }
  el.innerHTML = [..._notifications].reverse().map(n=>`
    <div class="notif-item ${n.read?'':'unread'}" onclick="onNotifClick('${n.id}')">
      <div class="notif-artist">★ ${esc(n.artistName)}</div>
      <div class="notif-event">📅 ${n.date?fmtDateShort(n.date):'?'} · ${esc(n.venue||'')}${n.city?', '+esc(n.city):''}</div>
    </div>`).join('');
}
function onNotifClick(notifId) {
  const notif = _notifications.find(n=>n.id===notifId);
  if (!notif) return;
  notif.read=true; saveNotifications(); updateNotifBadge(); renderNotifPanel();
  openNotifEventModal(notif.concertData, notif.artistName);
  document.getElementById('notif-panel').classList.remove('open');
}
function markAllNotifRead() { _notifications.forEach(n=>n.read=true); saveNotifications(); updateNotifBadge(); renderNotifPanel(); }

let _notifImportData = null;
function openNotifEventModal(concertData, artistName) {
  _notifImportData = {concertData, artistName};
  const d = parseDate(concertData.date);
  document.getElementById('notif-event-title').textContent = `${esc(artistName)} – Event speichern`;
  document.getElementById('notif-event-body').innerHTML = `
    <div style="display:grid;grid-template-columns:72px 1fr;gap:14px;padding:4px 0 16px">
      <div class="date-block" style="padding-top:0">
        <div class="date-day">${d.day}</div><div class="date-month">${d.month}</div><div class="date-year">${d.year}</div>
      </div>
      <div class="concert-info">
        <div class="concert-venue" style="font-size:15px">${esc(concertData.venue||concertData.name||'–')}</div>
        <div class="concert-city">📍 ${esc(concertData.city||'')}</div>
        ${concertData.venue ? venueMapHtml(concertData.venue, concertData.city) : ''}
        ${concertData.time?`<div class="concert-time">🕓 ${esc(concertData.time)} Uhr</div>`:''}
        ${concertData.inStock!==undefined?`<div style="margin-top:6px;font-size:12px;color:${concertData.inStock?'var(--tickets-color)':'#f87171'}">${concertData.inStock?'✓ Verfügbar':'✗ Ausverkauft'}</div>`:''}
      </div>
    </div>
    ${concertData.link?`<a href="${esc(concertData.link)}" target="_blank" rel="noopener" class="ticket-link-btn" style="margin-bottom:10px;display:inline-flex">↗ Auf Eventim ansehen</a>`:''}`;
  openModal('notif-event-modal');
}
async function importNotifEvent() {
  if (!_notifImportData) return;
  const {concertData:c, artistName} = _notifImportData;
  const r = await fetch('/api/events',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({event_type:'tour',artist:artistName,tour_name:c.name||artistName,
      support:[],poster:null,comment:'',concerts:[{date:c.date||'',time:c.time||null,end_date:null,
      city:c.city||'',venue:c.venue||c.name||'',price:null,ticket_link:c.link||null,tags:[],support_present:[]}]})});
  if (!r.ok){alert('Fehler beim Speichern.');return;}
  closeModal('notif-event-modal');
  await fetchAll();
}

// ── Background polling ────────────────────────────────────────────────
let _lastEventimCheck = {}, _pollInterval = null;
function startFavPolling() {
  if (_pollInterval) return;
  _pollInterval = setInterval(checkFavArtistEvents, 30*60*1000);
}
async function checkFavArtistEvents() {
  const followed = artists.filter(a=>a.followed&&a.id&&(a.eventim_name||a.name));
  for (const a of followed) {
    const searchName = a.eventim_name||a.name;
    try {
      const r = await fetch(`/api/eventim/artist-events?name=${encodeURIComponent(searchName)}`);
      const data = await r.json();
      if (data.error||!data.concerts) continue;
      const seen = _lastEventimCheck[a.id]||new Set();
      const newC = data.concerts.filter(c=>c.productId&&!seen.has(c.productId));
      if (newC.length && seen.size>0) {
        newC.forEach(c=>{
          _notifications.push({id:`${a.id}-${c.productId}-${Date.now()}`,artistName:a.name,
            concertName:c.name||'',date:c.date,city:c.city,venue:c.venue,link:c.link,read:false,concertData:c});
        });
        saveNotifications(); updateNotifBadge();
        if (_favCardState[a.id]) {_favCardState[a.id].concerts=data.concerts;_favCardState[a.id].loadedAt=Date.now();}
      }
      _lastEventimCheck[a.id] = new Set(data.concerts.map(c=>c.productId).filter(Boolean));
    } catch(e){}
  }
}
setTimeout(()=>{checkFavArtistEvents();startFavPolling();}, 5000);
updateNotifBadge();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeLightbox(); closeDetail();
    ['event-modal','artist-modal','artist-detail-modal','venue-modal','design-modal',
     'export-modal','eventim-concerts-modal','add-fav-modal','notif-event-modal'].forEach(id => closeModal(id));
    closeSearchPanel(); const np=document.getElementById('notif-panel'); if(np)np.classList.remove('open');
    closeDrawer();
  }
});

// ══════════════════════════════════════════════════════════════════════
// Eventim search & import
// ══════════════════════════════════════════════════════════════════════
let _searchTimeout = null;
let _currentSearchPage = 1;
let _currentSearchTerm = '';
let _currentTour = null;       // { artist, tour_name, concerts[] }
let _selectedConcerts = new Set(); // indices into _currentTour.concerts

// ── Search input handling ─────────────────────────────────────────────
function onSearchInput() {
  const val = document.getElementById('eventim-search').value.trim();
  document.getElementById('search-clear').classList.toggle('visible', val.length > 0);
  clearTimeout(_searchTimeout);
  if (val.length < 2) return;
  _searchTimeout = setTimeout(() => doSearch(1), 500);
}

function clearSearch() {
  document.getElementById('eventim-search').value = '';
  document.getElementById('search-clear').classList.remove('visible');
}

async function doSearch(page) {
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

// ── Tour list modal ───────────────────────────────────────────────────
function showToursModal(query, data) {
  document.getElementById('eventim-tours-title').textContent =
    `Ergebnisse für „${esc(query)}" (${data.totalResults || 0})`;

  const list = document.getElementById('eventim-tour-list');
  if (!data.tours || !data.tours.length) {
    list.innerHTML = `<div class="ev-no-results">🔍 Keine Konzerte gefunden.<br>
      <span style="font-size:12px;color:var(--border)">Versuche einen anderen Suchbegriff.</span></div>`;
  } else {
    list.innerHTML = data.tours.map((tour, i) => {
      const dates = tour.concerts.map(c => c.date).filter(Boolean).sort();
      const dateRange = dates.length
        ? (dates[0] === dates[dates.length-1]
            ? fmtDateShort(dates[0])
            : `${fmtDateShort(dates[0])} – ${fmtDateShort(dates[dates.length-1])}`)
        : '';
      return `<div class="ev-tour-item" onclick="showConcertsModal(${i})">
        <div class="ev-tour-icon">🎸</div>
        <div class="ev-tour-meta">
          <div class="ev-tour-artist">${esc(tour.artist)}</div>
          <div class="ev-tour-name">${esc(tour.tour_name)}${dateRange ? ' · ' + dateRange : ''}</div>
        </div>
        <div class="ev-tour-count">${tour.concerts.length} Termin${tour.concerts.length !== 1 ? 'e' : ''} →</div>
      </div>`;
    }).join('');
  }

  // Pagination
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

  window._eventimTours = data.tours;
  positionAndOpenSearchPanel();
}

function positionAndOpenSearchPanel() {
  const panel = document.getElementById('eventim-tours-panel');
  const input = document.getElementById('eventim-search');
  const rect  = input.getBoundingClientRect();
  panel.style.top  = (rect.bottom + 6) + 'px';
  // Align right edge with search bar right edge, but don't go off-screen left
  const rightEdge = rect.right;
  const panelW = Math.min(520, window.innerWidth - 16);
  panel.style.width = panelW + 'px';
  panel.style.left = Math.max(8, rightEdge - panelW) + 'px';
  panel.classList.add('open');
}

function closeSearchPanel() {
  document.getElementById('eventim-tours-panel').classList.remove('open');
}

// ── Concert selection modal ───────────────────────────────────────────
function showConcertsModal(tourIndex) {
  _currentTour = window._eventimTours[tourIndex];
  _selectedConcerts = new Set(); // default: none selected

  document.getElementById('eventim-concerts-title').textContent =
    `${esc(_currentTour.artist)} – Termine auswählen`;

  renderConcertSelection();
  openModal('eventim-concerts-modal');
}

function renderConcertSelection() {
  const list = document.getElementById('eventim-concert-list');
  const myCity = getLocationCity().toLowerCase();
  const preferred = getPreferredCities().map(c => c.toLowerCase());
  
  // Sort concerts: priority (my city + preferred) first, then chronologically
  const sorted = [..._currentTour.concerts].map((c, i) => ({...c, _origIdx: i})).sort((a, b) => {
    const aCity = (a.city || '').toLowerCase();
    const bCity = (b.city || '').toLowerCase();
    const aIsMyCity = aCity === myCity;
    const bIsMyCity = bCity === myCity;
    const aIsPreferred = preferred.includes(aCity);
    const bIsPreferred = preferred.includes(bCity);
    // Priority: my city > preferred cities > others
    if (aIsMyCity && !bIsMyCity) return -1;
    if (!aIsMyCity && bIsMyCity) return 1;
    if (aIsPreferred && !bIsPreferred && !bIsMyCity) return -1;
    if (!aIsPreferred && bIsPreferred && !aIsMyCity) return 1;
    // Then by date
    return (a.date || '').localeCompare(b.date || '');
  });
  
  // Find the split point (first non-priority item)
  let splitIdx = sorted.findIndex(c => {
    const city = (c.city || '').toLowerCase();
    return city !== myCity && !preferred.includes(city);
  });
  if (splitIdx === -1) splitIdx = sorted.length;
  
  const renderItem = (c, i) => {
    const d = parseDate(c.date);
    const sel = _selectedConcerts.has(c._origIdx);
    return `<div class="ev-conc-item ${sel ? 'selected' : ''}" onclick="toggleConcert(${c._origIdx})">
      <div class="ev-conc-check"><div class="check-box">${sel ? '✓' : ''}</div></div>
      <div class="ev-conc-date">
        <div class="date-day">${d.day || '?'}</div>
        <div class="date-month">${d.month || ''}</div>
        <div class="date-year">${d.year || ''}</div>
      </div>
      <div class="ev-conc-info">
        <div class="ev-conc-venue">${esc(c.venue || '–')}</div>
        <div class="ev-conc-city">📍 ${esc(c.city || '')}</div>
        ${c.time ? `<div class="ev-conc-time">🕓 ${esc(c.time)} Uhr</div>` : ''}
      </div>
      <div class="ev-conc-right">
        <div class="ev-conc-stock ${c.inStock ? 'in-stock' : 'out-stock'}">
          ${c.inStock ? '✓ Verfügbar' : '✗ Ausverkauft'}
        </div>
        ${c.link ? `<div style="margin-top:4px"><a href="${esc(c.link)}" target="_blank" rel="noopener" class="ticket-link-btn" onclick="event.stopPropagation()" style="font-size:10px;padding:2px 7px">✓ Eventim</a></div>` : ''}
      </div>
    </div>`;
  };
  
  const priorityHtml = sorted.slice(0, splitIdx).map(renderItem).join('');
  const otherHtml = sorted.slice(splitIdx).map(renderItem).join('');
  
  list.innerHTML = priorityHtml + (otherHtml ? `<div class="ev-conc-divider"><span>Weitere Termine</span></div>` + otherHtml : '');
}

function toggleConcert(i) {
  if (_selectedConcerts.has(i)) _selectedConcerts.delete(i);
  else _selectedConcerts.add(i);
  renderConcertSelection();
}

function toggleSelectAll() {
  if (_selectedConcerts.size === _currentTour.concerts.length) {
    _selectedConcerts.clear();
  } else {
    _selectedConcerts = new Set(_currentTour.concerts.map((_, i) => i));
  }
  renderConcertSelection();
}

// ── Import into event list ────────────────────────────────────────────
async function importEventimTour() {
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
      price:          null,   // price not reliably available in search results
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
    // Switch to list tab
    const listTab = document.querySelector('.tab');
    if (listTab) switchTab('list', listTab);
  } catch(err) {
    alert('Fehler beim Speichern: ' + err.message);
  }
}
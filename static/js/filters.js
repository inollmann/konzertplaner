// ══════════════════════════════════════════════════════════════════════
// filters.js — filter state, chip toggling, and event-visibility predicate
//
// Two kinds of filters live here:
//   1. Main filter bar (tickets/watchlist tags, tour/festival type,
//      past/upcoming date). State is held in `state` (state.js) so other
//      modules can read it; this module only mutates it and updates the
//      chip DOM.
//   2. Shows-tab filters (type/category/sort). State is module-local
//      because only the shows renderer and this module need it; getters
//      are exported for main.js.
//
// RE-RENDER PATTERN:
//   The original single-file app.js called renderList()/renderCalendar()/
//   renderTimeline()/renderShows() directly from every filter toggle.
//   In the ES-module split that would force a circular import
//   (filters.js → main.js → filters.js). Instead, each toggle updates the
//   chip DOM here and dispatches a CustomEvent on `window`:
//     • `filterchange`        — main filters changed → main.js re-renders
//                                list/calendar/timeline/map as needed.
//     • `showsfilterchange`   — shows-tab filter changed → main.js calls
//                                renderShows() only.
//   main.js owns the listeners; this module never imports the renderers.
// ══════════════════════════════════════════════════════════════════════

import { state } from './state.js';
import { localIso, eventLatestDate } from './utils.js';

// ── Shows-tab local state ────────────────────────────────────────────
let showsCategory = 'none';
let showsSort = 'rating-desc';
let showsTypeFilter = 'both';

/**
 * Whether `ev` passes the currently active filters.
 * Event-type filter is always applied; date filter only applies on the
 * map tab; tag filter only applies when at least one tag is active.
 * @param {import('./state.js').Event} ev
 * @returns {boolean}
 */
export function eventVisible(ev) {
  if (state.eventTypeFilter !== 'both' && ev.event_type !== state.eventTypeFilter) return false;

  if (state.currentTab === 'map') {
    const todayIso = localIso(new Date());
    const latestDate = eventLatestDate(ev);
    const isPast = latestDate && latestDate < todayIso;
    if (state.dateFilter === 'past' && !isPast) return false;
    if (state.dateFilter === 'upcoming' && isPast) return false;
  }

  if (!state.activeFilters.size) return true;
  const tags = ev.event_type === 'festival' ? (ev.tags || [])
    : (ev.concerts || []).flatMap(c => c.tags || []);
  return [...state.activeFilters].some(f => tags.includes(f));
}

/**
 * Toggle a tag filter (tickets/watchlist) on or off, update the chip's
 * class, normalise visual state when no tag is active, then notify
 * listeners via a `filterchange` event.
 * @param {string} tag
 */
export function toggleFilter(tag) {
  const chip = document.getElementById('chip-' + tag);
  if (state.activeFilters.has(tag)) {
    state.activeFilters.delete(tag);
    chip.className = 'filter-chip';
  } else {
    state.activeFilters.add(tag);
    chip.className = 'filter-chip active-' + tag;
  }
  window.dispatchEvent(new CustomEvent('filterchange'));
}

/**
 * Refresh all filter chip visual states from `state` — date chips,
 * event-type chips, and tag chips. Called after programmatic filter
 * changes (e.g. per-tab defaults in `switchTab`).
 */
export function updateAllFilterVisuals() {
  const chipPast = document.getElementById('chip-past');
  const chipUpcoming = document.getElementById('chip-upcoming');
  const chipTour = document.getElementById('chip-tour');
  const chipFestival = document.getElementById('chip-festival');
  const chipTickets = document.getElementById('chip-tickets');
  const chipWatchlist = document.getElementById('chip-watchlist');

  if (state.dateFilter === 'past') {
    chipPast.className = 'filter-chip active-past';
    chipUpcoming.className = 'filter-chip';
  } else if (state.dateFilter === 'upcoming') {
    chipPast.className = 'filter-chip';
    chipUpcoming.className = 'filter-chip active-upcoming';
  } else {
    chipPast.className = 'filter-chip active-past';
    chipUpcoming.className = 'filter-chip active-upcoming';
  }

  if (state.eventTypeFilter === 'both') {
    chipTour.className = 'filter-chip active-tour';
    chipFestival.className = 'filter-chip active-festival';
  } else if (state.eventTypeFilter === 'tour') {
    chipTour.className = 'filter-chip active-tour';
    chipFestival.className = 'filter-chip';
  } else {
    chipTour.className = 'filter-chip';
    chipFestival.className = 'filter-chip active-festival';
  }

  chipTickets.className = state.activeFilters.has('tickets')
    ? 'filter-chip active-tickets' : 'filter-chip';
  chipWatchlist.className = state.activeFilters.has('watchlist')
    ? 'filter-chip active-watchlist' : 'filter-chip';
}

/**
 * Cycle the tour/festival event-type filter.
 * From `both` → selected type; clicking the active type → back to
 * `both` (both chips highlighted); switching types swaps the highlight.
 * Dispatches `filterchange`.
 * @param {'tour'|'festival'} type
 */
export function toggleEventTypeFilter(type) {
  const chipTour = document.getElementById('chip-tour');
  const chipFestival = document.getElementById('chip-festival');

  if (state.eventTypeFilter === 'both') {
    state.eventTypeFilter = type;
    if (type === 'tour') {
      chipTour.className = 'filter-chip active-tour';
      chipFestival.className = 'filter-chip';
    } else {
      chipTour.className = 'filter-chip';
      chipFestival.className = 'filter-chip active-festival';
    }
  } else if (state.eventTypeFilter === type) {
    state.eventTypeFilter = 'both';
    chipTour.className = 'filter-chip active-tour';
    chipFestival.className = 'filter-chip active-festival';
  } else {
    state.eventTypeFilter = type;
    if (type === 'tour') {
      chipTour.className = 'filter-chip active-tour';
      chipFestival.className = 'filter-chip';
    } else {
      chipTour.className = 'filter-chip';
      chipFestival.className = 'filter-chip active-festival';
    }
  }
  window.dispatchEvent(new CustomEvent('filterchange'));
}

/**
 * Cycle the past/upcoming date filter (map tab only).
 * Clicking the active date switches to `both`; clicking the inactive
 * date switches to it alone; clicking either when `both` is active
 * narrows to the opposite of what was already shown. Dispatches
 * `filterchange`.
 * @param {'past'|'upcoming'} type
 */
export function toggleDateFilter(type) {
  const chipPast = document.getElementById('chip-past');
  const chipUpcoming = document.getElementById('chip-upcoming');

  if (type === 'past') {
    if (state.dateFilter === 'past') {
      state.dateFilter = 'both';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip active-upcoming';
    } else if (state.dateFilter === 'both') {
      state.dateFilter = 'upcoming';
      chipPast.className = 'filter-chip';
      chipUpcoming.className = 'filter-chip active-upcoming';
    } else {
      state.dateFilter = 'past';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip';
    }
  } else if (type === 'upcoming') {
    if (state.dateFilter === 'upcoming') {
      state.dateFilter = 'both';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip active-upcoming';
    } else if (state.dateFilter === 'both') {
      state.dateFilter = 'past';
      chipPast.className = 'filter-chip active-past';
      chipUpcoming.className = 'filter-chip';
    } else {
      state.dateFilter = 'upcoming';
      chipPast.className = 'filter-chip';
      chipUpcoming.className = 'filter-chip active-upcoming';
    }
  }
  window.dispatchEvent(new CustomEvent('filterchange'));
}

/** @returns {string} */
export function getShowsType() { return showsTypeFilter; }

/** @returns {string} */
export function getShowsCategory() { return showsCategory; }

/** @returns {string} */
export function getShowsSort() { return showsSort; }

/**
 * Set the shows-tab event-type filter and update chip classes
 * (`active-tour` / `active-festival` / `active-shows-type`). Dispatches
 * `showsfilterchange`.
 * @param {'tour'|'festival'|'both'} type
 */
export function setShowsTypeFilter(type) {
  showsTypeFilter = type;
  document.querySelectorAll('[id^="type-"]').forEach(el => {
    el.classList.remove('active-tour', 'active-festival', 'active-shows-type');
  });
  const btn = document.getElementById('type-' + type);
  if (type === 'tour') btn.classList.add('active-tour');
  else if (type === 'festival') btn.classList.add('active-festival');
  else if (type === 'both') btn.classList.add('active-shows-type');
  window.dispatchEvent(new CustomEvent('showsfilterchange'));
}

/**
 * Set the shows-tab grouping category (`none`/`act`/`year`/...) and
 * highlight the matching `cat-<cat>` chip. Dispatches `showsfilterchange`.
 * @param {string} cat
 */
export function setShowsCategory(cat) {
  showsCategory = cat;
  document.querySelectorAll('[id^="cat-"]').forEach(el => el.classList.remove('active-shows-cat'));
  document.getElementById('cat-' + cat).classList.add('active-shows-cat');
  window.dispatchEvent(new CustomEvent('showsfilterchange'));
}

/**
 * Set the shows-tab sort key and highlight the matching `sort-<sort>`
 * chip. Dispatches `showsfilterchange`.
 * @param {string} sort
 */
export function setShowsSort(sort) {
  showsSort = sort;
  document.querySelectorAll('[id^="sort-"]').forEach(el => el.classList.remove('active-shows-sort'));
  document.getElementById('sort-' + sort).classList.add('active-shows-sort');
  window.dispatchEvent(new CustomEvent('showsfilterchange'));
}

function highlightListSort(sort) {
  document.querySelectorAll('[id^="lsort-"]').forEach(el => el.classList.remove('active-list-sort'));
  const chip = document.getElementById('lsort-' + sort);
  if (chip) chip.classList.add('active-list-sort');
}

/**
 * Current Konzertliste-tab sort key for the active sub-tab.
 * @returns {string}
 */
export function getListSort() {
  return state.listSubTab === 'upcoming' ? state.listSortUpcoming : state.listSortPast;
}

/**
 * Switch the Konzertliste-tab between the 'upcoming' and 'past' sub-views:
 * update `state.listSubTab`, toggle the `lsub-` button active class,
 * re-highlight the sort chip for the newly active sub-tab's stored sort,
 * then dispatch a `listviewchange` event.
 * @param {'upcoming'|'past'} sub
 */
export function switchListSubTab(sub) {
  state.listSubTab = sub;
  document.querySelectorAll('.list-subtab').forEach(el => el.classList.remove('active'));
  const btn = document.getElementById('lsub-' + sub);
  if (btn) btn.classList.add('active');
  highlightListSort(getListSort());
  window.dispatchEvent(new CustomEvent('listviewchange'));
}

/**
 * Set the Konzertliste-tab sort key for the currently active sub-tab
 * (writes to `state.listSortUpcoming` or `state.listSortPast`), highlight
 * the matching `lsort-` chip, then dispatch a `listviewchange` event.
 * @param {string} sort
 */
export function setListSort(sort) {
  if (state.listSubTab === 'upcoming') state.listSortUpcoming = sort;
  else state.listSortPast = sort;
  highlightListSort(sort);
  window.dispatchEvent(new CustomEvent('listviewchange'));
}

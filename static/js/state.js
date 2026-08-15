// ══════════════════════════════════════════════════════════════════════
// state.js — shared mutable application state
//
// Cross-module mutable state lives in the exported `state` object so that ES
// module live-binding limitations (imported bindings are read-only) don't
// get in the way. Module-local state stays as plain `let`/`const` in the
// module that owns it.
// ══════════════════════════════════════════════════════════════════════

/** @typedef {{id:string, event_type:string, concerts?:Array, tags?:Array, [k:string]:any}} Event */
/** @typedef {{id:string, name:string, city:string, logo?:string, logo_mono?:string, photo?:string, followed?:boolean, derived?:boolean, eventim_name?:string}} Artist */
/** @typedef {{id:string, name:string, city:string, derived?:boolean}} VenueCat */

export const today = new Date();

/**
 * Central mutable state. Read `state.x`, write `state.x = v`.
 * @type {{
 *   allEvents: Event[],
 *   knownBands: string[],
 *   knownVenues: Array<{id:string,name:string,city:string}>,
 *   artists: Artist[],
 *   venuesCat: VenueCat[],
 *   editingId: string|null,
 *   currentType: 'tour'|'festival',
 *   currentTab: string,
 *   dateFilter: 'past'|'upcoming'|'both',
 *   eventTypeFilter: 'tour'|'festival'|'both',
 *   activeFilters: Set<string>,
 *   listSubTab: 'upcoming'|'past',
 *   listSortUpcoming: string,
 *   listSortPast: string,
 *   listView: 'list'|'wall',
 *   calYear: number,
 *   calMonth: number,
 *   ratings: Record<string, Record<string, number|null>>,
 *   notifications: Array<{id:string, read:boolean, [k:string]:any}>,
 *   favCardState: Record<string, any>,
 *   locationSettings: {city:string, preferred:string[]},
 *   statEvents: Array<any>,
 *   openDetailId: string|null,
 * }}
 */
export const state = {
  allEvents: [],
  knownBands: [],
  knownVenues: [],
  artists: [],
  venuesCat: [],
  editingId: null,
  currentType: 'tour',
  currentTab: 'list',
  dateFilter: 'both',
  eventTypeFilter: 'both',
  activeFilters: new Set(),
  listSubTab: 'upcoming',
  listSortUpcoming: 'date-asc',
  listSortPast: 'date-desc',
  listView: 'list',
  calYear: today.getFullYear(),
  calMonth: today.getMonth(),
  ratings: JSON.parse(localStorage.getItem('kp-ratings') || '{}'),
  notifications: JSON.parse(localStorage.getItem('kp-notifs') || '[]'),
  favCardState: {},
  locationSettings: JSON.parse(localStorage.getItem('kp-location') || '{"city":"","preferred":[]}'),
  statEvents: [],
  openDetailId: null,
};

/**
 * Look up an event by id from the current in-memory list.
 * @param {string} id
 * @returns {Event|undefined}
 */
export function getEvent(id) {
  return state.allEvents.find(e => e.id === id);
}

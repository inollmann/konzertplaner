vi.mock('./state.js', () => ({
  state: {
    eventTypeFilter: 'both',
    currentTab: 'list',
    dateFilter: 'both',
    activeFilters: new Set(),
    listSubTab: 'upcoming',
    listSortUpcoming: 'date-asc',
    listSortPast: 'date-desc',
  },
  getEvent: () => undefined,
}));

import { eventVisible, getListSort } from './filters.js';
import { state } from './state.js';

const pastFestival = { event_type: 'festival', name: 'Past Fest', date: '2000-06-15', tags: [] };
const futureFestival = { event_type: 'festival', name: 'Future Fest', date: '2099-06-15', tags: [] };
const taggedFestival = { event_type: 'festival', name: 'Tagged Fest', date: '2099-06-15', tags: ['tickets'] };
const futureTour = { event_type: 'tour', concerts: [{ date: '2099-09-01', tags: ['tickets'] }] };
const watchlistTour = { event_type: 'tour', concerts: [{ date: '2099-09-01', tags: ['watchlist'] }] };

beforeEach(() => {
  state.eventTypeFilter = 'both';
  state.currentTab = 'list';
  state.dateFilter = 'both';
  state.activeFilters = new Set();
  state.listSubTab = 'upcoming';
  state.listSortUpcoming = 'date-asc';
  state.listSortPast = 'date-desc';
});

describe('eventVisible', () => {
  describe('event-type filter', () => {
    it('shows any event when filter is both', () => {
      state.eventTypeFilter = 'both';
      expect(eventVisible(futureTour)).toBe(true);
      expect(eventVisible(futureFestival)).toBe(true);
    });
    it('hides festivals when filter is tour', () => {
      state.eventTypeFilter = 'tour';
      expect(eventVisible(futureTour)).toBe(true);
      expect(eventVisible(futureFestival)).toBe(false);
    });
    it('hides tours when filter is festival', () => {
      state.eventTypeFilter = 'festival';
      expect(eventVisible(futureTour)).toBe(false);
      expect(eventVisible(futureFestival)).toBe(true);
    });
  });

  describe('date filter (map tab only)', () => {
    it('hides future events when dateFilter is past', () => {
      state.currentTab = 'map';
      state.dateFilter = 'past';
      expect(eventVisible(pastFestival)).toBe(true);
      expect(eventVisible(futureFestival)).toBe(false);
    });
    it('hides past events when dateFilter is upcoming', () => {
      state.currentTab = 'map';
      state.dateFilter = 'upcoming';
      expect(eventVisible(futureFestival)).toBe(true);
      expect(eventVisible(pastFestival)).toBe(false);
    });
    it('shows both past and future when dateFilter is both', () => {
      state.currentTab = 'map';
      state.dateFilter = 'both';
      expect(eventVisible(futureFestival)).toBe(true);
      expect(eventVisible(pastFestival)).toBe(true);
    });
    it('ignores the date filter off the map tab', () => {
      state.currentTab = 'list';
      state.dateFilter = 'past';
      expect(eventVisible(futureFestival)).toBe(true);
    });
  });

  describe('tag filter', () => {
    it('shows events with no active filters', () => {
      expect(eventVisible(futureTour)).toBe(true);
    });
    it('shows a tour whose concert matches an active tag', () => {
      state.activeFilters.add('tickets');
      expect(eventVisible(futureTour)).toBe(true);
    });
    it('hides a tour whose concerts do not match an active tag', () => {
      state.activeFilters.add('tickets');
      expect(eventVisible(watchlistTour)).toBe(false);
    });
    it('shows a festival whose tags match an active tag', () => {
      state.activeFilters.add('tickets');
      expect(eventVisible(taggedFestival)).toBe(true);
    });
    it('hides a festival whose tags do not match an active tag', () => {
      state.activeFilters.add('tickets');
      expect(eventVisible(futureFestival)).toBe(false);
    });
    it('shows an event when any of multiple active tags match', () => {
      state.activeFilters.add('tickets');
      state.activeFilters.add('watchlist');
      expect(eventVisible(watchlistTour)).toBe(true);
      expect(eventVisible(futureTour)).toBe(true);
    });
  });
});

describe('getListSort', () => {
  it('returns the upcoming sort when listSubTab is upcoming', () => {
    state.listSubTab = 'upcoming';
    state.listSortUpcoming = 'date-asc';
    expect(getListSort()).toBe('date-asc');
  });
  it('returns the past sort when listSubTab is past', () => {
    state.listSubTab = 'past';
    state.listSortPast = 'date-desc';
    expect(getListSort()).toBe('date-desc');
  });
  it('reflects updated sort values', () => {
    state.listSubTab = 'upcoming';
    state.listSortUpcoming = 'rating-desc';
    expect(getListSort()).toBe('rating-desc');
    state.listSubTab = 'past';
    state.listSortPast = 'name-asc';
    expect(getListSort()).toBe('name-asc');
  });
});

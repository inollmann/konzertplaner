vi.mock('./state.js', () => ({
  state: {
    allEvents: [],
    locationSettings: { city: '', preferred: [] },
  },
  getEvent: () => undefined,
}));

vi.mock('./notifications.js', () => ({
  updateNotifBadge: () => {},
}));

import { calculateStats, getLocationCity, getPreferredCities } from './tools.js';
import { state } from './state.js';

const thisYear = new Date().getFullYear();
const lastYear = thisYear - 1;

beforeEach(() => {
  state.allEvents = [];
  state.locationSettings = { city: '', preferred: [] };
});

describe('calculateStats', () => {
  it('returns all-zero stats for an empty event list', () => {
    const s = calculateStats();
    expect(s.totalConcerts).toBe(0);
    expect(s.totalFestivals).toBe(0);
    expect(s.totalEvents).toBe(0);
    expect(s.totalSpent).toBe(0);
    expect(s.upcoming).toBe(0);
    expect(s.past).toBe(0);
    expect(s.allTicketEvents).toEqual([]);
    expect(s.topArtists).toEqual([]);
    expect(s.topVenues).toEqual([]);
    expect(s.yearChange).toBe(0);
  });

  it('aggregates festivals and concerts with tickets', () => {
    state.allEvents = [
      { event_type: 'festival', name: 'Wacken', date: `${thisYear}-07-30`, venue: 'Wacken', city: 'Wacken', price: '80', tags: ['tickets'] },
      { event_type: 'festival', name: 'No Tickets Fest', date: `${thisYear}-08-01`, tags: ['watchlist'] },
      {
        event_type: 'tour', artist: 'Band X', concerts: [
          { date: `${thisYear}-09-15`, venue: 'Arena', city: 'Berlin', price: '50', tags: ['tickets'] },
          { date: `${lastYear}-06-10`, venue: 'Hall', city: 'Munich', price: '45', tags: ['tickets'] },
          { date: `${thisYear}-11-01`, venue: 'Club', city: 'Hamburg', price: '0', tags: ['watchlist'] },
        ],
      },
      { event_type: 'tour', artist: 'Skipped', concerts: [{ date: `${thisYear}-03-01`, venue: 'Bar', city: 'Cologne', price: '10', tags: [] }] },
    ];
    const s = calculateStats();

    expect(s.totalConcerts).toBe(2);
    expect(s.totalFestivals).toBe(1);
    expect(s.totalEvents).toBe(3);
    expect(s.totalSpent).toBe(175);
    expect(s.allTicketEvents).toHaveLength(3);
  });

  it('classifies upcoming vs past by the current year boundary', () => {
    state.allEvents = [
      { event_type: 'festival', name: 'Upcoming', date: `${thisYear}-07-30`, venue: 'A', tags: ['tickets'] },
      { event_type: 'festival', name: 'Past', date: `${lastYear}-06-10`, venue: 'B', tags: ['tickets'] },
    ];
    const s = calculateStats();
    expect(s.upcoming).toBe(1);
    expect(s.past).toBe(1);
  });

  it('breaks down by year and computes yearChange', () => {
    state.allEvents = [
      { event_type: 'festival', name: 'F1', date: `${thisYear}-07-30`, venue: 'A', tags: ['tickets'] },
      { event_type: 'festival', name: 'F2', date: `${thisYear}-08-01`, venue: 'B', tags: ['tickets'] },
      { event_type: 'festival', name: 'F3', date: `${lastYear}-06-10`, venue: 'C', tags: ['tickets'] },
    ];
    const s = calculateStats();
    expect(s.byYear[String(thisYear)]).toBe(2);
    expect(s.byYear[String(lastYear)]).toBe(1);
    expect(s.thisYearCount).toBe(2);
    expect(s.lastYearCount).toBe(1);
    expect(s.yearChange).toBe(100);
  });

  it('reports yearChange as 0 when last year has no events', () => {
    state.allEvents = [
      { event_type: 'festival', name: 'F1', date: `${thisYear}-07-30`, venue: 'A', tags: ['tickets'] },
    ];
    const s = calculateStats();
    expect(s.lastYearCount).toBe(0);
    expect(s.yearChange).toBe(0);
  });

  it('ranks top artists including co-headlining (array artist)', () => {
    state.allEvents = [
      {
        event_type: 'tour', artist: 'Band X', concerts: [
          { date: `${thisYear}-09-15`, venue: 'Arena', tags: ['tickets'] },
          { date: `${thisYear}-10-01`, venue: 'Hall', tags: ['tickets'] },
        ],
      },
      {
        event_type: 'tour', artist: ['Band A', 'Band B'], concerts: [
          { date: `${thisYear}-03-01`, venue: 'Club', tags: ['tickets'] },
        ],
      },
    ];
    const s = calculateStats();
    expect(s.topArtists).toEqual([['Band X', 2], ['Band A + Band B', 1]]);
  });

  it('ranks top venues across festivals and concerts', () => {
    state.allEvents = [
      { event_type: 'festival', name: 'F1', date: `${thisYear}-07-30`, venue: 'Wacken', tags: ['tickets'] },
      {
        event_type: 'tour', artist: 'Band X', concerts: [
          { date: `${thisYear}-09-15`, venue: 'Arena', tags: ['tickets'] },
          { date: `${thisYear}-10-01`, venue: 'Arena', tags: ['tickets'] },
        ],
      },
    ];
    const s = calculateStats();
    expect(s.topVenues[0]).toEqual(['Arena', 2]);
    expect(s.topVenues[1]).toEqual(['Wacken', 1]);
  });

  it('populates allTicketEvents with type and price metadata', () => {
    state.allEvents = [
      { event_type: 'festival', name: 'F1', date: `${thisYear}-07-30`, venue: 'A', price: '80', tags: ['tickets'] },
      { event_type: 'tour', artist: 'Band X', concerts: [{ date: `${thisYear}-09-15`, venue: 'Arena', price: '50', tags: ['tickets'] }] },
    ];
    const s = calculateStats();
    const fest = s.allTicketEvents.find(e => e._type === 'festival');
    expect(fest._price).toBe(80);
    const tour = s.allTicketEvents.find(e => e._type === 'tour');
    expect(tour._price).toBe(50);
    expect(tour._concert).toBeDefined();
  });
});

describe('getLocationCity', () => {
  it('returns the city from locationSettings', () => {
    state.locationSettings = { city: 'Berlin', preferred: ['Hamburg'] };
    expect(getLocationCity()).toBe('Berlin');
  });
  it('returns empty string when city is unset', () => {
    state.locationSettings = { city: '', preferred: [] };
    expect(getLocationCity()).toBe('');
  });
  it('returns empty string when locationSettings lacks a city', () => {
    state.locationSettings = {};
    expect(getLocationCity()).toBe('');
  });
});

describe('getPreferredCities', () => {
  it('returns the preferred list from locationSettings', () => {
    state.locationSettings = { city: 'Berlin', preferred: ['Hamburg', 'Munich'] };
    expect(getPreferredCities()).toEqual(['Hamburg', 'Munich']);
  });
  it('returns empty array when preferred is unset', () => {
    state.locationSettings = { city: 'Berlin' };
    expect(getPreferredCities()).toEqual([]);
  });
  it('returns the same array reference stored in state', () => {
    const preferred = ['Cologne'];
    state.locationSettings = { city: '', preferred };
    expect(getPreferredCities()).toBe(preferred);
  });
});

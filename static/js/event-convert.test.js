import { describe, it, expect } from 'vitest';
import { cleanFestivalName, festivalFromEventim, tourToFestival, festivalToTour } from './event-convert.js';

describe('cleanFestivalName', () => {
  it('strips ticket suffix and title-cases uppercase', () => {
    expect(cleanFestivalName('VAINSTREAM 2027 - Weekendticket')).toBe('Vainstream 2027');
  });
  it('keeps mixed case', () => {
    expect(cleanFestivalName('Rock am Ring - Tagesticket Freitag')).toBe('Rock am Ring');
  });
  it('keeps non-ticket dashes', () => {
    expect(cleanFestivalName('Summer - Breeze')).toBe('Summer - Breeze');
  });
  it('handles VIP', () => {
    expect(cleanFestivalName('Wacken Open Air - VIP')).toBe('Wacken Open Air');
  });
});

describe('festivalFromEventim', () => {
  const c1 = { name: 'VAINSTREAM 2027 - Tagesticket Fr', date: '2027-06-25', end_date: '', time: '12:00', city: 'Münster', venue: 'Hawerkamp', link: '/a', attractions: ['Vainstream', 'Lorna Shore'] };
  const c2 = { name: 'VAINSTREAM 2027 - Tagesticket Sa', date: '2027-06-26', end_date: '2027-06-27', time: '12:00', city: 'Münster', venue: 'Hawerkamp', link: '/b', attractions: ['Vainstream', 'lorna shore', 'Architects'] };
  it('merges into one festival', () => {
    const f = festivalFromEventim([c2, c1]);
    expect(f.event_type).toBe('festival');
    expect(f.name).toBe('Vainstream 2027');
    expect(f.date).toBe('2027-06-25');
    expect(f.end_date).toBe('2027-06-27');
    expect(f.ticket_link).toBe('/a');
    expect(f.bands_to_watch).toEqual(['Lorna Shore', 'Architects']);
  });
  it('single day has no end_date', () => {
    expect(festivalFromEventim([c1]).end_date).toBeNull();
  });
});

describe('tourToFestival', () => {
  it('maps fields', () => {
    const f = tourToFestival({
      artist: ['A', 'B'], tour_name: '', support: ['S'], poster: 'p', comment: 'c', tags: ['x'],
      concerts: [
        { date: '2026-08-02', city: 'K', venue: 'V2', tags: ['tickets'], support_present: ['S'] },
        { date: '2026-08-01', end_date: '2026-08-01', time: '20:00', city: 'B', venue: 'V', price: 30, ticket_link: 'l', tags: ['x'], support_present: ['T'] },
      ],
    });
    expect(f).toMatchObject({ event_type: 'festival', name: 'A, B', date: '2026-08-01', end_date: '2026-08-02', city: 'B', venue: 'V', time: '20:00', price: 30, ticket_link: 'l', poster: 'p', comment: 'c' });
    expect(f.bands_to_watch).toEqual(['A', 'B', 'S', 'T']);
    expect(f.tags).toEqual(['x', 'tickets']);
  });
});

describe('festivalToTour', () => {
  it('maps fields', () => {
    const t = festivalToTour({ name: 'F', date: '2026-07-01', end_date: '2026-07-03', time: '10:00', city: 'C', venue: 'V', price: 5, ticket_link: 'l', tags: ['t'], poster: 'p', comment: 'c' });
    expect(t).toMatchObject({ event_type: 'tour', artist: ['F'], tour_name: 'F', support: [], poster: 'p', comment: 'c' });
    expect(t.concerts).toEqual([{ date: '2026-07-01', end_date: '2026-07-03', time: '10:00', city: 'C', venue: 'V', price: 5, ticket_link: 'l', tags: ['t'], support_present: [] }]);
  });
});

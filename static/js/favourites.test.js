// Pure tests for the favourites-tab "nearby" filter logic.
// favourites.js pulls in several DOM/network modules at import time, so
// we mock the ones that aren't relevant to computeNearby. matchMedia is
// absent in jsdom; favourites.js guards against that and falls back to
// the narrow layout, which is fine — computeNearby is layout-agnostic.

vi.mock('./map.js', () => ({
  geocodeCity: () => null,
}));

vi.mock('./notifications.js', () => ({
  openNotifEventModal: () => {},
}));

vi.mock('./api.js', () => ({
  reloadCatalogue: () => {},
}));

vi.mock('./ui.js', () => ({
  openModal: () => {},
  closeModal: () => {},
  switchTab: () => {},
}));

import { computeNearby } from './favourites.js';

const HOME = { lat: 50.0, lon: 8.0 };        // ~ Frankfurt
const FAR  = { lat: 48.137, lon: 11.575 };   // ~ Munich (>200 km)
const NEAR = { lat: 50.1, lon: 8.2 };        // ~ 18 km

function mkConcert(city, date) {
  return { date, city, venue: city + ' Hall', name: city, link: '', inStock: false };
}

describe('computeNearby', () => {
  it('returns empty array for no concerts', () => {
    expect(computeNearby([], [], HOME, {}, 'home')).toEqual([]);
  });

  it('includes concerts in the home city regardless of distance', () => {
    const concerts = [mkConcert('Homecity', '2026-09-01')];
    const map = { homecity: HOME };
    const out = computeNearby(concerts, [], HOME, map, 'homecity');
    expect(out).toHaveLength(1);
    expect(out[0].city).toBe('Homecity');
  });

  it('includes concerts within 75 km of the home city', () => {
    const concerts = [mkConcert('Nearville', '2026-09-02')];
    const map = { nearville: NEAR };
    const out = computeNearby(concerts, [], HOME, map, 'home');
    expect(out).toHaveLength(1);
    expect(out[0].city).toBe('Nearville');
  });

  it('excludes concerts farther than 75 km when not preferred', () => {
    const concerts = [mkConcert('Farville', '2026-09-03')];
    const map = { farville: FAR };
    const out = computeNearby(concerts, [], HOME, map, 'home');
    expect(out).toEqual([]);
  });

  it('includes preferred-city concerts regardless of distance', () => {
    const concerts = [mkConcert('Farville', '2026-09-03')];
    const map = { farville: FAR };
    const out = computeNearby(concerts, ['farville'], HOME, map, 'home');
    expect(out).toHaveLength(1);
  });

  it('includes preferred cities even when home city is unset', () => {
    const concerts = [mkConcert('Farville', '2026-09-03')];
    const map = { farville: FAR };
    const out = computeNearby(concerts, ['farville'], null, map, '');
    expect(out).toHaveLength(1);
  });

  it('returns nothing when home is unset and no preferred match', () => {
    const concerts = [mkConcert('Nearville', '2026-09-02'), mkConcert('Farville', '2026-09-03')];
    const map = { nearville: NEAR, farville: FAR };
    const out = computeNearby(concerts, [], null, map, '');
    expect(out).toEqual([]);
  });

  it('is case-insensitive on city names', () => {
    const concerts = [mkConcert('München', '2026-09-01')];
    const map = { münchen: FAR };
    const out = computeNearby(concerts, ['MÜNCHEN'], HOME, map, 'home');
    expect(out).toHaveLength(1);
  });

  it('trims whitespace around city names', () => {
    const concerts = [mkConcert('  Berlin  ', '2026-09-01')];
    const map = { berlin: FAR };
    const out = computeNearby(concerts, ['berlin'], null, map, '');
    expect(out).toHaveLength(1);
  });

  it('skips concerts with no city', () => {
    const concerts = [{ date: '2026-09-01', city: '' }, { date: '2026-09-01', city: '  ' }];
    expect(computeNearby(concerts, [], HOME, {}, 'home')).toEqual([]);
  });

  it('deduplicates concerts that are both preferred and within range', () => {
    const concerts = [mkConcert('Homecity', '2026-09-01')];
    const map = { homecity: HOME };
    const out = computeNearby(concerts, ['homecity'], HOME, map, 'homecity');
    expect(out).toHaveLength(1);
  });

  it('sorts the result chronologically by date', () => {
    const concerts = [
      mkConcert('NearB', '2026-11-01'),
      mkConcert('NearA', '2026-03-01'),
      mkConcert('NearC', '2026-06-01'),
    ];
    const map = { neara: NEAR, nearb: NEAR, nearc: NEAR };
    const out = computeNearby(concerts, [], HOME, map, 'home');
    expect(out.map(c => c.date)).toEqual(['2026-03-01', '2026-06-01', '2026-11-01']);
  });

  it('does not mutate the input concerts array', () => {
    const concerts = [mkConcert('Nearville', '2026-09-02'), mkConcert('Farville', '2026-09-03')];
    const map = { nearville: NEAR, farville: FAR };
    const snapshot = concerts.map(c => ({ ...c }));
    computeNearby(concerts, [], HOME, map, 'home');
    expect(concerts).toEqual(snapshot);
  });

  it('treats a city with null coords as not-nearby (unless preferred/home)', () => {
    const concerts = [mkConcert('Unknownville', '2026-09-01')];
    const map = { unknownville: null };
    expect(computeNearby(concerts, [], HOME, map, 'home')).toEqual([]);
  });
});

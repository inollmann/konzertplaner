import { describe, it, expect } from 'vitest';
import { DAY_MS, ROAD_VISIBLE_DAYS, dayOffsetDays, worldZ, visibleDayWindow, formatRoadDate } from './road.js';

describe('dayOffsetDays', () => {
  it('returns 0 for equal timestamps', () => {
    const t = new Date(2026, 5, 15).getTime();
    expect(dayOffsetDays(t, t)).toBe(0);
  });
  it('returns positive offset for future dates', () => {
    const center = new Date(2026, 5, 15).getTime();
    const future = new Date(2026, 5, 20).getTime();
    expect(dayOffsetDays(future, center)).toBeCloseTo(5);
  });
  it('returns negative offset for past dates', () => {
    const center = new Date(2026, 5, 15).getTime();
    const past = new Date(2026, 5, 10).getTime();
    expect(dayOffsetDays(past, center)).toBeCloseTo(-5);
  });
});

describe('worldZ', () => {
  it('maps offset 0 (Heute) to the camera origin', () => {
    // offset 0 ist die aktuelle Fahrtposition; Zukunft (offset>0) liegt
    // in Richtung Horizont = größeres Z.
    expect(worldZ(0)).toBe(0);
  });
  it('is strictly increasing with future offset (towards horizon)', () => {
    expect(worldZ(1)).toBeGreaterThan(worldZ(0));
    expect(worldZ(0)).toBeGreaterThan(worldZ(-1));
  });
  it('scales linearly by one day per unit', () => {
    expect(worldZ(1) - worldZ(0)).toBeCloseTo(1);
  });
});

describe('visibleDayWindow', () => {
  const center = new Date(2026, 0, 15).getTime(); // 15. Jan 2026
  it('spans buffer + visible days', () => {
    const win = visibleDayWindow(center, 6);
    expect(win.length).toBe(6 + ROAD_VISIBLE_DAYS + 6 + 1); // -buffer..+visible+buffer
  });
  it('marks day 1 of a month as month start', () => {
    const win = visibleDayWindow(new Date(2026, 0, 1).getTime(), 0);
    // offset 0 = 1. Jan 2026 → must be a month start
    const offset0 = win.find(d => d.offset === 0);
    expect(offset0.isMonthStart).toBe(true);
  });
  it('does not mark mid-month days as month start', () => {
    const win = visibleDayWindow(new Date(2026, 0, 15).getTime(), 0);
    const offset0 = win.find(d => d.offset === 0);
    expect(offset0.isMonthStart).toBe(false);
  });
  it('detects month boundary crossing', () => {
    // center 30. Jan → offset +2 = 1. Feb → month start
    const win = visibleDayWindow(new Date(2026, 0, 30).getTime(), 2);
    const feb1 = win.find(d => d.offset === 2);
    expect(feb1.isMonthStart).toBe(true);
  });
});

describe('formatRoadDate', () => {
  it('formats day + month and year separately', () => {
    const r = formatRoadDate(new Date(2026, 0, 15).getTime());
    expect(r.dmy).toContain('15');
    expect(r.dmy).toMatch(/Jan/);
    expect(r.year).toBe(2026);
  });
  it('year rolls over correctly', () => {
    const r = formatRoadDate(new Date(2025, 11, 31).getTime());
    expect(r.year).toBe(2025);
    expect(r.dmy).toMatch(/31/);
  });
  it('is stable for identical input', () => {
    const t = new Date(2026, 3, 9).getTime();
    expect(formatRoadDate(t)).toEqual(formatRoadDate(t));
  });
});

import {
  esc, localIso, parseDate, fmtDateShort, fmtDateLong, fmtPrice,
  eventLatestDate, eventEarliestDate, pipColor, venueMapHtml,
  artistLogoSrc, artistLogoClass, haversineKm, wallLayout,
  nextUpcomingDate, daysBetween, fmtCountdown, fmtMonthHeader,
  concertLineup, festivalLineup,
} from './utils.js';

describe('esc', () => {
  it('escapes ampersand', () => {
    expect(esc('&')).toBe('&amp;');
  });
  it('escapes angle brackets', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });
  it('escapes double quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });
  it('coalesces null to empty string', () => {
    expect(esc(null)).toBe('');
  });
  it('coalesces undefined to empty string', () => {
    expect(esc(undefined)).toBe('');
  });
  it('converts numbers to string', () => {
    expect(esc(42)).toBe('42');
  });
  it('leaves plain text unchanged', () => {
    expect(esc('plain text')).toBe('plain text');
  });
});

describe('localIso', () => {
  it('formats September (month 8) correctly', () => {
    expect(localIso(new Date(2026, 8, 1))).toBe('2026-09-01');
  });
  it('zero-pads single-digit month and day', () => {
    expect(localIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('handles December 31', () => {
    expect(localIso(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('parseDate', () => {
  it('parses a valid ISO date into structured parts', () => {
    const r = parseDate('2026-09-01');
    expect(r.day).toBe(1);
    expect(typeof r.month).toBe('string');
    expect(r.month.length).toBeGreaterThan(0);
    expect(r.year).toBe(2026);
  });
  it('returns placeholders for empty string', () => {
    expect(parseDate('')).toEqual({ day: '?', month: '???', year: '????', weekday: '??' });
  });
  it('returns placeholders for null', () => {
    expect(parseDate(null)).toEqual({ day: '?', month: '???', year: '????', weekday: '??' });
  });
  it('returns placeholders for undefined', () => {
    expect(parseDate(undefined)).toEqual({ day: '?', month: '???', year: '????', weekday: '??' });
  });
});

describe('parseDate weekday', () => {
  it('liefert den deutschen Kurz-Wochentag', () => {
    expect(parseDate('2026-11-14').weekday).toMatch(/^Sa/);
  });
});

describe('fmtDateShort weekday', () => {
  it('enthält den Wochentag nur mit Option', () => {
    expect(fmtDateShort('2026-11-14', { weekday: true })).toMatch(/^Sa.*14/);
    expect(fmtDateShort('2026-11-14')).not.toMatch(/Sa/);
  });
  it('leer bei fehlendem Datum', () => {
    expect(fmtDateShort('', { weekday: true })).toBe('');
  });
});

describe('wallLayout', () => {
  it('ein Event ist nicht breiter als max', () => {
    const r = wallLayout(1400, 800, 1, 16);
    expect(r.tile).toBeLessThanOrEqual(420);
  });
  it('viele Events führen zu w ≈ min', () => {
    const r = wallLayout(1000, 600, 500, 16);
    expect(r.cols).toBe(Math.floor((1000 + 16) / (160 + 16)));
    expect(r.tile).toBeGreaterThanOrEqual(160);
  });
  it('passt in die Höhe, wenn möglich', () => {
    const r = wallLayout(1200, 700, 12, 16);
    const rows = Math.ceil(12 / r.cols);
    expect(rows * r.tile * 1.5 + (rows - 1) * 16).toBeLessThanOrEqual(700);
  });
  it('n = 0 liefert gültige Werte', () => {
    const r = wallLayout(800, 600, 0, 16);
    expect(r.cols).toBeGreaterThan(0);
    expect(r.tile).toBeGreaterThanOrEqual(160);
  });
});

describe('fmtDateShort', () => {
  it('returns a non-empty German short date containing the day number', () => {
    const s = fmtDateShort('2026-09-01');
    expect(s.length).toBeGreaterThan(0);
    expect(s).toContain('1');
  });
  it('returns empty string for empty input', () => {
    expect(fmtDateShort('')).toBe('');
  });
  it('returns empty string for null', () => {
    expect(fmtDateShort(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(fmtDateShort(undefined)).toBe('');
  });
});

describe('fmtDateLong', () => {
  it('returns a non-empty long date string', () => {
    expect(fmtDateLong('2026-09-01').length).toBeGreaterThan(0);
  });
  it('returns empty string for empty input', () => {
    expect(fmtDateLong('')).toBe('');
  });
  it('returns empty string for null', () => {
    expect(fmtDateLong(null)).toBe('');
  });
});

describe('fmtPrice', () => {
  it('formats a decimal number with German comma', () => {
    expect(fmtPrice(49.5)).toBe('49,50 €');
  });
  it('formats a whole number with two decimals', () => {
    expect(fmtPrice(100)).toBe('100,00 €');
  });
  it('accepts a numeric string', () => {
    expect(fmtPrice('25.99')).toBe('25,99 €');
  });
  it('returns empty string for null', () => {
    expect(fmtPrice(null)).toBe('');
  });
  it('returns empty string for undefined', () => {
    expect(fmtPrice(undefined)).toBe('');
  });
  it('returns empty string for empty string', () => {
    expect(fmtPrice('')).toBe('');
  });
  it('returns non-numeric string as-is', () => {
    expect(fmtPrice('not a number')).toBe('not a number');
  });
  it('formats zero as 0,00 €', () => {
    expect(fmtPrice(0)).toBe('0,00 €');
  });
});

describe('eventLatestDate', () => {
  it('prefers festival end_date', () => {
    expect(eventLatestDate({ event_type: 'festival', end_date: '2026-07-20', date: '2026-07-15' })).toBe('2026-07-20');
  });
  it('falls back to festival date when no end_date', () => {
    expect(eventLatestDate({ event_type: 'festival', date: '2026-07-15' })).toBe('2026-07-15');
  });
  it('returns the latest concert date for a tour', () => {
    expect(eventLatestDate({ event_type: 'tour', concerts: [{ date: '2026-09-01', end_date: null }, { date: '2026-09-05', end_date: null }] })).toBe('2026-09-05');
  });
  it('uses max of end_date||date for concerts', () => {
    expect(eventLatestDate({ event_type: 'tour', concerts: [{ date: '2026-09-01', end_date: '2026-09-03' }, { date: '2026-09-05', end_date: null }] })).toBe('2026-09-05');
  });
  it('returns empty string for a tour with no concerts', () => {
    expect(eventLatestDate({ event_type: 'tour', concerts: [] })).toBe('');
  });
  it('returns empty string when concerts key is absent', () => {
    expect(eventLatestDate({ event_type: 'tour' })).toBe('');
  });
});

describe('eventEarliestDate', () => {
  it('returns the date for a festival', () => {
    expect(eventEarliestDate({ event_type: 'festival', date: '2026-07-15' })).toBe('2026-07-15');
  });
  it('returns the earliest concert date for a tour', () => {
    expect(eventEarliestDate({ event_type: 'tour', concerts: [{ date: '2026-09-05' }, { date: '2026-09-01' }] })).toBe('2026-09-01');
  });
  it('returns empty string for a tour with no concerts', () => {
    expect(eventEarliestDate({ event_type: 'tour', concerts: [] })).toBe('');
  });
});

describe('pipColor', () => {
  it('returns null when val is null', () => {
    expect(pipColor(null, 5)).toBeNull();
  });
  it('returns null when val is undefined', () => {
    expect(pipColor(undefined, 5)).toBeNull();
  });
  it('returns null when pos exceeds val', () => {
    expect(pipColor(5, 6)).toBeNull();
  });
  it('returns red (hue 0) for the worst rating', () => {
    expect(pipColor(1, 1)).toBe('hsl(0,70%,35%)');
  });
  it('returns green (hue 120) for the best rating', () => {
    expect(pipColor(10, 10)).toBe('hsl(120,70%,35%)');
  });
  it('interpolates hue for a mid rating', () => {
    expect(pipColor(5, 5)).toBe('hsl(53,70%,35%)');
  });
  it('returns the same color for any pos <= val', () => {
    expect(pipColor(5, 4)).toBe(pipColor(5, 5));
  });
});

describe('venueMapHtml', () => {
  it('embeds an iframe with the encoded query and default zoom', () => {
    const html = venueMapHtml('Arena', 'Berlin');
    expect(html).toContain('iframe');
    expect(html).toContain('maps.google.com');
    expect(html).toContain('q=Arena%2C%20Berlin');
    expect(html).toContain('z=15');
  });
  it('returns empty string for a falsy venue', () => {
    expect(venueMapHtml(null, 'Berlin')).toBe('');
  });
  it('uses the provided zoom level', () => {
    expect(venueMapHtml('Arena', 'Berlin', 12)).toContain('z=12');
  });
});

describe('artistLogoSrc', () => {
  it('prefers logo_mono over logo', () => {
    expect(artistLogoSrc({ logo: 'orig', logo_mono: 'mono' })).toBe('mono');
  });
  it('falls back to the original logo when logo_mono is absent', () => {
    expect(artistLogoSrc({ logo: 'orig' })).toBe('orig');
  });
  it('falls back to the original logo when logo_mono is null', () => {
    expect(artistLogoSrc({ logo: 'orig', logo_mono: null })).toBe('orig');
  });
  it('returns null when neither logo nor logo_mono exist', () => {
    expect(artistLogoSrc({})).toBeNull();
    expect(artistLogoSrc({ logo: null, logo_mono: null })).toBeNull();
  });
});

describe('artistLogoClass', () => {
  it('returns mono-logo when logo_mono is present', () => {
    expect(artistLogoClass({ logo: 'orig', logo_mono: 'mono' })).toBe('mono-logo');
  });
  it('returns empty string when only the original logo exists', () => {
    expect(artistLogoClass({ logo: 'orig' })).toBe('');
  });
  it('returns empty string when logo_mono is null', () => {
    expect(artistLogoClass({ logo: 'orig', logo_mono: null })).toBe('');
  });
  it('returns empty string when no logos exist', () => {
    expect(artistLogoClass({})).toBe('');
  });
});

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 52.52, lon: 13.405 };
    expect(haversineKm(p, p)).toBeCloseTo(0, 6);
  });
  it('is symmetric', () => {
    const a = { lat: 52.52, lon: 13.405 };
    const b = { lat: 48.137, lon: 11.575 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
  it('matches the known Berlin→Munich distance (~504 km)', () => {
    const berlin = { lat: 52.52, lon: 13.405 };
    const munich = { lat: 48.137, lon: 11.575 };
    const d = haversineKm(berlin, munich);
    expect(d).toBeGreaterThan(500);
    expect(d).toBeLessThan(510);
  });
  it('returns Infinity when either point is null', () => {
    expect(haversineKm(null, { lat: 1, lon: 1 })).toBe(Infinity);
    expect(haversineKm({ lat: 1, lon: 1 }, null)).toBe(Infinity);
  });
  it('returns Infinity when both points are null', () => {
    expect(haversineKm(null, null)).toBe(Infinity);
  });
  it('is zero for nearby points in the same city', () => {
    const a = { lat: 50.0, lon: 8.0 };
    const b = { lat: 50.001, lon: 8.001 };
    expect(haversineKm(a, b)).toBeLessThan(0.2);
  });
});

describe('daysBetween / fmtCountdown', () => {
  it('zählt Tage (auch über Monatsgrenzen)', () => {
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-10-31')).toBe(0);
    expect(daysBetween('2026-11-02', '2026-10-31')).toBe(-2);
  });
  it('formatiert den Countdown', () => {
    expect(fmtCountdown(0)).toBe('heute');
    expect(fmtCountdown(1)).toBe('morgen');
    expect(fmtCountdown(5)).toBe('in 5 Tagen');
    expect(fmtCountdown(-1)).toBe('');
  });
});

describe('nextUpcomingDate', () => {
  const tour = { event_type: 'tour', concerts: [{ date: '2026-10-01' }, { date: '2026-12-05' }, { date: '2026-11-20' }] };
  it('wählt das früheste Datum ab heute', () => {
    expect(nextUpcomingDate(tour, '2026-10-31')).toBe('2026-11-20');
  });
  it('fällt auf das früheste Datum zurück, wenn alles vorbei ist', () => {
    expect(nextUpcomingDate(tour, '2027-01-01')).toBe('2026-10-01');
  });
  it('berücksichtigt laufende Festivals', () => {
    const f = { event_type: 'festival', date: '2026-10-30', end_date: '2026-11-01' };
    expect(nextUpcomingDate(f, '2026-10-31')).toBe('2026-10-31');
  });
});

describe('fmtMonthHeader', () => {
  it('liefert Monat und Jahr', () => {
    expect(fmtMonthHeader('2026-11-14')).toMatch(/November 2026/);
    expect(fmtMonthHeader('')).toBe('');
  });
});

describe('concertLineup', () => {
  it('uses support_present when set', () => {
    const r = concertLineup({ artist: ['A', 'B'], support: ['X'] }, { support_present: ['Y'] });
    expect(r).toEqual({ headliners: ['A', 'B'], supports: ['Y'], assumed: false });
  });
  it('falls back to tour support and handles string artist', () => {
    const r = concertLineup({ artist: 'A', support: ['X'] }, { support_present: [] });
    expect(r).toEqual({ headliners: ['A'], supports: ['X'], assumed: true });
  });
  it('is empty without data', () => {
    expect(concertLineup({ artist: 'A' }, {}).supports).toEqual([]);
  });
});

describe('festivalLineup', () => {
  it('clamps and counts remainder', () => {
    const r = festivalLineup(Array.from({ length: 13 }, (_, i) => 'b' + i));
    expect(r.shown).toHaveLength(10);
    expect(r.more).toBe(3);
  });
  it('handles undefined', () => {
    expect(festivalLineup(undefined)).toEqual({ shown: [], more: 0 });
  });
});

import {
  esc, localIso, parseDate, fmtDateShort, fmtDateLong, fmtPrice,
  eventLatestDate, eventEarliestDate, pipColor, venueMapHtml,
  artistLogoSrc, artistLogoClass,
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
    expect(parseDate('')).toEqual({ day: '?', month: '???', year: '????' });
  });
  it('returns placeholders for null', () => {
    expect(parseDate(null)).toEqual({ day: '?', month: '???', year: '????' });
  });
  it('returns placeholders for undefined', () => {
    expect(parseDate(undefined)).toEqual({ day: '?', month: '???', year: '????' });
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

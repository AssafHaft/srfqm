import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../model/defaults';
import { highestSeq, parseQuoteNumber, takeQuoteNumber } from './numbering';
import { addDays, daysBetween, formatDate, formatDateShort } from './dates';

describe('takeQuoteNumber', () => {
  it('continues the running number within the year', () => {
    const r = takeQuoteNumber({ ...DEFAULT_SETTINGS, numberYear: 2026, nextNumber: 927 }, new Date(2026, 8, 27));
    expect(r.number).toBe('Q-2026-0927');
    expect(r.settings.nextNumber).toBe(928);
  });

  it('restarts at 1 in a new year', () => {
    const r = takeQuoteNumber({ ...DEFAULT_SETTINGS, numberYear: 2026, nextNumber: 400 }, new Date(2027, 0, 2));
    expect(r.number).toBe('Q-2027-0001');
    expect(r.settings).toMatchObject({ numberYear: 2027, nextNumber: 2 });
  });
});

describe('dates', () => {
  it('computes validity and formats like the sample', () => {
    expect(addDays('2026-09-27', 7)).toBe('2026-10-04');
    expect(formatDate('2026-10-04')).toBe('04.10.2026');
    expect(formatDateShort('2026-10-08')).toBe('08.10.26');
    expect(daysBetween('2026-09-27', '2026-10-04')).toBe(7);
    expect(formatDate('')).toBe('');
  });
});

describe('parseQuoteNumber / highestSeq', () => {
  it('reads numbers back, ignoring other years and free-form numbers', () => {
    expect(parseQuoteNumber('Q-2026-0042')).toEqual({ year: 2026, seq: 42 });
    expect(parseQuoteNumber('SP-2026-12')).toEqual({ year: 2026, seq: 12 });
    expect(parseQuoteNumber('ללא')).toBeNull();
    expect(highestSeq(['Q-2026-0003', 'Q-2025-0100', 'Q-2026-0010', 'x'], 2026)).toBe(10);
  });
});

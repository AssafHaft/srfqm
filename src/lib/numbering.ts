import type { Settings } from '../model/types';

export function formatQuoteNumber(prefix: string, year: number, seq: number): string {
  const head = prefix.trim() ? `${prefix.trim()}-` : '';
  return `${head}${year}-${String(seq).padStart(4, '0')}`;
}

/** Returns the number to use now and the settings to store afterwards. Numbering restarts every calendar year. */
export function takeQuoteNumber(settings: Settings, now: Date = new Date()): { number: string; settings: Settings } {
  const year = now.getFullYear();
  const seq = settings.numberYear === year ? Math.max(1, Math.floor(settings.nextNumber)) : 1;
  return {
    number: formatQuoteNumber(settings.numberPrefix, year, seq),
    settings: { ...settings, numberYear: year, nextNumber: seq + 1 },
  };
}

/** Reads the year and running number back from a quote number such as "Q-2026-0042". */
export function parseQuoteNumber(number: string): { year: number; seq: number } | null {
  const m = /(\d{4})-(\d+)\s*$/.exec(number);
  return m ? { year: Number(m[1]), seq: Number(m[2]) } : null;
}

/** Highest running number already used in `year`, so a shared counter never re-issues an existing number. */
export function highestSeq(numbers: string[], year: number): number {
  return numbers.reduce((max, n) => {
    const p = parseQuoteNumber(n);
    return p && p.year === year ? Math.max(max, p.seq) : max;
  }, 0);
}

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

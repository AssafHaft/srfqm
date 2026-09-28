/** Dates are stored as local ISO strings (YYYY-MM-DD) and displayed as DD.MM.YYYY. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  if (!d) return '';
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseISODate(fromIso);
  const b = parseISODate(toIso);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 27.09.2026 */
export function formatDate(iso: string): string {
  const d = parseISODate(iso);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}` : '';
}

/** 08.10.26 */
export function formatDateShort(iso: string): string {
  const d = parseISODate(iso);
  return d ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}` : '';
}

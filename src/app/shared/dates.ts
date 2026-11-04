const madridParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

/** Desfase (ms) de Madrid respecto a UTC en el instante dado. */
function madridOffsetMs(utcMs: number): number {
  const p: Record<string, number> = {};
  for (const part of madridParts.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(p['year'], p['month'] - 1, p['day'], p['hour'], p['minute'], p['second']);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Año/mes/día que representa un `Date` usado como "día" (sin hora). Los días se guardan como
 * medianoche UTC; si llega una medianoche local (fecha de un selector) se usan los campos locales.
 */
export function dayParts(d: Date): { y: number; m: number; d: number } {
  const utcMidnight = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
  return utcMidnight
    ? { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }
    : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
}

/** Día (medianoche UTC) siguiente al dado. */
export function nextDay(d: Date): Date {
  const { y, m, d: day } = dayParts(d);
  return new Date(Date.UTC(y, m, day + 1));
}

/** Día (medianoche UTC) sumando `days`, que pueden ser negativos. */
export function addDays(d: Date, days: number): Date {
  const { y, m, d: day } = dayParts(d);
  return new Date(Date.UTC(y, m, day + days));
}

/** Día (medianoche UTC) que es en Madrid en el instante dado. */
export function madridDay(instant: Date): Date {
  const p: Record<string, number> = {};
  for (const part of madridParts.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return new Date(Date.UTC(p['year'], p['month'] - 1, p['day']));
}

/** Instante UTC en que empieza el día dado (00:00 hora de Madrid). */
export function madridDayStartUtc(d: Date): Date {
  const { y, m, d: day } = dayParts(d);
  const guess = Date.UTC(y, m, day);
  let result = guess - madridOffsetMs(guess);
  const corrected = guess - madridOffsetMs(result);
  if (corrected !== result) result = corrected;
  return new Date(result);
}

/** `YYYY-MM-DD` del día dado. */
export function formatDay(d: Date): string {
  const { y, m, d: day } = dayParts(d);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Interpreta `YYYY-MM-DD` como día (medianoche UTC); `undefined` si no es válido. */
export function parseDay(s: string | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return formatDay(d) === s ? d : undefined;
}

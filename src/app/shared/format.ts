import { OperationKind } from '../data/models';
import { addDays, madridDay } from './dates';

const formatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(d: Date): string {
  return formatter.format(d);
}

const timeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
});

/** Hora en Madrid del instante dado. */
export function formatTime(d: Date): string {
  return timeFormatter.format(d);
}

// Los días se guardan como medianoche UTC: se formatean en UTC para no cambiar de día.
const dayMonthFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
});
const fullDayFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDayFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

/** Fecha corta de un día, como 01/03/26. */
export function formatDayShort(day: Date): string {
  return shortDayFormatter.format(day);
}

/** Encabezado del día en Madrid de un instante: "Hoy, 4 de noviembre", "Ayer, …" o la fecha completa. */
export function formatDayHeading(instant: Date, now: Date): string {
  const day = madridDay(instant);
  const today = madridDay(now);
  if (day.getTime() === today.getTime()) return `Hoy, ${dayMonthFormatter.format(day)}`;
  if (day.getTime() === addDays(today, -1).getTime()) {
    return `Ayer, ${dayMonthFormatter.format(day)}`;
  }
  return fullDayFormatter.format(day);
}

const KIND_LABELS: Record<OperationKind, string> = {
  add: 'Añadir',
  move: 'Mover',
  remove: 'Eliminar',
  consume: 'Salida',
};

export function operationKindLabel(k: OperationKind): string {
  return KIND_LABELS[k];
}

/** Normaliza texto para búsquedas: sin acentos, minúsculas y sin espacios en los extremos. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

import { Params } from '@angular/router';
import { OperationKind } from '../../data/models';
import { HistoryFilters } from '../../data/operations.service';
import { addDays, formatDay, parseDay } from '../../shared/dates';

export const KINDS: OperationKind[] = ['add', 'move', 'remove', 'consume'];

export type HistoryPeriod = 'today' | '7d' | '30d' | 'all';

export const PERIODS: { value: HistoryPeriod; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'all', label: 'Todo' },
];

const DEFAULT_PERIOD: HistoryPeriod = '7d';

/** Días anteriores a hoy que incluye cada periodo; sin valor no se limitan las fechas. */
const PERIOD_DAYS: Partial<Record<HistoryPeriod, number>> = { today: 0, '7d': 6, '30d': 29 };

const TEXT_KEYS = ['originId', 'destinationId', 'itemId', 'userId', 'reference'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que la pantalla guarda en la URL: los filtros y el periodo rápido elegido. */
export interface HistoryView extends Omit<HistoryFilters, 'locationId'> {
  period?: HistoryPeriod;
}

/** El periodo marcado; ninguno si se han elegido fechas concretas, que mandan sobre él. */
export function activePeriod(v: HistoryView): HistoryPeriod | null {
  return v.from || v.to ? null : (v.period ?? DEFAULT_PERIOD);
}

/** Convierte lo que muestra la pantalla en los filtros de la búsqueda; `today` es un día. */
export function searchFilters(v: HistoryView, today: Date): HistoryFilters {
  const { period: _period, ...filters } = v;
  const active = activePeriod(v);
  const days = active && PERIOD_DAYS[active];
  return days === null || days === undefined
    ? filters
    : { ...filters, from: addDays(today, -days) };
}

/** Los filtros viven en la URL; `to` es el día elegido (inclusivo). */
export function toQueryParams(v: HistoryView): Params {
  const p: Params = {};
  if (v.kinds?.length) p['kind'] = v.kinds;
  for (const k of TEXT_KEYS) if (v[k]) p[k] = v[k];
  if (v.from) p['from'] = formatDay(v.from);
  if (v.to) p['to'] = formatDay(v.to);
  const period = activePeriod(v);
  if (period && period !== DEFAULT_PERIOD) p['period'] = period;
  return p;
}

export function fromQueryParams(p: Params): HistoryView {
  const str = (k: string): string | undefined => {
    const v = p[k];
    return typeof v === 'string' && v !== '' ? v : undefined;
  };
  const v: HistoryView = {};
  // Angular da un texto si en la URL hay un solo tipo y una lista si hay varios.
  const kinds = KINDS.filter((k) => [p['kind']].flat().includes(k));
  if (kinds.length > 0) v.kinds = kinds;
  for (const k of TEXT_KEYS) {
    const value = str(k);
    // Los filtros por id deben ser UUID: uno truncado haría fallar la RPC (22P02).
    if (value && (k === 'reference' || UUID_RE.test(value))) v[k] = value;
  }
  const from = parseDay(str('from'));
  if (from) v.from = from;
  const to = parseDay(str('to'));
  if (to) v.to = to;
  const period = str('period');
  if (PERIODS.some((x) => x.value === period)) v.period = period as HistoryPeriod;
  return v;
}

import { OperationKind } from '../data/models';

const formatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatDateTime(d: Date): string {
  return formatter.format(d);
}

const KIND_LABELS: Record<OperationKind, string> = {
  add: 'Entrada',
  move: 'Traspaso',
  remove: 'Baja',
  consume: 'Salida por trabajo',
};

export function operationKindLabel(k: OperationKind): string {
  return KIND_LABELS[k];
}

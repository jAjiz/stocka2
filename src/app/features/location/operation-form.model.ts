import { OperationInput, OperationKind, OperationLineInput } from '../../data/models';

export interface OperationFormState {
  kind: OperationKind;
  locationId: string;
  originId?: string;
  reference?: string;
  notes?: string;
  lines: OperationLineInput[];
}

export function addLine(lines: OperationLineInput[], itemId: string): OperationLineInput[] {
  if (lines.some((l) => l.itemId === itemId)) return lines;
  return [...lines, { itemId, quantity: 1 }];
}

/** Errores por `itemId`; la clave `''` indica un error global del formulario. */
export function validateLines(
  lines: OperationLineInput[],
  available: Map<string, number> | null,
): Map<string, string> {
  const errors = new Map<string, string>();
  if (lines.length === 0) {
    errors.set('', 'Añade al menos un artículo');
    return errors;
  }
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
      errors.set(l.itemId, 'Cantidad no válida');
    } else if (available) {
      const n = available.get(l.itemId) ?? 0;
      if (l.quantity > n) errors.set(l.itemId, `Solo hay ${n}`);
    }
  }
  return errors;
}

export function buildPayload(state: OperationFormState): OperationInput {
  const out: OperationInput = {
    kind: state.kind,
    locationId: state.locationId,
    lines: state.lines,
  };
  if (state.kind === 'move' && state.originId) out.originId = state.originId;
  const reference = state.reference?.trim();
  if (state.kind === 'consume' && reference) out.reference = reference;
  const notes = state.notes?.trim();
  if (notes) out.notes = notes;
  return out;
}

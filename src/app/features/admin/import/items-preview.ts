import { Item, ItemType } from '../../../data/models';
import { normalizeText } from '../../../shared/format';
import { ImportRow } from './items-reader';

export type PreviewStatus = 'new' | 'exists' | 'error';

export interface PreviewRow extends ImportRow {
  status: PreviewStatus;
  reasons: string[];
  /** Tipo activo reconocido; null si la fila no tiene un tipo válido. */
  typeId: string | null;
}

/**
 * Estado de cada fila (spec §8.1): Error manda sobre «Ya existe». Los nombres y los tipos se
 * comparan sin mayúsculas ni acentos, como `public.normalize_name`. Solo cuentan los artículos y
 * tipos activos.
 */
export function classifyRows(rows: ImportRow[], types: ItemType[], items: Item[]): PreviewRow[] {
  const typeIds = new Map(types.filter((t) => t.active).map((t) => [normalizeText(t.name), t.id]));
  const existing = new Set(items.filter((i) => i.active).map((i) => normalizeText(i.name)));
  const firstRow = new Map<string, number>();

  return rows.map((r) => {
    const reasons: string[] = [];
    const key = normalizeText(r.name);
    if (!r.name) reasons.push('Falta el nombre.');
    const typeId = r.type ? (typeIds.get(normalizeText(r.type)) ?? null) : null;
    if (!r.type) reasons.push('Falta el tipo.');
    else if (!typeId) reasons.push(`El tipo «${r.type}» no existe o está deshabilitado.`);
    if (r.name) {
      const first = firstRow.get(key);
      if (first !== undefined) reasons.push(`Nombre repetido en el archivo (fila ${first}).`);
      else firstRow.set(key, r.row);
    }
    const status: PreviewStatus =
      reasons.length > 0 ? 'error' : existing.has(key) ? 'exists' : 'new';
    return { ...r, status, reasons, typeId };
  });
}

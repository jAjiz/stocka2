const MESSAGES: Record<string, string> = {
  forbidden: 'No tienes permiso para operar en esta localización.',
  invalid_operation: 'La operación no es válida. Revisa los datos.',
  duplicate_item: 'Has añadido el mismo artículo dos veces.',
  inactive_location: 'La localización está deshabilitada.',
  inactive_item: 'Alguno de los artículos está deshabilitado.',
  duplicate_name: 'Ya existe un artículo con ese nombre.',
  inactive_type: 'El tipo de artículo está deshabilitado.',
};

const GENERIC = 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';

interface StockShortage {
  item_id: string;
  available: number;
  requested: number;
}

function stockMessage(details: unknown, itemNames?: Map<string, string>): string {
  let parts: string[] = [];
  if (typeof details === 'string') {
    try {
      const rows = JSON.parse(details) as StockShortage[];
      if (Array.isArray(rows)) {
        parts = rows.map(
          (r) =>
            `${itemNames?.get(r.item_id) ?? 'artículo desconocido'} (hay ${r.available}, pides ${r.requested})`,
        );
      }
    } catch {
      // detalle ilegible: se usa el texto genérico
    }
  }
  return `No hay stock suficiente de: ${parts.length ? parts.join(', ') : 'algún artículo'}`;
}

export function dbErrorMessage(err: unknown, itemNames?: Map<string, string>): string {
  const e = err as { message?: unknown; details?: unknown } | null;
  const code = typeof e?.message === 'string' ? e.message : '';
  if (code === 'insufficient_stock') return stockMessage(e?.details, itemNames);
  return MESSAGES[code] ?? GENERIC;
}

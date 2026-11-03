const MESSAGES: Record<string, string> = {
  forbidden: 'No tienes permiso para operar en esta localización.',
  invalid_operation: 'La operación no es válida. Revisa los datos.',
  duplicate_item: 'Has añadido el mismo artículo dos veces.',
  inactive_location: 'La localización está deshabilitada.',
  inactive_item: 'Alguno de los artículos está deshabilitado.',
  duplicate_name: 'Ya existe un artículo con ese nombre.',
  inactive_type: 'El tipo de artículo está deshabilitado.',
  invalid_input: 'Revisa los datos: hay campos vacíos o no válidos.',
  not_found: 'No se ha encontrado el elemento. Recarga la página.',
  duplicate_location: 'Ya existe una localización con ese nombre.',
  duplicate_type: 'Ya existe un tipo con ese nombre.',
  location_has_stock: 'No se puede deshabilitar: la localización todavía tiene stock.',
  location_in_use: 'No se puede eliminar porque aparece en el historial. Puedes deshabilitarla.',
  type_in_use: 'No se puede eliminar porque hay artículos de este tipo. Puedes deshabilitarlo.',
  item_has_stock: 'No se puede deshabilitar: el artículo todavía tiene stock.',
  item_in_use: 'No se puede eliminar porque aparece en el historial. Puedes deshabilitarlo.',
  last_admin: 'Tiene que quedar al menos un administrador activo.',
  email_exists: 'Ya existe un usuario con ese correo.',
  inactive_user: 'El usuario está desactivado. Actívalo antes de generar un enlace.',
  network: 'Sin conexión. Inténtalo de nuevo.',
};

const GENERIC = 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
const ADMIN_FORBIDDEN = 'Solo un administrador activo puede hacer esto.';

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

/** Igual que dbErrorMessage, pero `forbidden` en la administración no habla de localizaciones. */
export function adminErrorMessage(err: unknown): string {
  const e = err as { message?: unknown } | null;
  return e?.message === 'forbidden' ? ADMIN_FORBIDDEN : dbErrorMessage(err);
}

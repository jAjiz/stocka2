/** Filas por página: igual que `max_rows` de PostgREST (supabase/config.toml y hosted). */
export const PAGE_SIZE = 1000;

/**
 * Lee una tabla completa por páginas. PostgREST trunca en silencio a `max_rows` filas,
 * así que se piden rangos de PAGE_SIZE hasta recibir una página corta.
 * `page(from, to)` debe construir una consulta nueva con `.range(from, to)` y un orden estable.
 */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

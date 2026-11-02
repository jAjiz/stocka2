import { fetchAll, PAGE_SIZE } from './fetch-all';

describe('fetchAll', () => {
  it('pide páginas de 1000 con range hasta recibir una página corta', async () => {
    const sizes = [1000, 1000, 5];
    const calls: [number, number][] = [];
    const page = vi.fn(async (from: number, to: number) => {
      calls.push([from, to]);
      const n = sizes[calls.length - 1];
      return { data: Array.from({ length: n }, (_, i) => from + i), error: null };
    });
    const rows = await fetchAll<number>(page);
    expect(PAGE_SIZE).toBe(1000);
    expect(rows.length).toBe(2005);
    expect(rows[2004]).toBe(2004);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('una página vacía termina', async () => {
    const page = vi.fn(async () => ({ data: [], error: null }));
    expect(await fetchAll(page)).toEqual([]);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('lanza el error de cualquier página', async () => {
    const err = { message: 'boom' };
    let n = 0;
    const page = vi.fn(async () =>
      n++ === 0
        ? { data: Array.from({ length: 1000 }, () => 1), error: null }
        : { data: null, error: err },
    );
    await expect(fetchAll(page)).rejects.toBe(err);
  });
});

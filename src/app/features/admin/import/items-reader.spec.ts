import { CellValue, Workbook } from 'exceljs';
import { ImportFileError, readItemsFile } from './items-reader';

async function xlsx(
  rows: CellValue[][],
  opts: { sheet?: string; header?: string[] } = {},
): Promise<ArrayBuffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet(opts.sheet ?? 'Artículos');
  ws.addRow(opts.header ?? ['Nombre', 'Tipo', 'Referencia']);
  rows.forEach((r, i) => {
    // fila i + 2, dejando huecos tal cual (null = fila vacía)
    if (r.length > 0) ws.getRow(i + 2).values = r;
  });
  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

async function error(data: ArrayBuffer): Promise<string> {
  try {
    await readItemsFile(data);
  } catch (e) {
    expect(e).toBeInstanceOf(ImportFileError);
    return (e as Error).message;
  }
  throw new Error('no lanzó');
}

describe('readItemsFile', () => {
  it('lee las tres columnas sin espacios sobrantes; la primera fila de datos es la 2', async () => {
    const rows = await readItemsFile(await xlsx([['  Tubo ', ' Fontanería', ' T-1 ']]));
    expect(rows).toEqual([{ row: 2, name: 'Tubo', type: 'Fontanería', reference: 'T-1' }]);
  });

  it('encuentra las columnas por su cabecera en cualquier orden y con otras mayúsculas', async () => {
    const rows = await readItemsFile(
      await xlsx([['R-1', 'Tubo', 'Fontanería']], { header: ['referencia', 'NOMBRE', 'tipo'] }),
    );
    expect(rows).toEqual([{ row: 2, name: 'Tubo', type: 'Fontanería', reference: 'R-1' }]);
  });

  it('ignora las filas vacías y conserva la numeración de Excel', async () => {
    const rows = await readItemsFile(
      await xlsx([['A', 'T', null], [], ['  ', null, ''], ['B', 'T', null], []]),
    );
    expect(rows.map((r) => [r.row, r.name])).toEqual([
      [2, 'A'],
      [5, 'B'],
    ]);
  });

  it('una referencia numérica se lee como texto', async () => {
    const [row] = await readItemsFile(await xlsx([['A', 'T', 4001]]));
    expect(row.reference).toBe('4001');
  });

  it('una referencia numérica con formato de ceros conserva los ceros a la izquierda', async () => {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Artículos');
    ws.addRow(['Nombre', 'Tipo', 'Referencia']);
    ws.addRow(['A', 'T', 123]);
    ws.getCell('C2').numFmt = '00000';
    const [row] = await readItemsFile((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(row.reference).toBe('00123');
  });

  it('el texto enriquecido y las fórmulas se leen como su texto visible', async () => {
    const [row] = await readItemsFile(
      await xlsx([
        [
          { richText: [{ text: 'Tu' }, { font: { bold: true }, text: 'bo' }] },
          'T',
          { formula: '"R"&"-2"', result: 'R-2' },
        ],
      ]),
    );
    expect(row.name).toBe('Tubo');
    expect(row.reference).toBe('R-2');
  });

  it('una fila con solo la referencia no se ignora', async () => {
    const rows = await readItemsFile(await xlsx([[null, null, 'R-9']]));
    expect(rows).toEqual([{ row: 2, name: '', type: '', reference: 'R-9' }]);
  });

  it('sin columna Referencia es válido', async () => {
    const rows = await readItemsFile(await xlsx([['A', 'T']], { header: ['Nombre', 'Tipo'] }));
    expect(rows[0].reference).toBe('');
  });

  it('rechaza un archivo que no es xlsx', async () => {
    expect(await error(new TextEncoder().encode('hola').buffer as ArrayBuffer)).toBe(
      'El archivo no es un Excel (.xlsx) válido.',
    );
  });

  it('rechaza un archivo sin la hoja Artículos', async () => {
    expect(await error(await xlsx([['A', 'T']], { sheet: 'Hoja1' }))).toBe(
      'Falta la hoja «Artículos».',
    );
  });

  it('rechaza un archivo sin columna Nombre o sin columna Tipo', async () => {
    expect(await error(await xlsx([['T']], { header: ['Tipo'] }))).toBe(
      'Falta la columna «Nombre».',
    );
    expect(await error(await xlsx([['A']], { header: ['Nombre'] }))).toBe(
      'Falta la columna «Tipo».',
    );
  });

  it('rechaza más de 2000 filas con datos', async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => [`A${i}`, 'T', null]);
    expect(await error(await xlsx(rows))).toBe('El archivo tiene más de 2000 filas con artículos.');
  });

  it('rechaza un archivo sin artículos', async () => {
    expect(await error(await xlsx([[], []]))).toBe('El archivo no tiene ningún artículo.');
  });
});

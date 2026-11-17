import { Workbook } from 'exceljs';
import { ItemType } from '../../../data/models';
import {
  buildItemsTemplate,
  INSTRUCTIONS_SHEET,
  ITEMS_SHEET,
  MAX_IMPORT_ROWS,
} from './items-template';

const TYPES: ItemType[] = [
  { id: 't2', name: 'Fontanería', active: true },
  { id: 't3', name: 'Viejo', active: false },
  { id: 't1', name: 'Electricidad', active: true },
];

async function load(blob: Blob): Promise<Workbook> {
  const wb = new Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  return wb;
}

/** Valores de una lista de validación del tipo `Hoja!$A$1:$A$N`. */
function listValues(wb: Workbook, formula: string): string[] {
  const [sheet, range] = formula.replace(/^=/, '').split('!');
  const ws = wb.getWorksheet(sheet.replace(/'/g, ''))!;
  const [, from, to] = /\$A\$(\d+):\$A\$(\d+)/.exec(range)!;
  const out: string[] = [];
  for (let r = Number(from); r <= Number(to); r++) out.push(String(ws.getCell(`A${r}`).value));
  return out;
}

describe('buildItemsTemplate', () => {
  it('genera la hoja Artículos primero y la de Instrucciones', async () => {
    const blob = await buildItemsTemplate(TYPES);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const wb = await load(blob);
    expect(wb.worksheets[0].name).toBe(ITEMS_SHEET);
    expect(wb.getWorksheet(INSTRUCTIONS_SHEET)).toBeDefined();
  });

  it('la cabecera es Nombre, Tipo, Referencia, en negrita y fija', async () => {
    const ws = (await load(await buildItemsTemplate(TYPES))).getWorksheet(ITEMS_SHEET)!;
    expect(['A1', 'B1', 'C1'].map((c) => ws.getCell(c).value)).toEqual([
      'Nombre',
      'Tipo',
      'Referencia',
    ]);
    expect(ws.getCell('A1').font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('el tipo es una lista con los tipos activos en orden alfabético, en una hoja oculta', async () => {
    const wb = await load(await buildItemsTemplate(TYPES));
    const ws = wb.getWorksheet(ITEMS_SHEET)!;
    for (const cell of ['B2', `B${MAX_IMPORT_ROWS + 1}`]) {
      const dv = ws.getCell(cell).dataValidation;
      expect(dv?.type).toBe('list');
      expect(listValues(wb, dv!.formulae![0] as string)).toEqual(['Electricidad', 'Fontanería']);
    }
    expect(wb.getWorksheet('Tipos')?.state).not.toBe('visible');
  });

  it('sin tipos activos se genera sin lista', async () => {
    const wb = await load(await buildItemsTemplate([TYPES[1]]));
    expect(wb.getWorksheet(ITEMS_SHEET)!.getCell('B2').dataValidation?.type).toBeUndefined();
  });
});

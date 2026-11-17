import type { CellValue, Worksheet } from 'exceljs';
import { normalizeText } from '../../../shared/format';
import { ITEMS_HEADERS, ITEMS_SHEET, MAX_IMPORT_ROWS } from './items-template';

/** Una fila de la hoja «Artículos». `row` es el número de fila de Excel; los textos van sin espacios sobrantes. */
export interface ImportRow {
  row: number;
  name: string;
  type: string;
  reference: string;
}

/** Problema con el archivo entero: no hay vista previa. El mensaje se muestra tal cual. */
export class ImportFileError extends Error {}

/** Lee la hoja «Artículos» de un .xlsx (spec §8.1). ExcelJS se carga bajo demanda. */
export async function readItemsFile(data: ArrayBuffer): Promise<ImportRow[]> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();
  try {
    await wb.xlsx.load(data);
  } catch {
    throw new ImportFileError('El archivo no es un Excel (.xlsx) válido.');
  }
  const ws = wb.worksheets.find((s) => normalizeText(s.name) === normalizeText(ITEMS_SHEET));
  if (!ws) throw new ImportFileError(`Falta la hoja «${ITEMS_SHEET}».`);

  const [nameCol, typeCol, referenceCol] = ITEMS_HEADERS.map((h) => findColumn(ws, h));
  if (!nameCol) throw new ImportFileError(`Falta la columna «${ITEMS_HEADERS[0]}».`);
  if (!typeCol) throw new ImportFileError(`Falta la columna «${ITEMS_HEADERS[1]}».`);

  const rows: ImportRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row.getCell(nameCol).value);
    const type = cellText(row.getCell(typeCol).value);
    const reference = referenceCol ? cellText(row.getCell(referenceCol).value) : '';
    if (!name && !type && !reference) continue;
    rows.push({ row: r, name, type, reference });
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ImportFileError(`El archivo tiene más de ${MAX_IMPORT_ROWS} filas con artículos.`);
    }
  }
  if (rows.length === 0) throw new ImportFileError('El archivo no tiene ningún artículo.');
  return rows;
}

function findColumn(ws: Worksheet, header: string): number | null {
  const wanted = normalizeText(header);
  const row = ws.getRow(1);
  for (let c = 1; c <= row.cellCount; c++) {
    if (normalizeText(cellText(row.getCell(c).value)) === wanted) return c;
  }
  return null;
}

/** Texto visible de una celda, sea cual sea el tipo con que Excel la guardó. */
function cellText(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v)
      return v.richText
        .map((t) => t.text)
        .join('')
        .trim();
    if ('result' in v) return cellText((v.result ?? null) as CellValue);
    if ('text' in v) return cellText(v.text as CellValue);
    return ''; // errores de fórmula y otros objetos
  }
  return String(v).trim();
}

import { ItemType } from '../../../data/models';

export const ITEMS_SHEET = 'Artículos';
export const INSTRUCTIONS_SHEET = 'Instrucciones';
export const ITEMS_HEADERS = ['Nombre', 'Tipo', 'Referencia'] as const;
export const TEMPLATE_FILENAME = 'plantilla-articulos.xlsx';
export const MAX_IMPORT_ROWS = 2000;

const TYPES_SHEET = 'Tipos';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const INSTRUCTIONS = [
  'Cómo rellenar la plantilla',
  '',
  '1. Escribe un artículo por fila en la hoja «Artículos», a partir de la fila 2.',
  '2. Nombre y Tipo son obligatorios. Referencia es opcional.',
  '3. Elige el tipo de la lista desplegable. Si falta un tipo, créalo en la administración y descarga otra plantilla.',
  '4. Los artículos que ya existan con el mismo nombre se saltan; no se modifican.',
  '5. La importación solo crea artículos: no carga cantidades. El stock se añade después desde cada localización.',
  `6. Como máximo ${MAX_IMPORT_ROWS} artículos por archivo.`,
];

/** Plantilla .xlsx para la importación de artículos (spec §8.1). ExcelJS se carga bajo demanda. */
export async function buildItemsTemplate(types: ItemType[]): Promise<Blob> {
  const { Workbook } = await import('exceljs');
  const wb = new Workbook();

  const ws = wb.addWorksheet(ITEMS_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: ITEMS_HEADERS[0], width: 40 },
    { header: ITEMS_HEADERS[1], width: 25 },
    { header: ITEMS_HEADERS[2], width: 20 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F4858' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  const names = types
    .filter((t) => t.active)
    .map((t) => t.name)
    .sort((a, b) => a.localeCompare(b, 'es'));
  if (names.length > 0) {
    // La lista va en una hoja oculta: una lista en línea no admite más de 255 caracteres.
    const list = wb.addWorksheet(TYPES_SHEET, { state: 'veryHidden' });
    names.forEach((n, i) => (list.getCell(`A${i + 1}`).value = n));
    const formula = `'${TYPES_SHEET}'!$A$1:$A$${names.length}`;
    for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
      ws.getCell(`B${r}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorStyle: 'warning',
        errorTitle: 'Tipo',
        error: 'Elige un tipo de la lista.',
      };
    }
  }

  const help = wb.addWorksheet(INSTRUCTIONS_SHEET);
  help.getColumn(1).width = 110;
  INSTRUCTIONS.forEach((line, i) => (help.getCell(`A${i + 1}`).value = line));
  help.getCell('A1').font = { bold: true, size: 14 };

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

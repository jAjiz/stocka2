import { Item, ItemType } from '../../../data/models';
import { classifyRows } from './items-preview';
import { ImportRow } from './items-reader';

const TYPES: ItemType[] = [
  { id: 't1', name: 'Fontanería', active: true },
  { id: 't2', name: 'Viejo', active: false },
];
const ITEMS: Item[] = [
  { id: 'i1', name: 'Codo PVC', typeId: 't1', reference: null, active: true },
  { id: 'i2', name: 'Grifo', typeId: 't1', reference: null, active: false },
];

const row = (r: number, name: string, type = 'Fontanería', reference = ''): ImportRow => ({
  row: r,
  name,
  type,
  reference,
});

describe('classifyRows', () => {
  it('una fila completa con tipo activo es nueva y lleva el id del tipo', () => {
    expect(classifyRows([row(2, 'Tubo')], TYPES, ITEMS)).toEqual([
      { ...row(2, 'Tubo'), status: 'new', reasons: [], typeId: 't1' },
    ]);
  });

  it('un nombre igual a un artículo activo, con otras mayúsculas o acentos, ya existe', () => {
    expect(classifyRows([row(2, 'códo pvc')], TYPES, ITEMS)[0].status).toBe('exists');
  });

  it('un nombre igual a un artículo deshabilitado es nuevo', () => {
    expect(classifyRows([row(2, 'Grifo')], TYPES, ITEMS)[0].status).toBe('new');
  });

  it('el tipo se reconoce sin distinguir mayúsculas ni acentos', () => {
    const [r] = classifyRows([row(2, 'Tubo', 'FONTANERIA')], TYPES, ITEMS);
    expect(r.status).toBe('new');
    expect(r.typeId).toBe('t1');
  });

  it('un tipo inventado o deshabilitado es un error', () => {
    const rows = classifyRows([row(2, 'A', 'Inventado'), row(3, 'B', 'Viejo')], TYPES, ITEMS);
    expect(rows.map((r) => [r.status, r.reasons, r.typeId])).toEqual([
      ['error', ['El tipo «Inventado» no existe o está deshabilitado.'], null],
      ['error', ['El tipo «Viejo» no existe o está deshabilitado.'], null],
    ]);
  });

  it('sin nombre ni tipo da los dos motivos', () => {
    const [r] = classifyRows([row(2, '', '', 'R-9')], TYPES, ITEMS);
    expect(r.status).toBe('error');
    expect(r.reasons).toEqual(['Falta el nombre.', 'Falta el tipo.']);
  });

  it('un nombre repetido en el archivo señala la primera fila', () => {
    const rows = classifyRows([row(2, 'Codo'), row(3, 'Códo')], TYPES, ITEMS);
    expect(rows[0].status).toBe('new');
    expect(rows[1].status).toBe('error');
    expect(rows[1].reasons).toEqual(['Nombre repetido en el archivo (fila 2).']);
  });

  it('el error manda sobre ya existe', () => {
    const [r] = classifyRows([row(2, 'Codo PVC', 'Inventado')], TYPES, ITEMS);
    expect(r.status).toBe('error');
  });

  it('conserva el orden de las filas', () => {
    const rows = classifyRows([row(5, 'B'), row(2, 'A')], TYPES, ITEMS);
    expect(rows.map((r) => r.row)).toEqual([5, 2]);
  });
});

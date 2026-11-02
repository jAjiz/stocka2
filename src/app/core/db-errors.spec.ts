import { dbErrorMessage } from './db-errors';

describe('dbErrorMessage', () => {
  const cases: [string, string][] = [
    ['forbidden', 'No tienes permiso para operar en esta localización.'],
    ['invalid_operation', 'La operación no es válida. Revisa los datos.'],
    ['duplicate_item', 'Has añadido el mismo artículo dos veces.'],
    ['inactive_location', 'La localización está deshabilitada.'],
    ['inactive_item', 'Alguno de los artículos está deshabilitado.'],
    ['duplicate_name', 'Ya existe un artículo con ese nombre.'],
    ['inactive_type', 'El tipo de artículo está deshabilitado.'],
  ];

  for (const [code, text] of cases) {
    it(`traduce ${code}`, () => {
      expect(dbErrorMessage({ message: code })).toBe(text);
    });
  }

  it('lista los artículos sin stock con nombres', () => {
    const details = JSON.stringify([{ item_id: 'a1', available: 0, requested: 1 }]);
    const msg = dbErrorMessage(
      { message: 'insufficient_stock', details },
      new Map([['a1', 'Filtro']]),
    );
    expect(msg).toBe('No hay stock suficiente de: Filtro (hay 0, pides 1)');
  });

  it('insufficient_stock sin detalle usa un texto genérico', () => {
    expect(dbErrorMessage({ message: 'insufficient_stock' })).toBe(
      'No hay stock suficiente de: algún artículo',
    );
  });

  it('un error desconocido da el mensaje genérico', () => {
    const generic = 'Ha ocurrido un error inesperado. Inténtalo de nuevo.';
    expect(dbErrorMessage({ foo: 1 })).toBe(generic);
    expect(dbErrorMessage(null)).toBe(generic);
    expect(dbErrorMessage({ message: 'otra cosa' })).toBe(generic);
  });
});

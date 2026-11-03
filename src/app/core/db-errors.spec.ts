import { adminErrorMessage, dbErrorMessage } from './db-errors';

describe('dbErrorMessage', () => {
  const cases: [string, string][] = [
    ['forbidden', 'No tienes permiso para operar en esta localización.'],
    ['invalid_operation', 'La operación no es válida. Revisa los datos.'],
    ['duplicate_item', 'Has añadido el mismo artículo dos veces.'],
    ['inactive_location', 'La localización está deshabilitada.'],
    ['inactive_item', 'Alguno de los artículos está deshabilitado.'],
    ['duplicate_name', 'Ya existe un artículo con ese nombre.'],
    ['inactive_type', 'El tipo de artículo está deshabilitado.'],
    ['invalid_input', 'Revisa los datos: hay campos vacíos o no válidos.'],
    [
      'invalid_thresholds',
      'Indica al menos un umbral. Si pones los dos, el grave tiene que ser menor que el leve.',
    ],
    ['not_found', 'No se ha encontrado el elemento. Recarga la página.'],
    ['duplicate_location', 'Ya existe una localización con ese nombre.'],
    ['duplicate_type', 'Ya existe un tipo con ese nombre.'],
    ['location_has_stock', 'No se puede deshabilitar: la localización todavía tiene stock.'],
    [
      'location_in_use',
      'No se puede eliminar porque aparece en el historial. Puedes deshabilitarla.',
    ],
    [
      'type_in_use',
      'No se puede eliminar porque hay artículos de este tipo. Puedes deshabilitarlo.',
    ],
    ['item_has_stock', 'No se puede deshabilitar: el artículo todavía tiene stock.'],
    ['item_in_use', 'No se puede eliminar porque aparece en el historial. Puedes deshabilitarlo.'],
    ['last_admin', 'Tiene que quedar al menos un administrador activo.'],
    ['email_exists', 'Ya existe un usuario con ese correo.'],
    ['inactive_user', 'El usuario está desactivado. Actívalo antes de generar un enlace.'],
    ['network', 'Sin conexión. Inténtalo de nuevo.'],
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

describe('adminErrorMessage', () => {
  it('forbidden no habla de localizaciones', () => {
    expect(adminErrorMessage({ message: 'forbidden' })).toBe(
      'Solo un administrador activo puede hacer esto.',
    );
  });

  it('el resto de códigos usa dbErrorMessage', () => {
    expect(adminErrorMessage({ message: 'last_admin' })).toBe(
      'Tiene que quedar al menos un administrador activo.',
    );
  });
});

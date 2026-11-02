import { addLine, buildPayload, validateLines } from './operation-form.model';

describe('operation-form.model', () => {
  it('addLine no duplica un artículo ya presente', () => {
    const lines = [{ itemId: 'a', quantity: 2 }];
    expect(addLine(lines, 'a')).toHaveLength(1);
    expect(addLine(lines, 'b')).toEqual([
      { itemId: 'a', quantity: 2 },
      { itemId: 'b', quantity: 1 },
    ]);
  });

  it('validateLines rechaza cantidades no válidas', () => {
    expect(validateLines([{ itemId: 'a', quantity: 0 }], null).get('a')).toBe('Cantidad no válida');
    expect(validateLines([{ itemId: 'a', quantity: 1.5 }], null).get('a')).toBe('Cantidad no válida');
    expect(validateLines([{ itemId: 'a', quantity: NaN }], null).get('a')).toBe('Cantidad no válida');
  });

  it('validateLines comprueba el stock disponible', () => {
    const errors = validateLines([{ itemId: 'a', quantity: 5 }], new Map([['a', 3]]));
    expect(errors.get('a')).toBe('Solo hay 3');
    expect(validateLines([{ itemId: 'a', quantity: 3 }], new Map([['a', 3]])).size).toBe(0);
  });

  it('validateLines exige al menos una línea', () => {
    expect(validateLines([], null).get('')).toBe('Añade al menos un artículo');
  });

  it('buildPayload descarta referencia fuera de consume y notas en blanco', () => {
    const lines = [{ itemId: 'a', quantity: 1 }];
    const move = buildPayload({
      kind: 'move',
      locationId: 'l',
      originId: 'o',
      reference: 'x',
      notes: '  ',
      lines,
    });
    expect(move.reference).toBeUndefined();
    expect(move.notes).toBeUndefined();
    expect(move.originId).toBe('o');
    const consume = buildPayload({
      kind: 'consume',
      locationId: 'l',
      originId: 'o',
      reference: ' OT-1 ',
      notes: 'n',
      lines,
    });
    expect(consume.reference).toBe('OT-1');
    expect(consume.originId).toBeUndefined();
    expect(consume.notes).toBe('n');
  });
});

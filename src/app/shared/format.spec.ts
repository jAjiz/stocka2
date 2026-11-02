import { formatDateTime, operationKindLabel } from './format';

describe('format', () => {
  it('formatDateTime usa la hora de Madrid (UTC+2 en verano)', () => {
    expect(formatDateTime(new Date('2026-07-01T10:00:00Z'))).toContain('12:00');
  });

  it('operationKindLabel', () => {
    expect(operationKindLabel('add')).toBe('Entrada');
    expect(operationKindLabel('move')).toBe('Traspaso');
    expect(operationKindLabel('remove')).toBe('Baja');
    expect(operationKindLabel('consume')).toBe('Salida por trabajo');
  });
});

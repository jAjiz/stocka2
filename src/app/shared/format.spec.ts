import {
  formatDateTime,
  formatDayShort,
  formatDayHeading,
  formatTime,
  operationKindLabel,
} from './format';

describe('formatDayHeading', () => {
  const now = new Date('2026-11-04T10:00:00Z');

  it('nombra hoy y ayer, según el día en Madrid', () => {
    expect(formatDayHeading(new Date('2026-11-04T08:00:00Z'), now)).toBe('Hoy, 4 de noviembre');
    expect(formatDayHeading(new Date('2026-11-03T23:30:00Z'), now)).toBe('Hoy, 4 de noviembre');
    expect(formatDayHeading(new Date('2026-11-03T08:00:00Z'), now)).toBe('Ayer, 3 de noviembre');
  });

  it('los demás días llevan la fecha completa', () => {
    expect(formatDayHeading(new Date('2026-10-20T08:00:00Z'), now)).toBe('20 de octubre de 2026');
  });
});

describe('formatTime y formatDayShort', () => {
  it('formatTime da la hora de Madrid', () => {
    expect(formatTime(new Date('2026-11-04T15:57:00Z'))).toBe('16:57');
  });

  it('formatDayShort no se mueve de día por la zona horaria', () => {
    expect(formatDayShort(new Date('2026-03-01'))).toBe('01/03/26');
  });
});

describe('format', () => {
  it('formatDateTime usa la hora de Madrid (UTC+2 en verano)', () => {
    expect(formatDateTime(new Date('2026-07-01T10:00:00Z'))).toContain('12:00');
  });

  it('operationKindLabel', () => {
    expect(operationKindLabel('add')).toBe('Añadir');
    expect(operationKindLabel('move')).toBe('Mover');
    expect(operationKindLabel('remove')).toBe('Eliminar');
    expect(operationKindLabel('consume')).toBe('Salida');
  });
});

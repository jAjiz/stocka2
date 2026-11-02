import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../../core/supabase';
import { HistoryFilters, OperationsService } from '../../data/operations.service';
import { fromQueryParams, toQueryParams } from './history.page';

describe('filtros del historial en la URL', () => {
  it('fromQueryParams(toQueryParams(f)) devuelve el mismo f, incluidas las fechas', () => {
    const f: HistoryFilters = {
      kind: 'consume',
      locationId: 'l1',
      originId: 'o1',
      destinationId: 'd1',
      itemId: 'i1',
      userId: 'u1',
      from: new Date('2026-03-01'),
      to: new Date('2026-03-29'),
      reference: 'OT-1',
    };
    expect(fromQueryParams(toQueryParams(f))).toEqual(f);
  });

  it('filtros vacíos dan parámetros vacíos y viceversa', () => {
    expect(toQueryParams({})).toEqual({});
    expect(fromQueryParams({})).toEqual({});
  });

  it('ignora valores inválidos', () => {
    expect(fromQueryParams({ kind: 'zzz', from: 'no-fecha', to: '2026-13-45' })).toEqual({});
  });
});

describe('OperationsService.search', () => {
  function setup(data: unknown[] = []) {
    const rpc = vi.fn(async () => ({ data, error: null }));
    TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: { rpc } }] });
    return { rpc, service: TestBed.inject(OperationsService) };
  }

  it('to=2026-03-29 (cambio de horario) envía p_to=2026-03-29T22:00:00Z', async () => {
    const { rpc, service } = setup();
    await service.search({ to: new Date('2026-03-29') }, 0);
    expect(rpc).toHaveBeenCalledWith(
      'search_operations',
      expect.objectContaining({ p_to: '2026-03-29T22:00:00.000Z', p_from: null }),
    );
  });

  it('from se convierte a las 00:00 de Madrid y pagina con offset', async () => {
    const { rpc, service } = setup();
    await service.search({ from: new Date('2026-03-29') }, 2, 10);
    expect(rpc).toHaveBeenCalledWith(
      'search_operations',
      expect.objectContaining({ p_from: '2026-03-28T23:00:00.000Z', p_limit: 10, p_offset: 20 }),
    );
  });

  it('en invierno Madrid es UTC+1', async () => {
    const { rpc, service } = setup();
    await service.search({ to: new Date('2026-01-15') }, 0);
    expect(rpc).toHaveBeenCalledWith(
      'search_operations',
      expect.objectContaining({ p_to: '2026-01-15T23:00:00.000Z' }),
    );
  });

  it('mapea filas y total; sin filas el total es 0', async () => {
    const { service } = setup([
      {
        id: 'op1',
        kind: 'add',
        origin_id: null,
        destination_id: 'l1',
        reference: null,
        notes: null,
        user_id: 'u1',
        created_at: '2026-03-01T10:00:00Z',
        line_count: 2,
        total_count: 7,
      },
    ]);
    const r = await service.search({}, 0);
    expect(r.total).toBe(7);
    expect(r.rows[0]).toMatchObject({ id: 'op1', destinationId: 'l1', lineCount: 2 });
    expect(r.rows[0].createdAt).toEqual(new Date('2026-03-01T10:00:00Z'));
    TestBed.resetTestingModule();
    const empty = setup([]);
    expect(await empty.service.search({}, 5)).toEqual({ rows: [], total: 0 });
  });
});

import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../../core/supabase';
import { HistoryFilters, OperationsService } from '../../data/operations.service';
import { fromQueryParams, toQueryParams } from './history.page';

describe('filtros del historial en la URL', () => {
  it('fromQueryParams(toQueryParams(f)) devuelve el mismo f, incluidas las fechas', () => {
    const f: HistoryFilters = {
      kind: 'consume',
      locationId: '00000000-0000-4000-8000-000000000101',
      originId: '00000000-0000-4000-8000-000000000102',
      destinationId: '00000000-0000-4000-8000-000000000103',
      itemId: '00000000-0000-4000-8000-000000000301',
      userId: 'A0000000-0000-4000-8000-000000000002',
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

  it('ignora ids que no son UUID (p. ej. un enlace truncado) y conserva los válidos', () => {
    expect(
      fromQueryParams({
        locationId: '00000000-0000-4000-8000-0000000001',
        originId: 'abc',
        destinationId: '00000000-0000-4000-8000-000000000103x',
        itemId: '00000000-0000-4000-8000-000000000301',
        userId: "1' or '1'='1",
        reference: 'OT-1',
      }),
    ).toEqual({ itemId: '00000000-0000-4000-8000-000000000301', reference: 'OT-1' });
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

describe('HistoryPage con artículos deshabilitados', () => {
  async function setup() {
    const { provideRouter } = await import('@angular/router');
    const { CatalogService } = await import('../../data/catalog.service');
    const { HistoryPage } = await import('./history.page');
    const catalog = {
      allLocations: async () => [{ id: 'l1', name: 'Taller', kind: 'warehouse', active: false }],
      profiles: async () => [{ id: 'u1', displayName: 'Ana', role: 'user', active: false }],
      allItems: async () => [
        { id: 'i1', name: 'Pieza antigua', typeId: 't', reference: null, active: false },
      ],
    };
    const ops = {
      search: async () => ({
        rows: [
          {
            id: 'op1',
            kind: 'add',
            originId: null,
            destinationId: 'l1',
            reference: null,
            notes: null,
            userId: 'u1',
            createdAt: new Date('2026-03-01T10:00:00Z'),
            lineCount: 1,
          },
        ],
        total: 1,
      }),
      lines: async () => [{ itemId: 'i1', quantity: 3 }],
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: CatalogService, useValue: catalog },
        { provide: OperationsService, useValue: ops },
      ],
    });
    const fixture = TestBed.createComponent(HistoryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('el detalle muestra el nombre de un artículo deshabilitado', async () => {
    const f = await setup();
    (f.nativeElement.querySelector('tr.mat-mdc-row') as HTMLElement).click();
    await f.whenStable();
    f.detectChanges();
    await f.whenStable();
    const text = document.querySelector('mat-dialog-container')?.textContent ?? '';
    expect(text).toContain('Pieza antigua');
    expect(text).not.toContain('Artículo deshabilitado');
    expect(text).toContain('Taller');
    expect(text).toContain('Ana');
  });

  it('el artículo deshabilitado se puede elegir en el filtro', async () => {
    const f = await setup();
    const selects = f.nativeElement.querySelectorAll('mat-select') as NodeListOf<HTMLElement>;
    const itemSelect = selects[4]; // Tipo, Localización, Origen, Destino, Artículo
    itemSelect.querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click();
    f.detectChanges();
    await f.whenStable();
    const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent);
    expect(options.some((t) => t?.includes('Pieza antigua'))).toBe(true);
  });
});

import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { SUPABASE } from '../../core/supabase';
import { CatalogService } from '../../data/catalog.service';
import { HistoryFilters, OperationsService } from '../../data/operations.service';
import { HistoryPage } from './history.page';
import {
  activePeriod,
  fromQueryParams,
  HistoryView,
  searchFilters,
  toQueryParams,
} from './history-view';

describe('filtros del historial en la URL', () => {
  it('fromQueryParams(toQueryParams(f)) devuelve el mismo f, incluidas las fechas', () => {
    const f: HistoryView = {
      kinds: ['consume'],
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

  it('varios tipos viajan en la URL y un enlace antiguo con un solo tipo sigue valiendo', () => {
    expect(toQueryParams({ kinds: ['move', 'consume'] })).toEqual({ kind: ['move', 'consume'] });
    expect(fromQueryParams({ kind: ['move', 'consume'] })).toEqual({ kinds: ['move', 'consume'] });
    expect(fromQueryParams({ kind: 'move' })).toEqual({ kinds: ['move'] });
    expect(fromQueryParams({ kind: ['move', 'zzz', 'move'] })).toEqual({ kinds: ['move'] });
  });

  it('filtros vacíos dan parámetros vacíos y viceversa', () => {
    expect(toQueryParams({})).toEqual({});
    expect(fromQueryParams({})).toEqual({});
  });

  it('ignora valores inválidos', () => {
    expect(
      fromQueryParams({ kind: 'zzz', from: 'no-fecha', to: '2026-13-45', period: 'siglo' }),
    ).toEqual({});
  });

  it('ignora ids que no son UUID (p. ej. un enlace truncado) y conserva los válidos', () => {
    expect(
      fromQueryParams({
        originId: 'abc',
        destinationId: '00000000-0000-4000-8000-000000000103x',
        itemId: '00000000-0000-4000-8000-000000000301',
        userId: "1' or '1'='1",
        reference: 'OT-1',
      }),
    ).toEqual({ itemId: '00000000-0000-4000-8000-000000000301', reference: 'OT-1' });
  });

  it('el periodo viaja en la URL, salvo el de por defecto o si hay fechas concretas', () => {
    expect(toQueryParams({ period: '30d' })).toEqual({ period: '30d' });
    expect(fromQueryParams({ period: 'all' })).toEqual({ period: 'all' });
    expect(toQueryParams({ period: '7d' })).toEqual({});
    expect(toQueryParams({ period: '30d', from: new Date('2026-03-01') })).toEqual({
      from: '2026-03-01',
    });
  });
});

describe('periodo del historial', () => {
  const today = new Date('2026-11-04');

  it('sin elegir nada son los últimos 7 días, contando hoy', () => {
    expect(activePeriod({})).toBe('7d');
    expect(searchFilters({ kinds: ['move'] }, today)).toEqual({
      kinds: ['move'],
      from: new Date('2026-10-29'),
    });
  });

  it('Hoy y 30 días empiezan en el día que corresponde', () => {
    expect(searchFilters({ period: 'today' }, today)).toEqual({ from: today });
    expect(searchFilters({ period: '30d' }, today)).toEqual({ from: new Date('2026-10-06') });
  });

  it('Todo no limita las fechas', () => {
    expect(searchFilters({ period: 'all' }, today)).toEqual({});
  });

  it('las fechas concretas mandan y ningún periodo queda marcado', () => {
    const view: HistoryView = { period: '30d', to: new Date('2026-03-01') };
    expect(activePeriod(view)).toBeNull();
    expect(searchFilters(view, today)).toEqual({ to: new Date('2026-03-01') });
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

  it('envía los tipos elegidos; sin ninguno no filtra por tipo', async () => {
    const { rpc, service } = setup();
    await service.search({ kinds: ['move', 'consume'] }, 0);
    expect(rpc).toHaveBeenLastCalledWith(
      'search_operations',
      expect.objectContaining({ p_kinds: ['move', 'consume'] }),
    );
    await service.search({}, 0);
    expect(rpc).toHaveBeenLastCalledWith(
      'search_operations',
      expect.objectContaining({ p_kinds: null }),
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

describe('HistoryPage', () => {
  const L1 = '00000000-0000-4000-8000-000000000101';
  const operation = {
    id: 'op1',
    kind: 'add',
    originId: null,
    destinationId: L1,
    reference: null as string | null,
    notes: null,
    userId: 'u1',
    createdAt: new Date('2026-03-01T10:00:00Z'),
    lineCount: 1,
  };

  async function setup(
    opts: { handset?: boolean; rows?: (typeof operation)[]; url?: string; total?: number } = {},
  ) {
    const catalog = {
      allLocations: async () => [{ id: L1, name: 'Taller', kind: 'warehouse', active: false }],
      profiles: async () => [{ id: 'u1', displayName: 'Ana', role: 'user', active: false }],
      allItems: async () => [
        { id: 'i1', name: 'Pieza antigua', typeId: 't', reference: null, active: false },
      ],
    };
    const rows = opts.rows ?? [operation];
    const ops = {
      search: vi.fn(async (_filters: HistoryFilters) => ({
        rows,
        total: opts.total ?? rows.length,
      })),
      lines: async () => [{ itemId: 'i1', quantity: 3 }],
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: HistoryPage }]),
        { provide: CatalogService, useValue: catalog },
        { provide: OperationsService, useValue: ops },
        {
          provide: BreakpointObserver,
          useValue: { observe: () => of({ matches: !!opts.handset, breakpoints: {} }) },
        },
      ],
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(opts.url ?? '/historial');
    const fixture = TestBed.createComponent(HistoryPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return {
      fixture,
      ops,
      router,
      settle,
      el: fixture.nativeElement as HTMLElement,
    };
  }

  const texts = (el: HTMLElement, selector: string) =>
    [...el.querySelectorAll(selector)].map((e) => e.textContent?.replace(/\s+/g, ' ').trim());

  for (const handset of [true, false]) {
    const device = handset ? 'móvil' : 'PC';

    it(`en ${device} cada movimiento es una fila que abre su detalle`, async () => {
      const s = await setup({ handset });
      expect(s.el.querySelector('table')).toBeNull();
      const row = s.el.querySelector('.row') as HTMLElement;
      for (const text of ['Añadir · 1 artículo', 'Taller', 'Ana']) {
        expect(row.textContent).toContain(text);
      }
      expect(row.textContent).not.toContain('Ref.');
      row.click();
      await s.settle();
      expect(document.querySelector('mat-dialog-container')?.textContent).toContain(
        'Pieza antigua',
      );
    });

    it(`en ${device} los filtros están detrás de un botón, no en la pantalla`, async () => {
      const s = await setup({ handset });
      expect(s.el.querySelector('mat-select')).toBeNull();
      expect(s.el.querySelector('mat-expansion-panel')).toBeNull();
      expect(texts(s.el, '.filters-button')).toEqual(['tuneFiltros']);
    });
  }

  it('agrupa los movimientos por día, con cada encabezado una sola vez', async () => {
    const s = await setup({
      rows: [
        { ...operation, id: 'a', createdAt: new Date('2026-03-02T16:00:00Z') },
        { ...operation, id: 'b', createdAt: new Date('2026-03-02T09:00:00Z') },
        { ...operation, id: 'c', createdAt: new Date('2026-03-01T10:00:00Z') },
      ],
    });
    expect(texts(s.el, '.day')).toEqual(['2 de marzo de 2026', '1 de marzo de 2026']);
    expect(s.el.querySelectorAll('.row').length).toBe(3);
    expect(s.el.querySelector('.row .end')?.textContent).toContain('17:00');
  });

  it('un movimiento en plural y con referencia lo muestra en la fila', async () => {
    const s = await setup({ rows: [{ ...operation, lineCount: 3, reference: 'ALB-7' }] });
    const row = s.el.querySelector('.row');
    expect(row?.textContent).toContain('Añadir · 3 artículos');
    expect(row?.textContent).toContain('Ref. ALB-7');
  });

  it('abre en 7 días y cambiar de periodo vuelve a buscar y queda en la URL', async () => {
    const s = await setup();
    expect(texts(s.el, '.periods [aria-pressed="true"]')).toEqual(['7 días']);
    expect(s.ops.search.mock.lastCall?.[0].from).toBeInstanceOf(Date);

    const todo = [...s.el.querySelectorAll<HTMLElement>('.periods button')].find(
      (b) => b.textContent?.trim() === 'Todo',
    );
    todo?.click();
    await s.settle();
    expect(s.router.url).toContain('period=all');
    expect(texts(s.el, '.periods [aria-pressed="true"]')).toEqual(['Todo']);
    expect(s.ops.search.mock.lastCall?.[0]).toEqual({});
  });

  it('los filtros activos salen como etiquetas y se quitan con un toque', async () => {
    const s = await setup({ url: `/historial?kind=move&originId=${L1}` });
    expect(texts(s.el, '.tag')).toEqual(['Mover close', 'Origen: Taller close']);
    expect(texts(s.el, '.filters-button')).toEqual(['tuneFiltros · 2']);

    (s.el.querySelector('.tag') as HTMLElement).click();
    await s.settle();
    expect(s.router.url).not.toContain('kind=');
    expect(s.router.url).toContain('originId=');
    expect(texts(s.el, '.tag')).toEqual(['Origen: Taller close']);
  });

  it('cada tipo elegido tiene su etiqueta y quitarla solo quita ese tipo', async () => {
    const s = await setup({ url: '/historial?kind=move&kind=consume' });
    expect(texts(s.el, '.tag')).toEqual(['Mover close', 'Salida close']);
    expect(texts(s.el, '.filters-button')).toEqual(['tuneFiltros · 2']);
    expect(s.ops.search.mock.lastCall?.[0]).toMatchObject({ kinds: ['move', 'consume'] });

    (s.el.querySelector('.tag') as HTMLElement).click();
    await s.settle();
    expect(s.router.url).not.toContain('kind=move');
    expect(s.router.url).toContain('kind=consume');
    expect(texts(s.el, '.tag')).toEqual(['Salida close']);
  });

  it('las fechas concretas salen como etiquetas y ningún periodo queda marcado', async () => {
    const s = await setup({ url: '/historial?from=2026-03-01' });
    expect(texts(s.el, '.tag')).toEqual(['Desde: 01/03/26 close']);
    expect(s.el.querySelector('.periods [aria-pressed="true"]')).toBeNull();
  });

  it('los periodos y el botón Filtros van en la misma fila, con el mismo tamaño', async () => {
    const s = await setup();
    const toolbar = s.el.querySelector('.toolbar') as HTMLElement;
    expect(texts(toolbar, '.periods button')).toEqual(['Hoy', '7 días', '30 días', 'Todo']);
    expect(toolbar.querySelector('.filters-button')?.classList).toContain('app-chip');
  });

  it('la referencia no se busca en la pantalla: es un filtro más, con su etiqueta', async () => {
    const s = await setup({ url: '/historial?reference=ALB-7' });
    expect(s.el.querySelector('input')).toBeNull();
    expect(s.ops.search.mock.lastCall?.[0]).toMatchObject({ reference: 'ALB-7' });
    expect(texts(s.el, '.tag')).toEqual(['Ref.: ALB-7 close']);
    expect(texts(s.el, '.filters-button')).toEqual(['tuneFiltros · 1']);

    (s.el.querySelector('.tag') as HTMLElement).click();
    await s.settle();
    expect(s.router.url).not.toContain('reference=');
  });

  it('el botón Filtros abre el panel y al confirmar aplica lo elegido', async () => {
    const s = await setup();
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of({ kinds: ['consume'] }),
    } as never);
    (s.el.querySelector('.filters-button') as HTMLElement).click();
    await s.settle();
    expect(open).toHaveBeenCalled();
    expect(s.router.url).toContain('kind=consume');
  });

  it('cerrar el panel sin confirmar no cambia los filtros', async () => {
    const s = await setup();
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of(undefined),
    } as never);
    const calls = s.ops.search.mock.calls.length;
    (s.el.querySelector('.filters-button') as HTMLElement).click();
    await s.settle();
    expect(s.ops.search.mock.calls.length).toBe(calls);
    expect(s.router.url).toBe('/historial');
  });

  it('solo pagina cuando hay más de una página', async () => {
    const few = await setup();
    expect(few.el.querySelector('mat-paginator')).toBeNull();
    TestBed.resetTestingModule();
    const many = await setup({ total: 51 });
    expect(many.el.querySelector('mat-paginator')).not.toBeNull();
  });

  it('el detalle usa la tabla común', async () => {
    const s = await setup();
    (s.el.querySelector('.row') as HTMLElement).click();
    await s.settle();
    expect(document.querySelector('mat-dialog-container table')?.classList).toContain('app-table');
  });

  it('el detalle muestra el nombre de un artículo deshabilitado', async () => {
    const s = await setup();
    (s.el.querySelector('.row') as HTMLElement).click();
    await s.settle();
    const text = document.querySelector('mat-dialog-container')?.textContent ?? '';
    expect(text).toContain('Pieza antigua');
    expect(text).not.toContain('Artículo deshabilitado');
    expect(text).toContain('Taller');
    expect(text).toContain('Ana');
  });

  it('el artículo deshabilitado se puede elegir en el panel de filtros', async () => {
    const s = await setup();
    (s.el.querySelector('.filters-button') as HTMLElement).click();
    await s.settle();
    const selects = document.querySelectorAll<HTMLElement>('mat-dialog-container mat-select');
    selects[2].querySelector<HTMLElement>('.mat-mdc-select-trigger')!.click(); // Origen, Destino, Artículo
    await s.settle();
    const options = Array.from(document.querySelectorAll('mat-option')).map((o) => o.textContent);
    expect(options.some((t) => t?.includes('Pieza antigua'))).toBe(true);
  });
});

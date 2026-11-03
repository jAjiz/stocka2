import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../../core/auth.service';
import { AlertsService } from '../../data/alerts.service';
import { CatalogService } from '../../data/catalog.service';
import { StockService } from '../../data/stock.service';
import { LocationPage } from './location.page';

const alertsFake = () => ({
  active: vi.fn().mockResolvedValue([
    { itemId: 'i1', locationId: 'l1', quantity: 0, level: 'critical', threshold: 1 },
    { itemId: 'i2', locationId: 'otra', quantity: 0, level: 'warning', threshold: 3 },
  ]),
});

async function setup(canOperate: boolean, id = 'l1', alertsFail = false) {
  const auth = { canOperate: () => canOperate, isAdmin: signal(false), ready: Promise.resolve() };
  const catalog = {
    locations: async () => [{ id: 'l1', name: 'Taller', kind: 'warehouse', active: true }],
    itemTypes: async () => [{ id: 't1', name: 'Filtros', active: true }],
    items: async () => [
      { id: 'i1', name: 'Filtró de aire', typeId: 't1', reference: 'FA-1', active: true },
      { id: 'i2', name: 'Aceite 5W30', typeId: 't1', reference: null, active: true },
      { id: 'i3', name: 'Bujía', typeId: 't1', reference: 'BJ-9', active: true },
    ],
  };
  const stock = {
    byLocation: async () => [
      { itemId: 'i1', locationId: 'l1', quantity: 4 },
      { itemId: 'i2', locationId: 'l1', quantity: 2 },
      { itemId: 'i3', locationId: 'l1', quantity: 7 },
    ],
  };
  const alerts = alertsFake();
  if (alertsFail) alerts.active.mockRejectedValue({ message: 'network' });
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: CatalogService, useValue: catalog },
      { provide: StockService, useValue: stock },
      { provide: AlertsService, useValue: alerts },
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', id]])) } },
    ],
  });
  const fixture = TestBed.createComponent(LocationPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return Object.assign(fixture, { alerts });
}

describe('LocationPage', () => {
  it('sin permiso muestra el aviso de acceso', async () => {
    const f = await setup(false);
    expect(f.nativeElement.textContent).toContain('No tienes acceso a esta localización');
  });

  it('con permiso lista los artículos', async () => {
    const f = await setup(true);
    const text = f.nativeElement.textContent as string;
    expect(text).toContain('Filtró de aire');
    expect(text).toContain('Aceite 5W30');
    expect(text).toContain('Bujía');
    for (const label of ['Añadir', 'Traer aquí', 'Baja', 'Salida por trabajo']) {
      expect(text).toContain(label);
    }
  });

  it('una localización inexistente o deshabilitada muestra "no encontrada" sin acciones', async () => {
    const f = await setup(true, 'no-existe');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('Localización no encontrada');
    expect(el.querySelector('a[href="/"]')?.textContent).toContain('Volver a Inicio');
    const buttons = [...el.querySelectorAll('button, a')].map((b) => b.textContent?.trim());
    for (const label of ['Añadir', 'Traer aquí', 'Baja', 'Salida por trabajo', 'Ver historial']) {
      expect(buttons).not.toContain(label);
    }
  });

  it('solo muestra los avisos de esa localización', async () => {
    const f = await setup(true);
    const rows = [...(f.nativeElement as HTMLElement).querySelectorAll('app-alert-list li')];
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Filtró de aire');
    expect(rows[0].querySelector('a')).toBeNull();
  });

  it('si fallan los avisos, el stock se muestra igual y sin error', async () => {
    const f = await setup(true, 'l1', true);
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Filtró de aire');
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelectorAll('app-alert-list li').length).toBe(0);
  });

  it('tras una operación recarga los avisos', async () => {
    const f = await setup(true);
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of(true),
    } as never);
    expect(f.alerts.active).toHaveBeenCalledTimes(1);
    const add = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Añadir',
    ) as HTMLButtonElement;
    add.click();
    await f.whenStable();
    expect(f.alerts.active).toHaveBeenCalledTimes(2);
  });

  it('abre el formulario enfocando el título, no el buscador', async () => {
    const f = await setup(true);
    const open = vi
      .spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(false) } as never);
    const add = [...(f.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Añadir',
    ) as HTMLButtonElement;
    add.click();
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoFocus: 'first-heading' }),
    );
  });

  it('el buscador filtra sin distinguir acentos', async () => {
    const f = await setup(true);
    const input = f.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'filtro';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const text = f.nativeElement.textContent as string;
    expect(text).toContain('Filtró de aire');
    expect(text).not.toContain('Aceite 5W30');
    expect(text).not.toContain('Bujía');
  });

  it('ignora la respuesta tardía de una localización anterior', async () => {
    const params = new BehaviorSubject(new Map([['id', 'A']]));
    const deferred = <T>() => {
      let resolve!: (v: T) => void;
      const promise = new Promise<T>((r) => (resolve = r));
      return { promise, resolve };
    };
    const rowsA = deferred<{ itemId: string; locationId: string; quantity: number }[]>();
    const rowsB = deferred<{ itemId: string; locationId: string; quantity: number }[]>();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { canOperate: () => true, isAdmin: signal(false) } },
        {
          provide: CatalogService,
          useValue: {
            locations: async () => [
              { id: 'A', name: 'Taller', kind: 'warehouse', active: true },
              { id: 'B', name: 'Furgoneta 1', kind: 'vehicle', active: true },
            ],
            itemTypes: async () => [],
            items: async () => [
              { id: 'i1', name: 'Filtro A', typeId: 't', reference: null, active: true },
              { id: 'i2', name: 'Bujía B', typeId: 't', reference: null, active: true },
            ],
          },
        },
        {
          provide: StockService,
          useValue: { byLocation: (id: string) => (id === 'A' ? rowsA.promise : rowsB.promise) },
        },
        { provide: AlertsService, useValue: { active: async () => [] } },
        { provide: ActivatedRoute, useValue: { paramMap: params } },
      ],
    });
    const f = TestBed.createComponent(LocationPage);
    f.detectChanges();
    await Promise.resolve();
    params.next(new Map([['id', 'B']]));
    f.detectChanges();
    rowsB.resolve([{ itemId: 'i2', locationId: 'B', quantity: 3 }]);
    await new Promise((r) => setTimeout(r));
    rowsA.resolve([{ itemId: 'i1', locationId: 'A', quantity: 9 }]);
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const text = f.nativeElement.textContent as string;
    expect(text).toContain('Furgoneta 1');
    expect(text).toContain('Bujía B');
    expect(text).not.toContain('Filtro A');
  });
});

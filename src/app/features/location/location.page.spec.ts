import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../data/catalog.service';
import { StockService } from '../../data/stock.service';
import { LocationPage } from './location.page';

async function setup(canOperate: boolean) {
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
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: CatalogService, useValue: catalog },
      { provide: StockService, useValue: stock },
      { provide: ActivatedRoute, useValue: { paramMap: of(new Map([['id', 'l1']])) } },
    ],
  });
  const fixture = TestBed.createComponent(LocationPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
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

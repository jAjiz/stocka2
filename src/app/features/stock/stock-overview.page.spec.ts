import { BreakpointObserver } from '@angular/cdk/layout';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogService } from '../../data/catalog.service';
import { GlobalAlertsStore } from '../../data/global-alerts.store';
import { GlobalAlert } from '../../data/models';
import { StockService } from '../../data/stock.service';
import { StockOverviewPage } from './stock-overview.page';

const BUJIA = { id: 'i1', name: 'Bujía', typeId: 't1', reference: null, active: true };

let fixture: ComponentFixture<StockOverviewPage>;

function fakeStore(alerts: GlobalAlert[]) {
  const list = signal(alerts);
  return {
    alerts: list,
    byItem: computed(() => new Map(list().map((a) => [a.itemId, a]))),
    count: computed(() => list().length),
    hasCritical: computed(() => list().some((a) => a.level === 'critical')),
    refresh: vi.fn(async () => undefined),
  };
}

async function setup(opts: { handset?: boolean; items?: unknown[]; alerts?: GlobalAlert[] } = {}) {
  const store = fakeStore(opts.alerts ?? []);
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BreakpointObserver,
        useValue: { observe: () => of({ matches: !!opts.handset, breakpoints: {} }) },
      },
      {
        provide: CatalogService,
        useValue: {
          locations: async () => [
            { id: 'l1', name: 'Taller', kind: 'warehouse', active: true },
            { id: 'l2', name: 'Furgo', kind: 'vehicle', active: true },
          ],
          itemTypes: async () => [{ id: 't1', name: 'Filtros', active: true }],
          items: async () => opts.items ?? [BUJIA],
        },
      },
      {
        provide: StockService,
        useValue: {
          all: async () => [
            { itemId: 'i1', locationId: 'l1', quantity: 7 },
            { itemId: 'i1', locationId: 'l2', quantity: 3 },
          ],
        },
      },
      { provide: GlobalAlertsStore, useValue: store },
    ],
  });
  const f = TestBed.createComponent(StockOverviewPage);
  fixture = f;
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

const ACEITE = { ...BUJIA, id: 'i2', name: 'Aceite' };
const rows = (el: HTMLElement) => el.querySelectorAll('tr.mat-mdc-row');
const totalCell = (el: HTMLElement, row = 0) =>
  rows(el)[row]?.querySelector('td.total') as HTMLElement | null;
const onlyAlerts = (el: HTMLElement) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Solo con aviso')) as
    HTMLButtonElement | undefined;

const headers = (el: HTMLElement) =>
  [...el.querySelectorAll('table th')].map((h) => h.textContent?.trim());

describe('StockOverviewPage', () => {
  it('usa la tabla común, con las cantidades como columnas numéricas', async () => {
    const el = await setup();
    expect(el.querySelector('table')?.classList).toContain('app-table');
    expect(headers(el)).toEqual(['Artículo', 'Referencia', 'Tipo', 'Total', 'Taller', 'Furgo']);
    const quantity = el.querySelector('tr.mat-mdc-row td:nth-last-child(2)');
    expect(quantity?.textContent?.trim()).toBe('7');
    expect(quantity?.classList).toContain('num');
  });

  it('en móvil también es una tabla, sin el tipo para dejar sitio a las cantidades', async () => {
    const el = await setup({ handset: true });
    expect(el.querySelector('mat-card')).toBeNull();
    expect(headers(el)).toEqual(['Artículo', 'Total', 'Taller', 'Furgo']);
    expect(el.querySelector('tr.mat-mdc-row td:nth-last-child(2)')?.textContent?.trim()).toBe('7');
  });

  it('en móvil la referencia aparece bajo el nombre, si el artículo la tiene', async () => {
    const el = await setup({
      handset: true,
      items: [
        { ...BUJIA, reference: 'BJ-9' },
        { ...BUJIA, id: 'i2', name: 'Aceite', reference: null },
      ],
    });
    const refs = [...el.querySelectorAll('tr.mat-mdc-row td:first-child')].map((c) =>
      c.querySelector('.sub')?.textContent?.trim(),
    );
    expect(refs).toEqual(['BJ-9', undefined]);
  });

  it('en PC la referencia va en su columna, no bajo el nombre', async () => {
    const el = await setup({ items: [{ ...BUJIA, reference: 'BJ-9' }] });
    expect(el.querySelector('tr.mat-mdc-row .sub')).toBeNull();
    const cells = [...el.querySelectorAll('tr.mat-mdc-row td')].map((c) => c.textContent?.trim());
    expect(cells).toEqual(['Bujía', 'BJ-9', 'Filtros', '10', '7', '3']);
  });

  it('sin artículos solo muestra la cabecera de la tabla, sin ningún mensaje', async () => {
    const el = await setup({ items: [] });
    expect(el.textContent).not.toContain('No hay artículos');
    expect(headers(el).length).toBe(6);
    expect(el.querySelectorAll('tr.mat-mdc-row').length).toBe(0);
  });

  it('el total suma todas las localizaciones', async () => {
    const el = await setup();
    const cell = totalCell(el);
    expect(cell?.textContent?.trim()).toBe('10');
    expect(cell?.classList).toContain('num');
  });

  it('un artículo sin stock tiene total 0', async () => {
    const el = await setup({ items: [BUJIA, ACEITE] });
    expect(totalCell(el, 1)?.textContent?.trim()).toBe('0');
  });

  it('el total se marca grave según el aviso global', async () => {
    const el = await setup({
      alerts: [{ itemId: 'i1', total: 10, level: 'critical', threshold: 5 }],
    });
    const cell = totalCell(el);
    expect(cell?.classList).toContain('critical');
    expect(cell?.getAttribute('title')).toBe('Aviso grave: umbral 5');
  });

  it('el total se marca leve según el aviso global', async () => {
    const el = await setup({
      alerts: [{ itemId: 'i1', total: 10, level: 'warning', threshold: 10 }],
    });
    const cell = totalCell(el);
    expect(cell?.classList).toContain('warning');
    expect(cell?.classList).not.toContain('critical');
    expect(cell?.getAttribute('title')).toBe('Aviso leve: umbral 10');
  });

  it('sin aviso global el total no lleva marca', async () => {
    const el = await setup();
    const cell = totalCell(el);
    expect(cell?.classList).not.toContain('warning');
    expect(cell?.classList).not.toContain('critical');
    expect(cell?.hasAttribute('title')).toBe(false);
  });

  it('refresca los avisos globales al entrar', async () => {
    await setup();
    const store = TestBed.inject(GlobalAlertsStore) as unknown as ReturnType<typeof fakeStore>;
    expect(store.refresh).toHaveBeenCalledTimes(1);
  });

  it('el botón Solo con aviso muestra N y filtra', async () => {
    const el = await setup({
      items: [BUJIA, ACEITE],
      alerts: [{ itemId: 'i2', total: 0, level: 'critical', threshold: 3 }],
    });
    const button = onlyAlerts(el)!;
    expect(button.textContent?.trim()).toBe('Solo con aviso (1)');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(rows(el).length).toBe(2);
    button.click();
    fixture.detectChanges();
    expect(rows(el).length).toBe(1);
    expect(rows(el)[0].textContent).toContain('Aceite');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    const search = el.querySelector('input[type=search]') as HTMLInputElement;
    search.value = 'Bujía';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(rows(el).length).toBe(0);
    expect(onlyAlerts(el)?.textContent?.trim()).toBe('Solo con aviso (1)');
  });

  it('sin avisos globales no hay botón ni colores', async () => {
    const el = await setup({ items: [BUJIA, ACEITE] });
    expect(onlyAlerts(el)).toBeUndefined();
    expect(el.querySelector('td.total.warning, td.total.critical')).toBeNull();
  });
});

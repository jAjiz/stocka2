import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CatalogService } from '../../data/catalog.service';
import { StockService } from '../../data/stock.service';
import { StockOverviewPage } from './stock-overview.page';

const BUJIA = { id: 'i1', name: 'Bujía', typeId: 't1', reference: null, active: true };

async function setup(opts: { handset?: boolean; items?: unknown[] } = {}) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: BreakpointObserver,
        useValue: { observe: () => of({ matches: !!opts.handset, breakpoints: {} }) },
      },
      {
        provide: CatalogService,
        useValue: {
          locations: async () => [{ id: 'l1', name: 'Taller', kind: 'warehouse', active: true }],
          itemTypes: async () => [{ id: 't1', name: 'Filtros', active: true }],
          items: async () => opts.items ?? [BUJIA],
        },
      },
      {
        provide: StockService,
        useValue: { all: async () => [{ itemId: 'i1', locationId: 'l1', quantity: 7 }] },
      },
    ],
  });
  const f = TestBed.createComponent(StockOverviewPage);
  f.detectChanges();
  await f.whenStable();
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

const headers = (el: HTMLElement) =>
  [...el.querySelectorAll('table th')].map((h) => h.textContent?.trim());

describe('StockOverviewPage', () => {
  it('usa la tabla común, con las cantidades como columnas numéricas', async () => {
    const el = await setup();
    expect(el.querySelector('table')?.classList).toContain('app-table');
    expect(headers(el)).toEqual(['Artículo', 'Referencia', 'Tipo', 'Taller']);
    const quantity = el.querySelector('tr.mat-mdc-row td:last-child');
    expect(quantity?.textContent?.trim()).toBe('7');
    expect(quantity?.classList).toContain('num');
  });

  it('en móvil también es una tabla, sin el tipo para dejar sitio a las cantidades', async () => {
    const el = await setup({ handset: true });
    expect(el.querySelector('mat-card')).toBeNull();
    expect(headers(el)).toEqual(['Artículo', 'Taller']);
    expect(el.querySelector('tr.mat-mdc-row td:last-child')?.textContent?.trim()).toBe('7');
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
    expect(cells).toEqual(['Bujía', 'BJ-9', 'Filtros', '7']);
  });

  it('sin artículos solo muestra la cabecera de la tabla, sin ningún mensaje', async () => {
    const el = await setup({ items: [] });
    expect(el.textContent).not.toContain('No hay artículos');
    expect(headers(el).length).toBe(4);
    expect(el.querySelectorAll('tr.mat-mdc-row').length).toBe(0);
  });
});

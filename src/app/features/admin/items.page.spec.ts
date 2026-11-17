import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { ImportItemsDialogComponent } from './import/import-items-dialog.component';
import { ITEMS_TEMPLATE_DOWNLOAD } from './import/items-template';
import { ItemsPage } from './items.page';

async function setup(opts: { downloadError?: boolean } = {}) {
  const download = vi.fn(async () => {
    if (opts.downloadError) throw new Error('x');
  });
  const admin = { deleteItem: vi.fn().mockRejectedValue({ message: 'item_in_use' }) };
  const catalog = {
    allItemTypes: async () => [{ id: 't1', name: 'Mecánica', active: true }],
    allItems: vi.fn().mockResolvedValue([
      { id: 'i1', name: 'Filtró de aire', typeId: 't1', reference: 'FA-1', active: true },
      { id: 'i2', name: 'Aceite 5W30', typeId: 't1', reference: null, active: true },
    ]),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: CatalogService, useValue: catalog },
      { provide: ITEMS_TEMPLATE_DOWNLOAD, useValue: download },
    ],
  });
  const fixture = TestBed.createComponent(ItemsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, admin, catalog, download, el: fixture.nativeElement as HTMLElement };
}

const rows = (el: HTMLElement) =>
  [...el.querySelectorAll('[data-row]')].map((r) => r.textContent ?? '');

describe('ItemsPage', () => {
  it('el buscador filtra sin acentos', async () => {
    const { el, fixture } = await setup();
    expect(rows(el).length).toBe(2);
    expect(rows(el)[0]).toContain('Mecánica');
    const search = el.querySelector('input[type="search"]') as HTMLInputElement;
    search.value = 'filtro';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(rows(el).length).toBe(1);
    expect(rows(el)[0]).toContain('Filtró de aire');
  });

  it('eliminar un artículo con historial muestra el error', async () => {
    const { el, admin, fixture } = await setup();
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of(true),
    } as never);
    (
      [...el.querySelectorAll('[data-row] button')].find((b) =>
        b.textContent?.includes('Eliminar'),
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(admin.deleteItem).toHaveBeenCalled();
    expect(el.textContent).toContain(
      'No se puede eliminar porque aparece en el historial. Puedes deshabilitarlo.',
    );
  });

  const toolbarButton = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll('.toolbar button')].find((b) =>
      b.textContent?.includes(label),
    ) as HTMLButtonElement;

  it('descargar plantilla genera la plantilla con los tipos cargados', async () => {
    const { el, fixture, download } = await setup();
    toolbarButton(el, 'Descargar plantilla').click();
    await fixture.whenStable();
    expect(download).toHaveBeenCalledWith([{ id: 't1', name: 'Mecánica', active: true }]);
  });

  it('si falla la plantilla se muestra un error', async () => {
    const { el, fixture } = await setup({ downloadError: true });
    toolbarButton(el, 'Descargar plantilla').click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'No se ha podido generar la plantilla.',
    );
  });

  it('importar abre el diálogo con tipos y artículos, y recarga la lista si crea algo', async () => {
    const { el, fixture, catalog } = await setup();
    const open = vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of(true),
    } as never);
    catalog.allItems.mockClear();
    toolbarButton(el, 'Importar').click();
    await fixture.whenStable();
    expect(open.mock.calls[0][0]).toBe(ImportItemsDialogComponent);
    const data = (open.mock.calls[0][1] as { data: { types: unknown[]; items: unknown[] } }).data;
    expect(data.types.length).toBe(1);
    expect(data.items.length).toBe(2);
    expect(catalog.allItems).toHaveBeenCalled();
  });
});

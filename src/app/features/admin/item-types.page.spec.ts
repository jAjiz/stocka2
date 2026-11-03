import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { ItemTypesPage } from './item-types.page';

async function setup(deleteResult: () => Promise<void>) {
  const admin = { deleteItemType: vi.fn().mockImplementation(deleteResult) };
  const catalog = {
    allItemTypes: vi.fn().mockResolvedValue([{ id: 't1', name: 'Fontanería', active: true }]),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: CatalogService, useValue: catalog },
    ],
  });
  const fixture = TestBed.createComponent(ItemTypesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
    afterClosed: () => of(true),
  } as never);
  const el = fixture.nativeElement as HTMLElement;
  const remove = async () => {
    (
      [...el.querySelectorAll('[data-row] button')].find((b) =>
        b.textContent?.includes('Eliminar'),
      ) as HTMLButtonElement
    ).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { el, admin, catalog, remove };
}

describe('ItemTypesPage', () => {
  it('eliminar un tipo en uso muestra el error', async () => {
    const { el, remove, admin } = await setup(() => Promise.reject({ message: 'type_in_use' }));
    await remove();
    expect(admin.deleteItemType).toHaveBeenCalledWith('t1');
    expect(el.textContent).toContain(
      'No se puede eliminar porque hay artículos de este tipo. Puedes deshabilitarlo.',
    );
  });

  it('eliminar con éxito recarga la lista', async () => {
    const { remove, catalog } = await setup(() => Promise.resolve());
    await remove();
    expect(catalog.allItemTypes).toHaveBeenCalledTimes(2);
  });
});

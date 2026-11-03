import { TestBed } from '@angular/core/testing';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { LocationsPage } from './locations.page';

async function setup() {
  const admin = {
    setLocationActive: vi.fn().mockRejectedValue({ message: 'location_has_stock' }),
  };
  const catalog = {
    allLocations: vi.fn().mockResolvedValue([
      { id: 'l1', name: 'Taller', kind: 'warehouse', active: true },
      { id: 'l2', name: 'Furgoneta vieja', kind: 'vehicle', active: false },
    ]),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: CatalogService, useValue: catalog },
    ],
  });
  const fixture = TestBed.createComponent(LocationsPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, admin, el: fixture.nativeElement as HTMLElement };
}

const row = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll('[data-row]')].find((r) => r.textContent?.includes(name)) as
    HTMLElement | undefined;

describe('LocationsPage', () => {
  it('oculta las deshabilitadas salvo con "Mostrar deshabilitados"', async () => {
    const { el, fixture } = await setup();
    expect(row(el, 'Taller')).toBeDefined();
    expect(row(el, 'Furgoneta vieja')).toBeUndefined();
    (el.querySelector('button[role="switch"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(row(el, 'Furgoneta vieja')?.textContent).toContain('Deshabilitada');
  });

  it('muestra el error al deshabilitar con stock', async () => {
    const { el, admin, fixture } = await setup();
    const button = [...row(el, 'Taller')!.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Deshabilitar'),
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(admin.setLocationActive).toHaveBeenCalledWith('l1', false);
    expect(el.textContent).toContain(
      'No se puede deshabilitar: la localización todavía tiene stock.',
    );
  });
});

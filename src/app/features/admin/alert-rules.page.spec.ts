import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { AlertsService } from '../../data/alerts.service';
import { CatalogService } from '../../data/catalog.service';
import { AlertRulesPage } from './alert-rules.page';

async function setup() {
  const alerts = {
    rules: vi.fn().mockResolvedValue([
      {
        id: 'r1',
        name: 'Stock general',
        allItems: true,
        allLocations: true,
        itemIds: [],
        locationIds: [],
        warning: null,
        critical: 1,
        active: true,
      },
      {
        id: 'r2',
        name: 'Furgonetas',
        allItems: false,
        allLocations: false,
        itemIds: ['i1', 'i2'],
        locationIds: ['l1', 'l2'],
        warning: 5,
        critical: 2,
        active: true,
      },
      {
        id: 'r3',
        name: 'Viejas',
        allItems: true,
        allLocations: false,
        itemIds: [],
        locationIds: ['l3'],
        warning: 3,
        critical: null,
        active: true,
      },
    ]),
    deleteRule: vi.fn().mockRejectedValue({ message: 'forbidden' }),
  };
  const catalog = {
    items: vi.fn().mockResolvedValue([]),
    allLocations: vi.fn().mockResolvedValue([
      { id: 'l1', name: 'Taller', kind: 'warehouse', active: true },
      { id: 'l2', name: 'Furgoneta 1', kind: 'vehicle', active: true },
      { id: 'l3', name: 'Almacén viejo', kind: 'warehouse', active: false },
    ]),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AlertsService, useValue: alerts },
      { provide: CatalogService, useValue: catalog },
      { provide: MatDialog, useValue: { open: () => ({ afterClosed: () => of(true) }) } },
    ],
  });
  const fixture = TestBed.createComponent(AlertRulesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, alerts, el: fixture.nativeElement as HTMLElement };
}

const row = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll('[data-row]')].find((r) => r.textContent?.includes(name)) as
    HTMLElement | undefined;

describe('AlertRulesPage', () => {
  it('resume artículos, localizaciones y umbrales de cada regla', async () => {
    const { el } = await setup();
    const all = row(el, 'Stock general')!.textContent!;
    expect(all).toContain('Artículos: Todos');
    expect(all).toContain('Localizaciones: Todas');
    expect(all).toContain('Grave ≤ 1');
    expect(all).not.toContain('Leve');
    const some = row(el, 'Furgonetas')!.textContent!;
    expect(some).toContain('Artículos: 2');
    expect(some).toContain('Localizaciones: Taller, Furgoneta 1');
    expect(some).toContain('Leve ≤ 5 · Grave ≤ 2');
  });

  it('nombra las localizaciones deshabilitadas de una regla', async () => {
    const { el } = await setup();
    expect(row(el, 'Viejas')!.textContent).toContain('Localizaciones: Almacén viejo (deshabilitada)');
  });

  it('muestra el error al eliminar sin permiso', async () => {
    const { el, alerts, fixture } = await setup();
    const button = [...row(el, 'Furgonetas')!.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Eliminar'),
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(alerts.deleteRule).toHaveBeenCalledWith('r2');
    expect(el.textContent).toContain('Solo un administrador activo puede hacer esto.');
  });
});

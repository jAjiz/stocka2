import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AlertsService } from '../../data/alerts.service';
import { CatalogService } from '../../data/catalog.service';
import { HomePage } from './home.page';

describe('HomePage', () => {
  it('solo muestra avisos de localizaciones con permiso', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { canOperate: (id: string) => id === 'f1' } },
        {
          provide: CatalogService,
          useValue: {
            locations: async () => [
              { id: 'f1', name: 'F1', kind: 'vehicle', active: true },
              { id: 'f2', name: 'F2', kind: 'vehicle', active: true },
            ],
            items: async () => [
              { id: 'i1', name: 'Bridas', typeId: 't', reference: null, active: true },
              { id: 'i2', name: 'Codo', typeId: 't', reference: null, active: true },
            ],
          },
        },
        {
          provide: AlertsService,
          useValue: {
            active: async () => [
              { itemId: 'i1', locationId: 'f1', quantity: 3, level: 'warning', threshold: 5 },
              { itemId: 'i2', locationId: 'f2', quantity: 0, level: 'critical', threshold: 1 },
            ],
          },
        },
      ],
    });
    const f = TestBed.createComponent(HomePage);
    f.detectChanges();
    await new Promise((r) => setTimeout(r));
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('li')];
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Bridas');
    expect(el.textContent).not.toContain('Codo');
    expect(el.textContent).toContain('1 aviso');
    expect(el.textContent).not.toContain('1 avisos');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AlertsService } from '../../data/alerts.service';
import { CatalogService } from '../../data/catalog.service';
import { StockAlert } from '../../data/models';
import { HomePage } from './home.page';

async function setup(permitted: string[], alerts: StockAlert[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { canOperate: (id: string) => permitted.includes(id) } },
      {
        provide: CatalogService,
        useValue: {
          locations: async () => [
            { id: 'f1', name: 'F1', kind: 'vehicle', active: true },
            { id: 'f2', name: 'F2', kind: 'vehicle', active: true },
            { id: 'f3', name: 'F3', kind: 'vehicle', active: true },
          ],
        },
      },
      { provide: AlertsService, useValue: { active: async () => alerts } },
    ],
  });
  const f = TestBed.createComponent(HomePage);
  f.detectChanges();
  await new Promise((r) => setTimeout(r));
  f.detectChanges();
  const el = f.nativeElement as HTMLElement;
  const card = (name: string) =>
    [...el.querySelectorAll('a')].find((a) => a.textContent?.includes(name)) as HTMLElement;
  return { el, card };
}

const warning = (locationId: string, itemId = 'i1'): StockAlert => ({
  itemId,
  locationId,
  quantity: 3,
  level: 'warning',
  threshold: 5,
});
const critical = (locationId: string, itemId = 'i2'): StockAlert => ({
  itemId,
  locationId,
  quantity: 0,
  level: 'critical',
  threshold: 1,
});

describe('HomePage', () => {
  it('el título está en la franja superior, no en la página', async () => {
    const { el } = await setup(['f1', 'f2']);
    expect(el.querySelector('h1')).toBeNull();
    expect(el.textContent).not.toContain('Inicio');
  });

  it('marca las localizaciones con avisos sin listar los avisos', async () => {
    const { el, card } = await setup(['f1', 'f2'], [warning('f1')]);
    expect(card('F1').textContent).toContain('1 aviso');
    expect(card('F1').textContent).not.toContain('1 avisos');
    expect(card('F2').querySelector('.alert-count')).toBeNull();
    expect(el.querySelector('app-alert-list')).toBeNull();
    expect(el.textContent).not.toContain('Avisos activos');
  });

  it('distingue si hay algún aviso grave', async () => {
    const { card } = await setup(['f1', 'f2'], [warning('f1'), critical('f1'), warning('f2')]);
    expect(card('F1').querySelector('.alert-count')?.textContent).toContain('2 avisos');
    expect(card('F1').querySelector('.alert-count')?.classList).toContain('critical');
    expect(card('F2').querySelector('.alert-count')?.classList).not.toContain('critical');
  });

  it('no enseña las localizaciones sin permiso', async () => {
    const { el } = await setup(['f1'], [critical('f3')]);
    expect(el.textContent).toContain('F1');
    expect(el.textContent).not.toContain('F3');
  });

  it('sin localizaciones lo dice en lugar de pedir que se elija una', async () => {
    const { el } = await setup([]);
    expect(el.textContent).toContain('No tienes localizaciones asignadas');
    expect(el.textContent).not.toContain('Selecciona una localización');
  });
});

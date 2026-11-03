import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AlertsService } from '../../data/alerts.service';
import { AlertRule } from '../../data/models';
import { AlertRuleDialogComponent } from './alert-rule-dialog.component';

const rule: AlertRule = {
  id: 'r1',
  name: 'Tornillos',
  allItems: true,
  allLocations: true,
  itemIds: [],
  locationIds: [],
  warning: null,
  critical: 1,
  active: true,
};

async function setup(data: { rule: AlertRule | null; copy: boolean }) {
  const alerts = { saveRule: vi.fn().mockResolvedValue('r9') };
  const ref = { close: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AlertsService, useValue: alerts },
      { provide: MatDialogRef, useValue: ref },
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          ...data,
          items: [{ id: 'i1', name: 'Tornillo', typeId: 't', reference: null, active: true }],
          locations: [{ id: 'l1', name: 'Taller', kind: 'warehouse', active: true }],
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(AlertRuleDialogComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const type = (label: string, value: string) => {
    const input = [...el.querySelectorAll('mat-form-field')]
      .find((f) => f.textContent?.includes(label))!
      .querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const save = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Guardar'))!;
  return { fixture, alerts, ref, el, type, save };
}

describe('AlertRuleDialogComponent', () => {
  it('rechaza grave igual que leve', async () => {
    const { el, type, save } = await setup({ rule: null, copy: false });
    type('Nombre', 'Regla');
    type('Aviso leve', '2');
    type('Aviso grave', '2');
    expect(el.textContent).toContain(
      'Indica al menos un umbral. Si pones los dos, el grave tiene que ser menor que el leve.',
    );
    expect(save().disabled).toBe(true);
  });

  it('pide al menos un artículo si no se marca "Todos los artículos"', async () => {
    const { el, fixture, save } = await setup({ rule: null, copy: false });
    const box = [...el.querySelectorAll('mat-checkbox')].find((c) =>
      c.textContent?.includes('Todos los artículos'),
    )!;
    (box.querySelector('input') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Elige al menos un artículo.');
    expect(save().disabled).toBe(true);
  });

  it('guarda con todo marcado como null', async () => {
    const { alerts, ref, fixture, type, save } = await setup({ rule: null, copy: false });
    type('Nombre', 'Tornillos');
    type('Aviso grave', '1');
    save().click();
    await fixture.whenStable();
    expect(alerts.saveRule).toHaveBeenCalledWith(null, {
      name: 'Tornillos',
      itemIds: null,
      locationIds: null,
      warning: null,
      critical: 1,
    });
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('al duplicar propone "(copia)" y guarda con id null', async () => {
    const { alerts, fixture, save, el } = await setup({ rule, copy: true });
    expect(el.textContent).toContain('Duplicar regla');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('Tornillos (copia)');
    save().click();
    await fixture.whenStable();
    expect(alerts.saveRule).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'Tornillos (copia)' }),
    );
  });
});

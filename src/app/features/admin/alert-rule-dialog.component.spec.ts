import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AlertsService } from '../../data/alerts.service';
import { AlertRule } from '../../data/models';
import { AlertRuleDialogComponent } from './alert-rule-dialog.component';

const rule: AlertRule = {
  id: 'r1',
  name: 'Tornillos',
  scope: 'location',
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
  const save = () =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Guardar'))!;
  const radio = (label: string) =>
    [...el.querySelectorAll('mat-radio-button')].find((r) => r.textContent?.includes(label))!;
  const choose = (label: string) => {
    (radio(label).querySelector('input') as HTMLInputElement).click();
    fixture.detectChanges();
  };
  const checked = (label: string) =>
    (radio(label).querySelector('input') as HTMLInputElement).checked;
  const hasLocations = () => el.textContent?.includes('Todas las localizaciones') ?? false;
  return { fixture, alerts, ref, el, type, save, choose, checked, hasLocations };
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
      scope: 'location',
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

  it('al editar solo el nombre conserva artículos y localizaciones deshabilitados', async () => {
    const { alerts, fixture, type, save } = await setup({
      rule: {
        ...rule,
        allItems: false,
        allLocations: false,
        itemIds: ['i1', 'iOld'],
        locationIds: ['lOld'],
      },
      copy: false,
    });
    type('Nombre', 'Otro nombre');
    expect(save().disabled).toBe(false);
    save().click();
    await fixture.whenStable();
    expect(alerts.saveRule).toHaveBeenCalledWith('r1', {
      name: 'Otro nombre',
      scope: 'location',
      itemIds: ['i1', 'iOld'],
      locationIds: ['lOld'],
      warning: null,
      critical: 1,
    });
  });

  describe('alcance', () => {
    const GLOBAL = 'Global (total de todas las localizaciones)';

    it('una regla nueva es por localización por defecto', async () => {
      const { checked, hasLocations } = await setup({ rule: null, copy: false });
      expect(checked('Por localización')).toBe(true);
      expect(checked(GLOBAL)).toBe(false);
      expect(hasLocations()).toBe(true);
    });

    it('al elegir Global se ocultan las localizaciones y se guarda con scope global', async () => {
      const { alerts, fixture, type, save, choose, hasLocations } = await setup({
        rule: null,
        copy: false,
      });
      type('Nombre', 'Pedir');
      type('Aviso leve', '10');
      choose(GLOBAL);
      expect(hasLocations()).toBe(false);
      save().click();
      await fixture.whenStable();
      expect(alerts.saveRule).toHaveBeenCalledWith(null, {
        name: 'Pedir',
        scope: 'global',
        itemIds: null,
        locationIds: null,
        warning: 10,
        critical: null,
      });
    });

    it('al elegir Global ignora las localizaciones, incluidas las deshabilitadas', async () => {
      const { alerts, fixture, save, choose } = await setup({
        rule: { ...rule, allLocations: false, locationIds: ['lOld'] },
        copy: false,
      });
      choose(GLOBAL);
      expect(save().disabled).toBe(false);
      save().click();
      await fixture.whenStable();
      expect(alerts.saveRule).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ scope: 'global', locationIds: null }),
      );
    });

    it('editar una regla global la abre con Global marcado', async () => {
      const { checked, hasLocations } = await setup({
        rule: { ...rule, scope: 'global' },
        copy: false,
      });
      expect(checked(GLOBAL)).toBe(true);
      expect(hasLocations()).toBe(false);
    });

    it('duplicar conserva el alcance', async () => {
      const { alerts, fixture, save } = await setup({
        rule: { ...rule, scope: 'global' },
        copy: true,
      });
      save().click();
      await fixture.whenStable();
      expect(alerts.saveRule).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ scope: 'global', locationIds: null }),
      );
    });

    it('pasar de global a por localización exige elegir localizaciones', async () => {
      const { alerts, el, fixture, save, choose } = await setup({
        rule: { ...rule, scope: 'global' },
        copy: false,
      });
      choose('Por localización');
      const box = (label: string) =>
        [...el.querySelectorAll('mat-checkbox')]
          .find((c) => c.textContent?.trim() === label)!
          .querySelector('input') as HTMLInputElement;
      box('Todas las localizaciones').click();
      fixture.detectChanges();
      expect(save().disabled).toBe(true);
      box('Taller').click();
      fixture.detectChanges();
      expect(save().disabled).toBe(false);
      save().click();
      await fixture.whenStable();
      expect(alerts.saveRule).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ scope: 'location', locationIds: ['l1'] }),
      );
    });
  });
});

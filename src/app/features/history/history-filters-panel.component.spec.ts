import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Location } from '../../data/models';
import {
  HistoryFiltersPanelComponent,
  HistoryFiltersPanelData,
} from './history-filters-panel.component';

const L1 = '00000000-0000-4000-8000-000000000101';

async function setup(overrides: Partial<HistoryFiltersPanelData> = {}) {
  const count = vi.fn(async () => 18);
  const close = vi.fn();
  const data: HistoryFiltersPanelData = {
    view: {},
    locations: [{ id: L1, name: 'Taller', kind: 'warehouse', active: true } as Location],
    items: [],
    profiles: [],
    count,
    ...overrides,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(HistoryFiltersPanelComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLElement;
  return { fixture, el, count, close, settle, button };
}

describe('HistoryFiltersPanelComponent', () => {
  it('muestra cuántos movimientos saldrán', async () => {
    const s = await setup();
    expect(s.count).toHaveBeenCalledWith({});
    expect(s.el.querySelector('.apply')?.textContent?.trim()).toBe('Ver 18 movimientos');
  });

  it('usa el singular con un solo movimiento', async () => {
    const s = await setup({ count: async () => 1 });
    expect(s.el.querySelector('.apply')?.textContent?.trim()).toBe('Ver 1 movimiento');
  });

  it('si falla la cuenta el botón sigue disponible, sin número', async () => {
    const s = await setup({ count: async () => Promise.reject(new Error('network')) });
    expect(s.el.querySelector('.apply')?.textContent?.trim()).toBe('Ver movimientos');
  });

  it('se pueden elegir varios tipos, y marcar uno otra vez solo quita ese', async () => {
    const s = await setup();
    s.button('Salida').click();
    await s.settle();
    s.button('Mover').click();
    await s.settle();
    expect(s.count).toHaveBeenLastCalledWith({ kinds: ['move', 'consume'] });
    expect(s.button('Salida').getAttribute('aria-pressed')).toBe('true');
    expect(s.button('Mover').getAttribute('aria-pressed')).toBe('true');

    s.button('Salida').click();
    await s.settle();
    expect(s.count).toHaveBeenLastCalledWith({ kinds: ['move'] });
    expect(s.button('Salida').getAttribute('aria-pressed')).toBe('false');

    s.button('Mover').click();
    await s.settle();
    expect(s.count).toHaveBeenLastCalledWith({});
  });

  it('sus campos usan el contorno de la aplicación', async () => {
    const s = await setup();
    const fields = [...s.el.querySelectorAll('mat-form-field')];
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field.classList).toContain('mat-form-field-appearance-outline');
    }
  });

  it('no ofrece el filtro de origen o destino', async () => {
    const s = await setup();
    const labels = [...s.el.querySelectorAll('mat-label')].map((l) => l.textContent?.trim());
    expect(labels).toEqual([
      'Referencia',
      'Origen',
      'Destino',
      'Artículo',
      'Usuario',
      'Desde',
      'Hasta',
    ]);
  });

  it('la referencia se puede escribir, sin espacios sobrantes, y se puede vaciar', async () => {
    const s = await setup();
    const input = s.el.querySelector('input[name="reference"]') as HTMLInputElement;
    input.value = ' ALB-7 ';
    input.dispatchEvent(new Event('change'));
    await s.settle();
    expect(s.count).toHaveBeenLastCalledWith({ reference: 'ALB-7' });

    input.value = '  ';
    input.dispatchEvent(new Event('change'));
    await s.settle();
    expect(s.count).toHaveBeenLastCalledWith({});
  });

  it('confirmar devuelve lo elegido, con las fechas como días', async () => {
    const s = await setup({ view: { originId: L1, reference: 'OT-1' } });
    s.button('Mover').click();
    const from = s.el.querySelector('input[name="from"]') as HTMLInputElement;
    from.value = '2026-03-01';
    from.dispatchEvent(new Event('change'));
    await s.settle();
    (s.el.querySelector('.apply') as HTMLElement).click();
    expect(s.close).toHaveBeenCalledWith({
      originId: L1,
      reference: 'OT-1',
      kinds: ['move'],
      from: new Date('2026-03-01'),
    });
  });

  it('Limpiar quita los filtros del panel, incluida la referencia, pero no el periodo', async () => {
    const s = await setup({
      view: {
        kinds: ['move'],
        originId: L1,
        from: new Date('2026-03-01'),
        reference: 'OT-1',
        period: '30d',
      },
    });
    s.button('Limpiar').click();
    await s.settle();
    expect(s.count).toHaveBeenLastCalledWith({ period: '30d' });
    expect(s.button('Mover').getAttribute('aria-pressed')).toBe('false');
  });

  it('una respuesta antigua no pisa la cuenta más reciente', async () => {
    let resolveOld: (n: number) => void = () => undefined;
    const count = vi
      .fn<HistoryFiltersPanelData['count']>()
      .mockResolvedValueOnce(18)
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValue(5);
    const s = await setup({ count });

    s.button('Salida').click();
    TestBed.tick();
    s.button('Mover').click();
    TestBed.tick();
    await vi.waitFor(() => expect(count).toHaveBeenCalledTimes(3));
    resolveOld(99);
    await new Promise((r) => setTimeout(r));
    s.fixture.detectChanges();
    expect(s.el.querySelector('.apply')?.textContent?.trim()).toBe('Ver 5 movimientos');
  });
});

import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StockAlert } from '../data/models';
import { AlertListComponent } from './alert-list.component';

const alerts: StockAlert[] = [
  { itemId: 'i1', locationId: 'l1', quantity: 3, level: 'warning', threshold: 5 },
  { itemId: 'i2', locationId: 'l1', quantity: 0, level: 'critical', threshold: 1 },
];

@Component({
  imports: [AlertListComponent],
  template: `<app-alert-list [alerts]="alerts()" [itemNames]="itemNames" />`,
})
class Host {
  alerts = signal(alerts);
  itemNames = new Map([
    ['i1', 'Bridas'],
    ['i2', 'Codo'],
  ]);
}

function setup() {
  const f = TestBed.createComponent(Host);
  f.detectChanges();
  return { f, el: f.nativeElement as HTMLElement };
}

const text = (el: Element, selector: string) =>
  [...el.querySelectorAll(selector)].map((n) => n.textContent?.trim());

describe('AlertListComponent', () => {
  it('muestra un mensaje por aviso, con los graves primero', () => {
    const { el } = setup();
    expect(el.querySelector('table')).toBeNull();
    expect(text(el, 'li.alert .message')).toEqual(['Codo: quedan 0', 'Bridas: quedan 3']);
    expect(text(el, 'li.alert .detail')).toEqual([
      'Aviso grave · salta con 1 o menos',
      'Aviso leve · salta con 5 o menos',
    ]);
  });

  it('usa el singular cuando queda una unidad', () => {
    const { f, el } = setup();
    f.componentInstance.alerts.set([{ ...alerts[0], quantity: 1 }]);
    f.detectChanges();
    expect(text(el, '.message')).toEqual(['Bridas: queda 1']);
  });

  it('distingue los graves con su color e icono', () => {
    const { el } = setup();
    const [critical, warning] = [...el.querySelectorAll('li.alert')];
    expect(critical.classList).toContain('critical');
    expect(critical.querySelector('mat-icon')?.textContent).toBe('report');
    expect(warning.classList).not.toContain('critical');
    expect(warning.querySelector('mat-icon')?.textContent).toBe('warning');
  });

  it('se puede contraer y empieza abierto, con el número de avisos a la vista', () => {
    const { el } = setup();
    const details = el.querySelector('details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    expect(details.querySelector('summary')?.textContent).toContain('Avisos');
    expect(details.querySelector('summary')?.textContent).toContain('2');
  });

  it('sin avisos no pinta nada', () => {
    const { f, el } = setup();
    f.componentInstance.alerts.set([]);
    f.detectChanges();
    expect(el.querySelector('details')).toBeNull();
  });
});

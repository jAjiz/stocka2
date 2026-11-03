import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StockAlert } from '../data/models';
import { AlertListComponent } from './alert-list.component';

const alerts: StockAlert[] = [
  { itemId: 'i1', locationId: 'l1', quantity: 3, level: 'warning', threshold: 5 },
  { itemId: 'i2', locationId: 'l2', quantity: 0, level: 'critical', threshold: 1 },
];

@Component({
  imports: [AlertListComponent],
  template: `<app-alert-list
    [alerts]="alerts()"
    [itemNames]="itemNames"
    [locationNames]="locationNames"
    [showLocation]="showLocation()"
  />`,
})
class Host {
  alerts = signal(alerts);
  itemNames = new Map([
    ['i1', 'Bridas'],
    ['i2', 'Codo'],
  ]);
  locationNames = new Map([
    ['l1', 'F1'],
    ['l2', 'T'],
  ]);
  showLocation = signal(true);
}

function setup() {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(Host);
  f.detectChanges();
  return f;
}

describe('AlertListComponent', () => {
  it('ordena los graves primero y muestra icono y texto', () => {
    const f = setup();
    const rows = [...(f.nativeElement as HTMLElement).querySelectorAll('li')];
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Codo');
    expect(rows[0].querySelector('mat-icon')?.textContent?.trim()).toBe('error');
    expect(rows[0].textContent).toContain('Quedan 0 · aviso grave si ≤ 1');
    expect(rows[1].querySelector('mat-icon')?.textContent?.trim()).toBe('warning');
    expect(rows[1].textContent).toContain('Quedan 3 · aviso si ≤ 5');
    expect(rows[0].querySelector('a')?.getAttribute('href')).toBe('/localizaciones/l2');
  });

  it('sin showLocation no hay enlaces', () => {
    const f = setup();
    f.componentInstance.showLocation.set(false);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelectorAll('a').length).toBe(0);
  });

  it('sin avisos no pinta nada', () => {
    const f = setup();
    f.componentInstance.alerts.set([]);
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).querySelector('li')).toBeNull();
  });
});

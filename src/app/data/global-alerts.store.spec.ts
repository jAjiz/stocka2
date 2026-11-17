import { TestBed } from '@angular/core/testing';
import { AlertsService } from './alerts.service';
import { GlobalAlertsStore } from './global-alerts.store';
import { GlobalAlert } from './models';

function setup(global: () => Promise<GlobalAlert[]>) {
  TestBed.configureTestingModule({
    providers: [{ provide: AlertsService, useValue: { global: vi.fn(global) } }],
  });
  return TestBed.inject(GlobalAlertsStore);
}

describe('GlobalAlertsStore', () => {
  it('refresh carga los avisos y calcula count, hasCritical y byItem', async () => {
    const store = setup(async () => [
      { itemId: 'i1', total: 2, level: 'critical', threshold: 3 },
      { itemId: 'i2', total: 8, level: 'warning', threshold: 10 },
    ]);
    await store.refresh();
    expect(store.count()).toBe(2);
    expect(store.hasCritical()).toBe(true);
    expect(store.byItem().get('i1')?.level).toBe('critical');
    expect(store.byItem().get('i2')?.threshold).toBe(10);
  });

  it('con solo leves hasCritical es false', async () => {
    const store = setup(async () => [{ itemId: 'i2', total: 8, level: 'warning', threshold: 10 }]);
    await store.refresh();
    expect(store.count()).toBe(1);
    expect(store.hasCritical()).toBe(false);
  });

  it('si global() falla, refresh no lanza y deja la lista vacía', async () => {
    let fail = false;
    const store = setup(async () => {
      if (fail) throw new Error('red');
      return [{ itemId: 'i1', total: 2, level: 'critical', threshold: 3 }];
    });
    await store.refresh();
    fail = true;
    await expect(store.refresh()).resolves.toBeUndefined();
    expect(store.alerts()).toEqual([]);
    expect(store.count()).toBe(0);
  });

  it('clear vacía la lista', async () => {
    const store = setup(async () => [{ itemId: 'i1', total: 2, level: 'critical', threshold: 3 }]);
    await store.refresh();
    store.clear();
    expect(store.count()).toBe(0);
  });

  it('un refresh lanzado antes de clear no repone los avisos al terminar', async () => {
    let resolve!: (v: GlobalAlert[]) => void;
    const store = setup(() => new Promise((r) => (resolve = r)));
    const pending = store.refresh();
    store.clear();
    resolve([{ itemId: 'i1', total: 2, level: 'critical', threshold: 3 }]);
    await pending;
    expect(store.count()).toBe(0);
  });
});

import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../core/supabase';
import { AlertsService } from './alerts.service';

function setup(rows: unknown[] = []) {
  const order = vi.fn().mockResolvedValue({ data: rows, error: null });
  const select = vi.fn().mockReturnValue({ order });
  const fake = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn().mockReturnValue({ select }),
  };
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: fake }] });
  return { service: TestBed.inject(AlertsService), fake, select, order };
}

describe('AlertsService', () => {
  it('saveRule con todos envía arrays nulos y p_id nulo', async () => {
    const { service, fake } = setup();
    fake.rpc.mockResolvedValueOnce({ data: 'r1', error: null });
    const id = await service.saveRule(null, {
      name: 'Todo',
      itemIds: null,
      locationIds: null,
      warning: 5,
      critical: null,
    });
    expect(id).toBe('r1');
    expect(fake.rpc).toHaveBeenCalledWith('admin_save_alert_rule', {
      p_id: null,
      p_name: 'Todo',
      p_item_ids: null,
      p_location_ids: null,
      p_warning: 5,
      p_critical: null,
    });
  });

  it('rules convierte las filas embebidas en listas de ids', async () => {
    const { service, fake, order } = setup([
      {
        id: 'r1',
        name: 'Bridas',
        all_items: false,
        all_locations: true,
        warning_threshold: 5,
        critical_threshold: 1,
        active: true,
        alert_rule_items: [{ item_id: 'i1' }, { item_id: 'i2' }],
        alert_rule_locations: [],
      },
    ]);
    const rules = await service.rules();
    expect(fake.from).toHaveBeenCalledWith('alert_rules');
    expect(order).toHaveBeenCalledWith('name');
    expect(rules).toEqual([
      {
        id: 'r1',
        name: 'Bridas',
        allItems: false,
        allLocations: true,
        itemIds: ['i1', 'i2'],
        locationIds: [],
        warning: 5,
        critical: 1,
        active: true,
      },
    ]);
  });

  it('active convierte las filas de active_alerts', async () => {
    const { service, fake } = setup();
    fake.rpc.mockResolvedValueOnce({
      data: [{ item_id: 'i1', location_id: 'l1', quantity: 0, level: 'critical', threshold: 1 }],
      error: null,
    });
    expect(await service.active()).toEqual([
      { itemId: 'i1', locationId: 'l1', quantity: 0, level: 'critical', threshold: 1 },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith('active_alerts');
  });

  it('propaga el error tal cual', async () => {
    const { service, fake } = setup();
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'invalid_thresholds' } });
    await expect(service.deleteRule('r1')).rejects.toEqual({ message: 'invalid_thresholds' });
  });
});

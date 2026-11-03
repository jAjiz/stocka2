import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../core/supabase';
import { AlertRule, AlertRuleInput, StockAlert } from './models';

interface AlertDbRow {
  item_id: string;
  location_id: string;
  quantity: number;
  level: StockAlert['level'];
  threshold: number;
}

interface RuleDbRow {
  id: string;
  name: string;
  all_items: boolean;
  all_locations: boolean;
  warning_threshold: number | null;
  critical_threshold: number | null;
  active: boolean;
  alert_rule_items: { item_id: string }[] | null;
  alert_rule_locations: { location_id: string }[] | null;
}

/** Avisos de stock (lectura para todos) y administración de reglas (solo administradores). */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly supabase = inject(SUPABASE);

  async active(): Promise<StockAlert[]> {
    const { data, error } = await this.supabase.rpc('active_alerts');
    if (error) throw error;
    return ((data ?? []) as AlertDbRow[]).map((r) => ({
      itemId: r.item_id,
      locationId: r.location_id,
      quantity: r.quantity,
      level: r.level,
      threshold: r.threshold,
    }));
  }

  async rules(): Promise<AlertRule[]> {
    const { data, error } = await this.supabase
      .from('alert_rules')
      .select(
        'id, name, all_items, all_locations, warning_threshold, critical_threshold, active, alert_rule_items(item_id), alert_rule_locations(location_id)',
      )
      .order('name');
    if (error) throw error;
    return ((data ?? []) as unknown as RuleDbRow[]).map((r) => ({
      id: r.id,
      name: r.name,
      allItems: r.all_items,
      allLocations: r.all_locations,
      itemIds: (r.alert_rule_items ?? []).map((i) => i.item_id),
      locationIds: (r.alert_rule_locations ?? []).map((l) => l.location_id),
      warning: r.warning_threshold,
      critical: r.critical_threshold,
      active: r.active,
    }));
  }

  saveRule(id: string | null, input: AlertRuleInput): Promise<string> {
    return this.call('admin_save_alert_rule', {
      p_id: id,
      p_name: input.name,
      p_item_ids: input.itemIds,
      p_location_ids: input.locationIds,
      p_warning: input.warning,
      p_critical: input.critical,
    });
  }

  setRuleActive(id: string, active: boolean): Promise<void> {
    return this.call('admin_set_alert_rule_active', { p_id: id, p_active: active });
  }

  deleteRule(id: string): Promise<void> {
    return this.call('admin_delete_alert_rule', { p_id: id });
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(fn, args);
    if (error) throw error;
    return data as T;
  }
}

import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../core/supabase';
import { StockRow } from './models';

interface StockDbRow {
  item_id: string;
  location_id: string;
  quantity: number;
}

const toRow = (r: StockDbRow): StockRow => ({
  itemId: r.item_id,
  locationId: r.location_id,
  quantity: r.quantity,
});

@Injectable({ providedIn: 'root' })
export class StockService {
  private readonly supabase = inject(SUPABASE);

  async byLocation(locationId: string): Promise<StockRow[]> {
    const { data, error } = await this.supabase
      .from('stock')
      .select('item_id, location_id, quantity')
      .eq('location_id', locationId)
      .gt('quantity', 0);
    if (error) throw error;
    return (data ?? []).map(toRow);
  }

  async all(): Promise<StockRow[]> {
    const { data, error } = await this.supabase
      .from('stock')
      .select('item_id, location_id, quantity');
    if (error) throw error;
    return (data ?? []).map(toRow);
  }
}

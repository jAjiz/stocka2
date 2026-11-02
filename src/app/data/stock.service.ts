import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../core/supabase';
import { fetchAll } from './fetch-all';
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
    const rows = await fetchAll<StockDbRow>((from, to) =>
      this.supabase
        .from('stock')
        .select('item_id, location_id, quantity')
        .eq('location_id', locationId)
        .gt('quantity', 0)
        .order('item_id')
        .range(from, to),
    );
    return rows.map(toRow);
  }

  /** Stock con cantidad > 0 de todas las localizaciones (las filas a 0 se conservan en BD). */
  async all(): Promise<StockRow[]> {
    const rows = await fetchAll<StockDbRow>((from, to) =>
      this.supabase
        .from('stock')
        .select('item_id, location_id, quantity')
        .gt('quantity', 0)
        .order('location_id')
        .order('item_id')
        .range(from, to),
    );
    return rows.map(toRow);
  }
}

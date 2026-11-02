import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../core/supabase';
import { madridDayStartUtc, nextDay } from '../shared/dates';
import { OperationInput, OperationKind, OperationLine, OperationSummary } from './models';

export interface HistoryFilters {
  kind?: OperationKind;
  locationId?: string;
  originId?: string;
  destinationId?: string;
  itemId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  reference?: string;
}

interface SearchRow {
  id: string;
  kind: OperationKind;
  origin_id: string | null;
  destination_id: string | null;
  reference: string | null;
  notes: string | null;
  user_id: string;
  created_at: string;
  line_count: number | string;
  total_count: number | string;
}

@Injectable({ providedIn: 'root' })
export class OperationsService {
  private readonly supabase = inject(SUPABASE);

  async perform(input: OperationInput): Promise<string> {
    const { data, error } = await this.supabase.rpc('perform_operation', {
      p_kind: input.kind,
      p_location_id: input.locationId,
      p_lines: input.lines.map((l) => ({ item_id: l.itemId, quantity: l.quantity })),
      p_origin_id: input.originId ?? null,
      p_reference: input.reference ?? null,
      p_notes: input.notes ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  /** `from` y `to` son días; `to` es inclusivo (la RPC recibe el día siguiente a las 00:00 de Madrid). */
  async search(
    f: HistoryFilters,
    page: number,
    pageSize = 50,
  ): Promise<{ rows: OperationSummary[]; total: number }> {
    const { data, error } = await this.supabase.rpc('search_operations', {
      p_kind: f.kind ?? null,
      p_location_id: f.locationId ?? null,
      p_origin_id: f.originId ?? null,
      p_destination_id: f.destinationId ?? null,
      p_item_id: f.itemId ?? null,
      p_user_id: f.userId ?? null,
      p_from: f.from ? madridDayStartUtc(f.from).toISOString() : null,
      p_to: f.to ? madridDayStartUtc(nextDay(f.to)).toISOString() : null,
      p_reference: f.reference || null,
      p_limit: pageSize,
      p_offset: page * pageSize,
    });
    if (error) throw error;
    const rows = (data ?? []) as SearchRow[];
    return {
      rows: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        originId: r.origin_id,
        destinationId: r.destination_id,
        reference: r.reference,
        notes: r.notes,
        userId: r.user_id,
        createdAt: new Date(r.created_at),
        lineCount: Number(r.line_count),
      })),
      total: rows.length ? Number(rows[0].total_count) : 0,
    };
  }

  async lines(operationId: string): Promise<OperationLine[]> {
    const { data, error } = await this.supabase
      .from('operation_lines')
      .select('item_id, quantity')
      .eq('operation_id', operationId);
    if (error) throw error;
    return (data ?? []).map((r) => ({ itemId: r.item_id, quantity: r.quantity }));
  }
}

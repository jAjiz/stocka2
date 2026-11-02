import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../core/supabase';
import { OperationInput } from './models';

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
}

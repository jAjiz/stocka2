import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../core/supabase';
import { Item, ItemType, Location, Profile } from './models';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly supabase = inject(SUPABASE);

  async locations(): Promise<Location[]> {
    const { data, error } = await this.supabase
      .from('locations')
      .select('id, name, kind, active')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind, active: r.active }));
  }

  /** Todas las localizaciones, incluidas las deshabilitadas (para mostrar nombres en el historial). */
  async allLocations(): Promise<Location[]> {
    const { data, error } = await this.supabase
      .from('locations')
      .select('id, name, kind, active')
      .order('name');
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, kind: r.kind, active: r.active }));
  }

  async profiles(): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, display_name, role, active')
      .order('display_name');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      displayName: r.display_name,
      role: r.role,
      active: r.active,
    }));
  }

  async itemTypes(): Promise<ItemType[]> {
    const { data, error } = await this.supabase
      .from('item_types')
      .select('id, name, active')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []).map((r) => ({ id: r.id, name: r.name, active: r.active }));
  }

  async items(): Promise<Item[]> {
    const { data, error } = await this.supabase
      .from('items')
      .select('id, name, type_id, reference, active')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      typeId: r.type_id,
      reference: r.reference,
      active: r.active,
    }));
  }

  /** Todos los artículos, incluidos los deshabilitados (para mostrar nombres en el historial). */
  async allItems(): Promise<Item[]> {
    const { data, error } = await this.supabase
      .from('items')
      .select('id, name, type_id, reference, active')
      .order('name');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      typeId: r.type_id,
      reference: r.reference,
      active: r.active,
    }));
  }

  async createItem(name: string, typeId: string, reference: string | null): Promise<string> {
    const { data, error } = await this.supabase.rpc('create_item', {
      p_name: name,
      p_type_id: typeId,
      p_reference: reference,
    });
    if (error) throw error;
    return data as string;
  }
}

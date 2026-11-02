import { inject, Injectable } from '@angular/core';
import { SUPABASE } from '../core/supabase';
import { fetchAll } from './fetch-all';
import { Item, ItemType, Location, Profile } from './models';

interface LocationDbRow {
  id: string;
  name: string;
  kind: Location['kind'];
  active: boolean;
}

interface ItemDbRow {
  id: string;
  name: string;
  type_id: string;
  reference: string | null;
  active: boolean;
}

const toLocation = (r: LocationDbRow): Location => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  active: r.active,
});

const toItem = (r: ItemDbRow): Item => ({
  id: r.id,
  name: r.name,
  typeId: r.type_id,
  reference: r.reference,
  active: r.active,
});

// Todas las lecturas de tablas completas van paginadas (fetchAll): PostgREST trunca a max_rows.
// Se ordena también por id para que el orden sea estable entre páginas.
@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly supabase = inject(SUPABASE);

  async locations(): Promise<Location[]> {
    const rows = await fetchAll<LocationDbRow>((from, to) =>
      this.supabase
        .from('locations')
        .select('id, name, kind, active')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to),
    );
    return rows.map(toLocation);
  }

  /** Todas las localizaciones, incluidas las deshabilitadas (para mostrar nombres en el historial). */
  async allLocations(): Promise<Location[]> {
    const rows = await fetchAll<LocationDbRow>((from, to) =>
      this.supabase
        .from('locations')
        .select('id, name, kind, active')
        .order('name')
        .order('id')
        .range(from, to),
    );
    return rows.map(toLocation);
  }

  async profiles(): Promise<Profile[]> {
    const rows = await fetchAll<{
      id: string;
      display_name: string;
      role: Profile['role'];
      active: boolean;
    }>((from, to) =>
      this.supabase
        .from('profiles')
        .select('id, display_name, role, active')
        .order('display_name')
        .order('id')
        .range(from, to),
    );
    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      role: r.role,
      active: r.active,
    }));
  }

  async itemTypes(): Promise<ItemType[]> {
    const rows = await fetchAll<{ id: string; name: string; active: boolean }>((from, to) =>
      this.supabase
        .from('item_types')
        .select('id, name, active')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to),
    );
    return rows.map((r) => ({ id: r.id, name: r.name, active: r.active }));
  }

  async items(): Promise<Item[]> {
    const rows = await fetchAll<ItemDbRow>((from, to) =>
      this.supabase
        .from('items')
        .select('id, name, type_id, reference, active')
        .eq('active', true)
        .order('name')
        .order('id')
        .range(from, to),
    );
    return rows.map(toItem);
  }

  /** Todos los artículos, incluidos los deshabilitados (para mostrar nombres en el historial). */
  async allItems(): Promise<Item[]> {
    const rows = await fetchAll<ItemDbRow>((from, to) =>
      this.supabase
        .from('items')
        .select('id, name, type_id, reference, active')
        .order('name')
        .order('id')
        .range(from, to),
    );
    return rows.map(toItem);
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

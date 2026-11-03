import { inject, Injectable } from '@angular/core';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { SUPABASE } from '../core/supabase';
import { buildAccessUrl } from '../shared/access-link';
import { AccessLink, AdminUser, InviteInput, Location, UserInput } from './models';

interface AdminUserDbRow {
  id: string;
  email: string;
  display_name: string;
  role: AdminUser['role'];
  active: boolean;
  location_ids: string[];
  has_password: boolean;
}

interface LinkResponse {
  tokenHash: string;
  expiresAt: string;
}

/** Escrituras de administración: RPC (reglas en la BD) y la Edge Function admin-users. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly supabase = inject(SUPABASE);

  async users(): Promise<AdminUser[]> {
    const { data, error } = await this.supabase.rpc('admin_list_users');
    if (error) throw error;
    return ((data ?? []) as AdminUserDbRow[]).map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      role: r.role,
      active: r.active,
      locationIds: r.location_ids ?? [],
      hasPassword: r.has_password,
    }));
  }

  updateUser(id: string, input: UserInput): Promise<void> {
    return this.call('admin_update_user', {
      p_user_id: id,
      p_display_name: input.displayName,
      p_role: input.role,
      p_location_ids: input.locationIds,
    });
  }

  async invite(input: InviteInput): Promise<AccessLink> {
    return this.toLink(await this.invokeAdminUsers<LinkResponse>({ action: 'invite', ...input }));
  }

  async regenerateLink(userId: string): Promise<AccessLink> {
    return this.toLink(await this.invokeAdminUsers<LinkResponse>({ action: 'link', userId }));
  }

  async setUserActive(userId: string, active: boolean): Promise<void> {
    await this.invokeAdminUsers({ action: 'set-active', userId, active });
  }

  saveLocation(id: string | null, name: string, kind: Location['kind']): Promise<string> {
    return this.call('admin_save_location', { p_id: id, p_name: name, p_kind: kind });
  }

  setLocationActive(id: string, active: boolean): Promise<void> {
    return this.call('admin_set_location_active', { p_id: id, p_active: active });
  }

  deleteLocation(id: string): Promise<void> {
    return this.call('admin_delete_location', { p_id: id });
  }

  saveItemType(id: string | null, name: string): Promise<string> {
    return this.call('admin_save_item_type', { p_id: id, p_name: name });
  }

  setItemTypeActive(id: string, active: boolean): Promise<void> {
    return this.call('admin_set_item_type_active', { p_id: id, p_active: active });
  }

  deleteItemType(id: string): Promise<void> {
    return this.call('admin_delete_item_type', { p_id: id });
  }

  updateItem(id: string, name: string, typeId: string, reference: string | null): Promise<void> {
    return this.call('admin_update_item', {
      p_id: id,
      p_name: name,
      p_type_id: typeId,
      p_reference: reference,
    });
  }

  setItemActive(id: string, active: boolean): Promise<void> {
    return this.call('admin_set_item_active', { p_id: id, p_active: active });
  }

  deleteItem(id: string): Promise<void> {
    return this.call('admin_delete_item', { p_id: id });
  }

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.rpc(fn, args);
    if (error) throw error;
    return data as T;
  }

  /** Los errores de la función llegan como { error: código }: se lanzan como { message }. */
  private async invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.supabase.functions.invoke('admin-users', { body });
    if (!error) return data as T;
    if (error instanceof FunctionsHttpError) {
      let code = 'unexpected';
      try {
        const parsed = (await error.context.json()) as { error?: unknown };
        if (typeof parsed.error === 'string') code = parsed.error;
      } catch {
        // cuerpo ilegible
      }
      throw { message: code };
    }
    throw { message: error instanceof FunctionsFetchError ? 'network' : 'unexpected' };
  }

  private toLink(r: LinkResponse): AccessLink {
    return { url: buildAccessUrl(location.origin, r.tokenHash), expiresAt: new Date(r.expiresAt) };
  }
}

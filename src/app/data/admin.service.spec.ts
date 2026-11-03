import { TestBed } from '@angular/core/testing';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { SUPABASE } from '../core/supabase';
import { AdminService } from './admin.service';

function setup(invokeResult: unknown) {
  const fake = {
    functions: { invoke: vi.fn().mockResolvedValue(invokeResult) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: fake }] });
  return { service: TestBed.inject(AdminService), fake };
}

const input = { email: 'a@b.c', displayName: 'A', role: 'user' as const, locationIds: ['l1'] };

describe('AdminService', () => {
  it('invite construye el enlace de la app con el token_hash', async () => {
    const { service, fake } = setup({
      data: { userId: 'u1', tokenHash: 'h', expiresAt: '2026-11-04T10:00:00Z' },
      error: null,
    });
    const link = await service.invite(input);
    expect(fake.functions.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'invite', ...input },
    });
    expect(link.url.endsWith('/acceso?t=h')).toBe(true);
    expect(link.expiresAt.toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });

  it('un error HTTP de la función se lanza con su código', async () => {
    const response = new Response(JSON.stringify({ error: 'email_exists' }), { status: 400 });
    const { service } = setup({ data: null, error: new FunctionsHttpError(response) });
    await expect(service.invite(input)).rejects.toEqual({ message: 'email_exists' });
  });

  it('otros errores de la función son unexpected', async () => {
    const { service } = setup({ data: null, error: new Error('red') });
    await expect(service.regenerateLink('u1')).rejects.toEqual({ message: 'unexpected' });
  });

  it('sin red la función da network', async () => {
    const { service } = setup({ data: null, error: new FunctionsFetchError(new TypeError('x')) });
    await expect(service.setUserActive('u1', false)).rejects.toEqual({ message: 'network' });
  });

  it('updateUser llama a la RPC con los parámetros', async () => {
    const { service, fake } = setup({});
    await service.updateUser('u1', { displayName: 'A', role: 'admin', locationIds: [] });
    expect(fake.rpc).toHaveBeenCalledWith('admin_update_user', {
      p_user_id: 'u1',
      p_display_name: 'A',
      p_role: 'admin',
      p_location_ids: [],
    });
  });

  it('las RPC propagan el error tal cual', async () => {
    const { service, fake } = setup({});
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: 'location_in_use' } });
    await expect(service.deleteLocation('l1')).rejects.toEqual({ message: 'location_in_use' });
  });
});

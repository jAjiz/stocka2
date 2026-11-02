import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SUPABASE } from './supabase';

interface FakeOpts {
  restored?: boolean;
  profile?: { id: string; display_name: string; role: string; active: boolean } | null;
  profileError?: boolean;
  permissions?: string[];
}

function setup(opts: FakeOpts = {}) {
  const session = { user: { id: 'u1' } };
  const profile =
    opts.profile === undefined
      ? { id: 'u1', display_name: 'Furgo 1', role: 'user', active: true }
      : opts.profile;
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const fake = {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: opts.restored ? session : null } }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signOut,
    },
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'profiles'
            ? {
                maybeSingle: () =>
                  Promise.resolve(
                    opts.profileError
                      ? { data: null, error: { message: 'network' } }
                      : { data: profile, error: null },
                  ),
              }
            : Promise.resolve({
                data: (opts.permissions ?? []).map((location_id) => ({ location_id })),
                error: null,
              }),
      }),
    }),
  };
  TestBed.configureTestingModule({ providers: [{ provide: SUPABASE, useValue: fake }] });
  return { auth: TestBed.inject(AuthService), signOut };
}

const INACTIVE = 'Tu usuario está desactivado. Habla con el administrador.';
const inactiveProfile = { id: 'u1', display_name: 'X', role: 'user', active: false };

describe('AuthService', () => {
  it('ready se resuelve sin sesión', async () => {
    const { auth } = setup();
    await auth.ready;
    expect(auth.session()).toBeNull();
  });

  it('restaura la sesión de un usuario activo', async () => {
    const { auth } = setup({ restored: true, permissions: ['l1'] });
    await auth.ready;
    expect(auth.session()).not.toBeNull();
    expect(auth.profile()?.displayName).toBe('Furgo 1');
    expect(auth.canOperate('l1')).toBe(true);
  });

  it('signIn con usuario inactivo lanza y cierra sesión', async () => {
    const { auth, signOut } = setup({ profile: inactiveProfile });
    await auth.ready;
    await expect(auth.signIn('a@b.c', 'x')).rejects.toThrow(INACTIVE);
    expect(signOut).toHaveBeenCalled();
    expect(auth.session()).toBeNull();
  });

  it('restaurar sesión de usuario inactivo deja la sesión en null', async () => {
    const { auth, signOut } = setup({ restored: true, profile: inactiveProfile });
    await auth.ready;
    expect(auth.session()).toBeNull();
    expect(auth.profile()).toBeNull();
    expect(signOut).toHaveBeenCalled();
  });

  it('un fallo al cargar el perfil en signIn da el error genérico', async () => {
    const { auth, signOut } = setup({ profileError: true });
    await auth.ready;
    await expect(auth.signIn('a@b.c', 'x')).rejects.toThrow(
      'Ha ocurrido un error inesperado. Inténtalo de nuevo.',
    );
    expect(signOut).toHaveBeenCalled();
    expect(auth.session()).toBeNull();
  });

  it('un fallo al cargar el perfil al restaurar no entra al shell', async () => {
    const { auth } = setup({ restored: true, profileError: true });
    await auth.ready;
    expect(auth.session()).toBeNull();
    expect(auth.profile()).toBeNull();
  });

  it('canOperate: admin siempre, usuario solo sus localizaciones', async () => {
    const admin = setup({
      restored: true,
      profile: { id: 'u1', display_name: 'A', role: 'admin', active: true },
    });
    await admin.auth.ready;
    expect(admin.auth.isAdmin()).toBe(true);
    expect(admin.auth.canOperate('cualquiera')).toBe(true);

    TestBed.resetTestingModule();
    const user = setup({ restored: true, permissions: ['l1'] });
    await user.auth.ready;
    expect(user.auth.canOperate('l1')).toBe(true);
    expect(user.auth.canOperate('l2')).toBe(false);
  });

  it('signOut limpia el estado', async () => {
    const { auth } = setup({ restored: true, permissions: ['l1'] });
    await auth.ready;
    await auth.signOut();
    expect(auth.session()).toBeNull();
    expect(auth.profile()).toBeNull();
    expect(auth.permittedLocationIds().size).toBe(0);
  });
});

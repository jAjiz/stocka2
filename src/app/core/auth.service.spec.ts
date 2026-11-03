import { TestBed } from '@angular/core/testing';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { PushService } from '../data/push.service';
import { AuthService } from './auth.service';
import { SUPABASE } from './supabase';

interface FakeOpts {
  restored?: boolean;
  profile?: { id: string; display_name: string; role: string; active: boolean } | null;
  profileError?: boolean;
  permissions?: string[];
  signInError?: unknown;
  signInThrows?: unknown;
  verifyOtpError?: unknown;
}

function setup(opts: FakeOpts = {}) {
  const session = { user: { id: 'u1' } };
  // Se leen de opts en cada llamada para que los tests puedan cambiarlos antes de retry().
  const profile = () =>
    opts.profile === undefined
      ? { id: 'u1', display_name: 'Furgo 1', role: 'user', active: true }
      : opts.profile;
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const fake = {
    auth: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: opts.restored ? session : null } }),
      signInWithPassword: opts.signInThrows
        ? vi.fn().mockRejectedValue(opts.signInThrows)
        : vi
            .fn()
            .mockResolvedValue(
              opts.signInError
                ? { data: { session: null }, error: opts.signInError }
                : { data: { session }, error: null },
            ),
      signOut,
      verifyOtp: vi
        .fn()
        .mockResolvedValue(
          opts.verifyOtpError
            ? { data: { session: null }, error: opts.verifyOtpError }
            : { data: { session }, error: null },
        ),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'profiles'
            ? {
                maybeSingle: () =>
                  Promise.resolve(
                    opts.profileError
                      ? { data: null, error: { message: 'network' } }
                      : { data: profile(), error: null },
                  ),
              }
            : Promise.resolve({
                data: (opts.permissions ?? []).map((location_id) => ({ location_id })),
                error: null,
              }),
      }),
    }),
  };
  const push = {
    forgetDevice: vi.fn().mockResolvedValue(undefined),
    syncDevice: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: SUPABASE, useValue: fake },
      { provide: PushService, useValue: push },
    ],
  });
  return { auth: TestBed.inject(AuthService), signOut, opts, fake, push };
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

  it('signIn correcto vuelve a registrar la suscripción del dispositivo', async () => {
    const { auth, push } = setup();
    await auth.ready;
    await auth.signIn('a@b.c', 'x');
    expect(push.syncDevice).toHaveBeenCalled();
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

  it('un fallo al cargar el perfil al restaurar conserva la sesión y marca loadError', async () => {
    const { auth, signOut } = setup({ restored: true, profileError: true });
    await auth.ready;
    expect(signOut).not.toHaveBeenCalled();
    expect(auth.session()).not.toBeNull();
    expect(auth.profile()).toBeNull();
    expect(auth.loadError()).toBe(true);
  });

  it('retry tras un fallo de carga entra cuando la red vuelve', async () => {
    const { auth, opts } = setup({ restored: true, profileError: true, permissions: ['l1'] });
    await auth.ready;
    opts.profileError = false;
    await auth.retry();
    expect(auth.loadError()).toBe(false);
    expect(auth.profile()?.displayName).toBe('Furgo 1');
    expect(auth.canOperate('l1')).toBe(true);
  });

  it('retry que vuelve a fallar sigue en loadError sin cerrar sesión', async () => {
    const { auth, signOut } = setup({ restored: true, profileError: true });
    await auth.ready;
    await auth.retry();
    expect(auth.loadError()).toBe(true);
    expect(auth.session()).not.toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('retry con el usuario ya desactivado cierra sesión', async () => {
    const { auth, opts, signOut } = setup({ restored: true, profileError: true });
    await auth.ready;
    opts.profileError = false;
    opts.profile = inactiveProfile;
    await auth.retry();
    expect(signOut).toHaveBeenCalled();
    expect(auth.session()).toBeNull();
    expect(auth.loadError()).toBe(false);
  });

  it('restaurar sesión sin perfil cierra sesión', async () => {
    const { auth, signOut } = setup({ restored: true, profile: null });
    await auth.ready;
    expect(signOut).toHaveBeenCalled();
    expect(auth.session()).toBeNull();
    expect(auth.loadError()).toBe(false);
  });

  it('signIn: credenciales incorrectas', async () => {
    const { auth } = setup({
      signInError: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });
    await auth.ready;
    await expect(auth.signIn('a@b.c', 'x')).rejects.toThrow('Correo o contraseña incorrectos.');
  });

  it('signIn: error de red devuelto por supabase-js', async () => {
    const { auth } = setup({ signInError: new AuthRetryableFetchError('Failed to fetch', 0) });
    await auth.ready;
    await expect(auth.signIn('a@b.c', 'x')).rejects.toThrow('Sin conexión. Inténtalo de nuevo.');
  });

  it('signIn: fetch que lanza TypeError', async () => {
    const { auth } = setup({ signInThrows: new TypeError('Failed to fetch') });
    await auth.ready;
    await expect(auth.signIn('a@b.c', 'x')).rejects.toThrow('Sin conexión. Inténtalo de nuevo.');
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

  it('signOut olvida el dispositivo antes de cerrar la sesión', async () => {
    const { auth, push, signOut } = setup({ restored: true });
    await auth.ready;
    await auth.signOut();
    expect(push.forgetDevice).toHaveBeenCalled();
    expect(push.forgetDevice.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
  });

  it('signOut cierra la sesión aunque forgetDevice se quede colgado', async () => {
    const { auth, push, signOut } = setup({ restored: true });
    await auth.ready;
    push.forgetDevice.mockReturnValue(new Promise(() => undefined));
    vi.useFakeTimers();
    try {
      const done = auth.signOut();
      await vi.advanceTimersByTimeAsync(3000);
      await done;
      expect(signOut).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('acceptLink con un enlace caducado da el mensaje de enlace no válido', async () => {
    const { auth } = setup({
      verifyOtpError: new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'),
    });
    await auth.ready;
    await expect(auth.acceptLink('h')).rejects.toThrow(
      'El enlace no es válido o ha caducado. Pide uno nuevo al administrador.',
    );
  });

  it('acceptLink con el usuario desactivado cierra sesión', async () => {
    const { auth, signOut } = setup({ profile: inactiveProfile });
    await auth.ready;
    await expect(auth.acceptLink('h')).rejects.toThrow(INACTIVE);
    expect(signOut).toHaveBeenCalled();
  });

  it('acceptLink canjea el token_hash y carga el perfil', async () => {
    const { auth, fake } = setup({ permissions: ['l1'] });
    await auth.ready;
    await auth.acceptLink('h');
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'recovery' });
    expect(auth.profile()?.displayName).toBe('Furgo 1');
    expect(auth.canOperate('l1')).toBe(true);
  });

  it('setPassword llama a updateUser y traduce el error', async () => {
    const { auth, fake } = setup();
    await auth.ready;
    await auth.setPassword('nueva-clave');
    expect(fake.auth.updateUser).toHaveBeenCalledWith({ password: 'nueva-clave' });
    fake.auth.updateUser.mockResolvedValueOnce({ data: {}, error: new Error('x') });
    await expect(auth.setPassword('otra-clave')).rejects.toThrow(
      'No se ha podido cambiar la contraseña. Inténtalo de nuevo.',
    );
    fake.auth.updateUser.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('New password should be different', 422, 'same_password'),
    });
    await expect(auth.setPassword('nueva-clave')).rejects.toThrow(
      'La nueva contraseña tiene que ser distinta de la actual.',
    );
  });

  it('updateDisplayName actualiza el perfil', async () => {
    const { auth, fake } = setup({ restored: true });
    await auth.ready;
    await auth.updateDisplayName('Pepe');
    expect(fake.rpc).toHaveBeenCalledWith('update_my_profile', { p_display_name: 'Pepe' });
    expect(auth.profile()?.displayName).toBe('Pepe');
  });
});

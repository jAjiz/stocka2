import { computed, inject, Injectable, signal } from '@angular/core';
import { isAuthRetryableFetchError, Session } from '@supabase/supabase-js';
import { Profile } from '../data/models';
import { PushService } from '../data/push.service';
import { SUPABASE } from './supabase';

const NETWORK_ERROR = 'Sin conexión. Inténtalo de nuevo.';
const INVALID_LINK = 'El enlace no es válido o ha caducado. Pide uno nuevo al administrador.';

/** Fallo de red (sin respuesta del servidor), no un rechazo de credenciales. */
function isNetworkError(e: unknown): boolean {
  if (isAuthRetryableFetchError(e) || e instanceof TypeError) return true;
  const err = e as { name?: string; status?: number } | null;
  return err?.name === 'AuthRetryableFetchError' || err?.status === 0;
}

/** El perfil no se encuentra o el usuario está desactivado: hay que cerrar la sesión. */
class InactiveUserError extends Error {}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);
  private readonly push = inject(PushService);

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly permittedLocationIds = signal<Set<string>>(new Set());
  readonly isAdmin = computed(() => this.profile()?.role === 'admin');
  /**
   * Hay sesión guardada pero no se pudieron cargar perfil y permisos (p. ej. sin cobertura).
   * La sesión se conserva; el shell muestra "Reintentar" en lugar de la aplicación.
   */
  readonly loadError = signal(false);

  /** Se resuelve tras leer la sesión inicial y cargar perfil y permisos. */
  readonly ready: Promise<void>;

  constructor() {
    let resolveReady!: () => void;
    this.ready = new Promise<void>((r) => (resolveReady = r));

    // Sin llamadas a Supabase dentro del callback (evita bloqueos del cliente).
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      if (!session) {
        this.profile.set(null);
        this.permittedLocationIds.set(new Set());
        this.loadError.set(false);
      }
    });

    void this.supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (data.session) await this.restore(data.session);
      })
      .catch(() => undefined)
      .finally(resolveReady);
  }

  canOperate(locationId: string): boolean {
    return this.isAdmin() || this.permittedLocationIds().has(locationId);
  }

  async signIn(email: string, password: string): Promise<void> {
    let session: Session | null;
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      session = data.session;
    } catch (e) {
      throw new Error(isNetworkError(e) ? NETWORK_ERROR : 'Correo o contraseña incorrectos.');
    }
    if (!session) throw new Error('Correo o contraseña incorrectos.');
    await this.enter(session);
  }

  /** Canjea el token de un enlace de acceso (invitación o recuperación) y abre sesión. */
  async acceptLink(tokenHash: string): Promise<void> {
    let session: Session | null;
    try {
      const { data, error } = await this.supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });
      if (error) throw error;
      session = data.session;
    } catch (e) {
      throw new Error(isNetworkError(e) ? NETWORK_ERROR : INVALID_LINK);
    }
    if (!session) throw new Error(INVALID_LINK);
    await this.enter(session);
  }

  async setPassword(password: string): Promise<void> {
    let code: string | null;
    try {
      const { error } = await this.supabase.auth.updateUser({ password });
      code = error ? ((error as { code?: string }).code ?? 'unknown') : null;
    } catch {
      code = 'unknown';
    }
    if (code === 'same_password') {
      throw new Error('La nueva contraseña tiene que ser distinta de la actual.');
    }
    if (code) throw new Error('No se ha podido cambiar la contraseña. Inténtalo de nuevo.');
  }

  /** Cambia el nombre visible propio. Los errores de la RPC se propagan (dbErrorMessage). */
  async updateDisplayName(name: string): Promise<void> {
    const { error } = await this.supabase.rpc('update_my_profile', { p_display_name: name });
    if (error) throw error;
    this.profile.update((p) => (p ? { ...p, displayName: name.trim() } : p));
  }

  /** Reintenta cargar perfil y permisos de la sesión guardada (estado loadError). */
  async retry(): Promise<void> {
    const session = this.session();
    if (session) await this.restore(session);
  }

  async signOut(): Promise<void> {
    // Con la sesión aún válida, para que la RPC pueda borrar la suscripción del dispositivo.
    await this.push.forgetDevice();
    try {
      await this.supabase.auth.signOut();
    } catch {
      // el estado local se limpia igualmente
    }
    this.clear();
  }

  private clear(): void {
    this.session.set(null);
    this.profile.set(null);
    this.permittedLocationIds.set(new Set());
    this.loadError.set(false);
  }

  /** Sesión recién abierta (login o enlace): si no se puede cargar el perfil, se cierra. */
  private async enter(session: Session): Promise<void> {
    try {
      await this.establish(session);
    } catch (e) {
      await this.signOut();
      throw new Error(
        e instanceof InactiveUserError
          ? 'Tu usuario está desactivado. Habla con el administrador.'
          : 'Ha ocurrido un error inesperado. Inténtalo de nuevo.',
      );
    }
  }

  /**
   * Sesión restaurada: solo se cierra si el perfil no existe o está inactivo. Ante un fallo
   * de carga (red) se conserva la sesión y se marca loadError para poder reintentar.
   */
  private async restore(session: Session): Promise<void> {
    try {
      await this.establish(session);
    } catch (e) {
      if (e instanceof InactiveUserError) {
        await this.signOut();
      } else {
        this.session.set(session);
        this.loadError.set(true);
      }
    }
  }

  /** Carga perfil y permisos. Lanza InactiveUserError o el error de carga. */
  private async establish(session: Session): Promise<void> {
    const loaded = await this.loadUserData(session.user.id);
    if (!loaded.profile || !loaded.profile.active) {
      throw new InactiveUserError();
    }
    this.profile.set(loaded.profile);
    this.permittedLocationIds.set(loaded.permitted);
    this.session.set(session);
    this.loadError.set(false);
  }

  private async loadUserData(
    userId: string,
  ): Promise<{ profile: Profile | null; permitted: Set<string> }> {
    const [profileRes, permsRes] = await Promise.all([
      this.supabase
        .from('profiles')
        .select('id, display_name, role, active')
        .eq('id', userId)
        .maybeSingle(),
      this.supabase.from('location_permissions').select('location_id').eq('user_id', userId),
    ]);
    if (profileRes.error || permsRes.error) {
      throw new Error('load_failed');
    }
    const p = profileRes.data;
    return {
      profile: p ? { id: p.id, displayName: p.display_name, role: p.role, active: p.active } : null,
      permitted: new Set((permsRes.data ?? []).map((r: { location_id: string }) => r.location_id)),
    };
  }
}

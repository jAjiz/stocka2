import { computed, inject, Injectable, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../data/models';
import { SUPABASE } from './supabase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);

  readonly session = signal<Session | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly permittedLocationIds = signal<Set<string>>(new Set());
  readonly isAdmin = computed(() => this.profile()?.role === 'admin');

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
      }
    });

    void this.supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (data.session) await this.establish(data.session);
      })
      .catch(() => undefined)
      .finally(resolveReady);
  }

  canOperate(locationId: string): boolean {
    return this.isAdmin() || this.permittedLocationIds().has(locationId);
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error('Correo o contraseña incorrectos.');
    }
    await this.establish(data.session);
  }

  async signOut(): Promise<void> {
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
  }

  /** Carga perfil y permisos; si falla o el usuario está inactivo, cierra la sesión y lanza. */
  private async establish(session: Session): Promise<void> {
    const userId = session.user.id;
    let loaded: { profile: Profile | null; permitted: Set<string> };
    try {
      loaded = await this.loadUserData(userId);
    } catch {
      await this.signOut();
      throw new Error('Ha ocurrido un error inesperado. Inténtalo de nuevo.');
    }
    if (!loaded.profile || !loaded.profile.active) {
      await this.signOut();
      throw new Error('Tu usuario está desactivado. Habla con el administrador.');
    }
    this.profile.set(loaded.profile);
    this.permittedLocationIds.set(loaded.permitted);
    this.session.set(session);
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

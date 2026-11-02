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
        this.session.set(data.session);
        if (data.session) await this.loadUserData(data.session.user.id);
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
    await this.loadUserData(data.session.user.id);
    const profile = this.profile();
    if (!profile || !profile.active) {
      await this.signOut();
      throw new Error('Tu usuario está desactivado. Habla con el administrador.');
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.session.set(null);
    this.profile.set(null);
    this.permittedLocationIds.set(new Set());
  }

  private async loadUserData(userId: string): Promise<void> {
    const [profileRes, permsRes] = await Promise.all([
      this.supabase
        .from('profiles')
        .select('id, display_name, role, active')
        .eq('id', userId)
        .maybeSingle(),
      this.supabase.from('location_permissions').select('location_id').eq('user_id', userId),
    ]);
    const p = profileRes.data;
    this.profile.set(
      p ? { id: p.id, displayName: p.display_name, role: p.role, active: p.active } : null,
    );
    this.permittedLocationIds.set(
      new Set((permsRes.data ?? []).map((r: { location_id: string }) => r.location_id)),
    );
  }
}

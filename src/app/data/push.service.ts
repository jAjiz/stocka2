import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { SUPABASE } from '../core/supabase';

export type PushStatus = 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on' | 'busy';

/** Safari de iOS/iPadOS: el push solo funciona con la aplicación instalada (modo standalone). */
function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  );
}

function permissionDenied(): boolean {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}

/** Suscripción de este dispositivo a Web Push y su registro en el servidor. */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush);
  private readonly supabase = inject(SUPABASE);

  private readonly subscription = toSignal(this.swPush.subscription, { initialValue: null });
  private readonly busy = signal(false);
  private readonly denied = signal(permissionDenied());

  readonly status = computed<PushStatus>(() => {
    if (isIos() && !isStandalone()) return 'ios-install';
    if (!this.swPush.isEnabled) return 'unsupported';
    if (this.busy()) return 'busy';
    if (this.denied()) return 'denied';
    return this.subscription() ? 'on' : 'off';
  });

  /** Pide permiso, suscribe el dispositivo y lo registra. Si se bloquea el permiso, no lanza. */
  async enable(): Promise<void> {
    this.busy.set(true);
    try {
      let sub: PushSubscription;
      try {
        sub = await this.swPush.requestSubscription({
          serverPublicKey: environment.vapidPublicKey,
        });
      } catch (e) {
        if (permissionDenied()) {
          this.denied.set(true);
          return;
        }
        throw e;
      }
      const keys = sub.toJSON().keys ?? {};
      const { error } = await this.supabase.rpc('save_push_subscription', {
        p_endpoint: sub.endpoint,
        p_p256dh: keys['p256dh'] ?? '',
        p_auth: keys['auth'] ?? '',
        p_user_agent: navigator.userAgent,
      });
      if (error) {
        // Sin registro en el servidor la suscripción no sirve: se deshace para no dejarla huérfana.
        await this.swPush.unsubscribe().catch(() => undefined);
        throw error;
      }
    } finally {
      this.busy.set(false);
    }
  }

  async disable(): Promise<void> {
    const sub = this.subscription();
    if (!sub) return;
    this.busy.set(true);
    try {
      const { error } = await this.supabase.rpc('delete_push_subscription', {
        p_endpoint: sub.endpoint,
      });
      if (error) throw error;
      await this.swPush.unsubscribe();
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Como disable, pero nunca lanza y siempre intenta soltar la suscripción del navegador aunque
   * falle el servidor: se usa al cerrar sesión, y en un móvil compartido el usuario anterior no
   * debe seguir recibiendo avisos.
   */
  async forgetDevice(): Promise<void> {
    let sub = this.subscription();
    if (!sub && this.swPush.isEnabled) {
      // La señal aún puede estar vacía si se cierra sesión nada más cargar.
      sub = await firstValueFrom(this.swPush.subscription.pipe(timeout(2000)), {
        defaultValue: null,
      }).catch(() => null);
    }
    if (!sub) return;
    try {
      await this.supabase
        .rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
        .then(() => undefined);
    } catch {
      // se ignora: lo importante es soltar la suscripción local
    }
    try {
      await this.swPush.unsubscribe();
    } catch {
      // cerrar sesión no debe fallar por el push
    }
  }
}

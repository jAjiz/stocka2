import { computed, inject, Injectable, signal } from '@angular/core';
import { AlertsService } from './alerts.service';
import { GlobalAlert } from './models';

/**
 * Avisos globales compartidos entre la pantalla de stock y la navegación. Se refrescan al
 * arrancar el shell, al entrar en Stock y tras cada operación del usuario.
 */
@Injectable({ providedIn: 'root' })
export class GlobalAlertsStore {
  private readonly service = inject(AlertsService);
  private readonly list = signal<GlobalAlert[]>([]);
  /** Cambia en cada clear(): una respuesta de antes del cambio de usuario se descarta. */
  private generation = 0;

  readonly alerts = this.list.asReadonly();
  readonly byItem = computed(() => new Map(this.list().map((a) => [a.itemId, a])));
  readonly count = computed(() => this.list().length);
  readonly hasCritical = computed(() => this.list().some((a) => a.level === 'critical'));

  /** Nunca lanza: los avisos son accesorios y un fallo deja la lista vacía. */
  async refresh(): Promise<void> {
    const generation = this.generation;
    let alerts: GlobalAlert[] = [];
    try {
      alerts = await this.service.global();
    } catch {
      // se queda vacía
    }
    if (generation === this.generation) this.list.set(alerts);
  }

  /** Al cerrar sesión: el siguiente usuario no ve, ni un momento, el número del anterior. */
  clear(): void {
    this.generation++;
    this.list.set([]);
  }
}

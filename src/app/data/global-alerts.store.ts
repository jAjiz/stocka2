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

  readonly alerts = this.list.asReadonly();
  readonly byItem = computed(() => new Map(this.list().map((a) => [a.itemId, a])));
  readonly count = computed(() => this.list().length);
  readonly hasCritical = computed(() => this.list().some((a) => a.level === 'critical'));

  /** Nunca lanza: los avisos son accesorios y un fallo deja la lista vacía. */
  async refresh(): Promise<void> {
    try {
      this.list.set(await this.service.global());
    } catch {
      this.list.set([]);
    }
  }
}

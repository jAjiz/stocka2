import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { StockAlert } from '../data/models';

/** Mensajes contraíbles con los avisos de stock de una localización: graves primero. */
@Component({
  selector: 'app-alert-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  styles: `
    summary {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      font: var(--mat-sys-title-small);
      cursor: pointer;
      list-style: none;
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .count {
      padding: 1px 8px;
      border-radius: 99px;
      background: var(--app-warning);
      color: #fff;
      font: var(--mat-sys-label-small);
    }
    .count.critical {
      background: var(--mat-sys-error);
    }
    .chevron {
      margin-left: auto;
      color: var(--mat-sys-on-surface-variant);
      transition: transform 0.15s;
    }
    details[open] .chevron {
      transform: rotate(180deg);
    }
    ul {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .alert {
      display: flex;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--app-warning-border);
      border-radius: var(--app-radius);
      background: var(--app-warning-container);
      color: var(--mat-sys-on-primary-container);
    }
    .alert mat-icon {
      flex: none;
      width: 20px;
      height: 20px;
      color: var(--app-warning);
      font-size: 20px;
    }
    .alert.critical {
      border-color: var(--app-error-border);
      background: var(--app-error-container);
      color: var(--app-on-error-container);
    }
    .alert.critical mat-icon {
      color: var(--mat-sys-error);
    }
    .text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .message {
      font: var(--mat-sys-title-small);
    }
    .detail {
      font: var(--mat-sys-body-small);
    }
  `,
  template: `
    @if (rows().length > 0) {
      <details open>
        <summary>
          Avisos
          <span class="count" [class.critical]="hasCritical()">{{ rows().length }}</span>
          <mat-icon class="chevron">expand_more</mat-icon>
        </summary>
        <ul>
          @for (r of rows(); track r.key) {
            <li class="alert" [class.critical]="r.critical">
              <mat-icon aria-hidden="true">{{ r.critical ? 'report' : 'warning' }}</mat-icon>
              <div class="text">
                <div class="message">{{ r.item }}: {{ r.remaining }}</div>
                <div class="detail">
                  Aviso {{ r.critical ? 'grave' : 'leve' }} · salta con {{ r.alert.threshold }} o
                  menos
                </div>
              </div>
            </li>
          }
        </ul>
      </details>
    }
  `,
})
export class AlertListComponent {
  readonly alerts = input.required<StockAlert[]>();
  readonly itemNames = input.required<Map<string, string>>();

  protected readonly hasCritical = computed(() =>
    this.alerts().some((a) => a.level === 'critical'),
  );

  protected readonly rows = computed(() => {
    const rows = this.alerts().map((alert) => ({
      alert,
      key: `${alert.itemId}|${alert.level}`,
      item: this.itemNames().get(alert.itemId) ?? 'Artículo desconocido',
      critical: alert.level === 'critical',
      remaining: alert.quantity === 1 ? 'queda 1' : `quedan ${alert.quantity}`,
    }));
    return rows.sort(
      (a, b) => Number(b.critical) - Number(a.critical) || a.item.localeCompare(b.item, 'es'),
    );
  });
}

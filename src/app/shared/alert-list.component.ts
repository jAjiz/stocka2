import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StockAlert } from '../data/models';

/** Lista de avisos de stock: graves primero, luego por localización y artículo. */
@Component({
  selector: 'app-alert-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  styles: `
    ul {
      list-style: none;
      margin: 0 0 16px;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .critical mat-icon {
      color: var(--mat-sys-error);
    }
    .name {
      font: var(--mat-sys-title-small);
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
  template: `
    @if (rows().length > 0) {
      <ul>
        @for (r of rows(); track r.key) {
          <li [class.critical]="r.alert.level === 'critical'">
            <mat-icon>{{ r.alert.level === 'critical' ? 'error' : 'warning' }}</mat-icon>
            <div>
              <div class="name">
                {{ r.item }}
                @if (showLocation()) {
                  ·
                  <a [routerLink]="['/localizaciones', r.alert.locationId]">{{ r.location }}</a>
                }
              </div>
              <div class="meta">
                Quedan {{ r.alert.quantity }} · aviso {{ r.alert.level === 'critical' ? 'grave ' : ''
                }}si ≤ {{ r.alert.threshold }}
              </div>
            </div>
          </li>
        }
      </ul>
    }
  `,
})
export class AlertListComponent {
  readonly alerts = input.required<StockAlert[]>();
  readonly itemNames = input.required<Map<string, string>>();
  readonly locationNames = input.required<Map<string, string>>();
  readonly showLocation = input(true);

  protected readonly rows = computed(() => {
    const rows = this.alerts().map((alert) => ({
      alert,
      key: `${alert.itemId}|${alert.locationId}|${alert.level}`,
      item: this.itemNames().get(alert.itemId) ?? 'Artículo desconocido',
      location: this.locationNames().get(alert.locationId) ?? 'Localización desconocida',
    }));
    return rows.sort(
      (a, b) =>
        Number(b.alert.level === 'critical') - Number(a.alert.level === 'critical') ||
        a.location.localeCompare(b.location, 'es') ||
        a.item.localeCompare(b.item, 'es'),
    );
  });
}

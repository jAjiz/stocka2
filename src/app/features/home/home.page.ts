import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { dbErrorMessage } from '../../core/db-errors';
import { AlertsService } from '../../data/alerts.service';
import { CatalogService } from '../../data/catalog.service';
import { Location, StockAlert } from '../../data/models';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  styles: `
    .grid {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 480px;
    }
    .card {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 64px;
      padding: 0 16px;
      background: var(--mat-sys-surface);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--app-radius);
      color: inherit;
      font: var(--mat-sys-title-medium);
      text-decoration: none;
    }
    .card:hover {
      border-color: var(--mat-sys-outline);
    }
    .symbol {
      flex: none;
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: var(--app-radius);
      background: var(--app-bar);
      color: var(--app-accent);
    }
    .name {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .alert-count {
      flex: none;
      margin-left: auto;
      padding: 2px 10px;
      border-radius: 99px;
      background: var(--app-warning-container);
      color: var(--app-warning);
      font: var(--mat-sys-label-medium);
    }
    .alert-count.critical {
      background: var(--app-error-container);
      color: var(--mat-sys-error);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (visible().length > 0) {
      <div class="grid">
        @for (l of visible(); track l.id) {
          <a class="card" [routerLink]="['/localizaciones', l.id]">
            <span class="symbol">
              <mat-icon>{{ l.kind === 'vehicle' ? 'local_shipping' : 'warehouse' }}</mat-icon>
            </span>
            <span class="name">{{ l.name }}</span>
            @if (counts().get(l.id); as c) {
              <span class="alert-count" [class.critical]="c.critical">
                {{ c.total }} {{ c.total === 1 ? 'aviso' : 'avisos' }}
              </span>
            }
          </a>
        }
      </div>
    } @else if (loaded() && !error()) {
      <p>No tienes localizaciones asignadas.</p>
    }
  `,
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly alertsService = inject(AlertsService);

  private readonly locations = signal<Location[]>([]);
  private readonly alerts = signal<StockAlert[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly visible = computed(() =>
    this.locations().filter((l) => this.auth.canOperate(l.id)),
  );

  protected readonly counts = computed(() => {
    const out = new Map<string, { total: number; critical: boolean }>();
    for (const a of this.alerts()) {
      const c = out.get(a.locationId) ?? { total: 0, critical: false };
      c.total++;
      c.critical ||= a.level === 'critical';
      out.set(a.locationId, c);
    }
    return out;
  });

  constructor() {
    this.catalog
      .locations()
      .then((l) => {
        this.locations.set(l);
        this.loaded.set(true);
      })
      .catch((e) => this.error.set(dbErrorMessage(e)));
    // Los avisos son accesorios: si fallan no impiden ver las localizaciones.
    this.alertsService
      .active()
      .then((alerts) => this.alerts.set(alerts))
      .catch((e) => this.error.set(dbErrorMessage(e)));
  }
}

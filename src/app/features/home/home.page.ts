import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { dbErrorMessage } from '../../core/db-errors';
import { AlertsService } from '../../data/alerts.service';
import { CatalogService } from '../../data/catalog.service';
import { Item, Location, StockAlert } from '../../data/models';
import { AlertListComponent } from '../../shared/alert-list.component';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatIconModule, AlertListComponent],
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 16px;
    }
    a {
      text-decoration: none;
      color: inherit;
    }
    mat-card {
      min-height: 96px;
    }
    .card-content {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      font: var(--mat-sys-title-medium);
    }
    h2 {
      font: var(--mat-sys-title-medium);
    }
    .alert-count {
      margin-left: auto;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h1>Inicio</h1>
    @if (visibleAlerts().length > 0) {
      <section class="alerts" aria-label="Avisos">
        <h2>Avisos activos</h2>
        <app-alert-list
          [alerts]="visibleAlerts()"
          [itemNames]="itemNames()"
          [locationNames]="locationNames()"
        />
      </section>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="grid">
      @for (l of visible(); track l.id) {
        <a [routerLink]="['/localizaciones', l.id]">
          <mat-card appearance="outlined">
            <div class="card-content">
              <mat-icon>{{ l.kind === 'vehicle' ? 'local_shipping' : 'warehouse' }}</mat-icon>
              <span>{{ l.name }}</span>
              @if (counts().get(l.id); as c) {
                <span class="alert-count" [class.error]="c.critical">
                  {{ c.total }} {{ c.total === 1 ? 'aviso' : 'avisos' }}
                </span>
              }
            </div>
          </mat-card>
        </a>
      }
    </div>
  `,
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly alertsService = inject(AlertsService);

  private readonly locations = signal<Location[]>([]);
  protected readonly error = signal('');
  protected readonly visible = computed(() =>
    this.locations().filter((l) => this.auth.canOperate(l.id)),
  );

  private readonly alerts = signal<StockAlert[]>([]);
  private readonly items = signal<Item[]>([]);

  protected readonly itemNames = computed(() => new Map(this.items().map((i) => [i.id, i.name])));
  protected readonly locationNames = computed(
    () => new Map(this.locations().map((l) => [l.id, l.name])),
  );
  /** Solo los avisos de localizaciones visibles para el usuario. */
  protected readonly visibleAlerts = computed(() => {
    const ids = new Set(this.visible().map((l) => l.id));
    return this.alerts().filter((a) => ids.has(a.locationId));
  });
  protected readonly counts = computed(() => {
    const out = new Map<string, { total: number; critical: boolean }>();
    for (const a of this.visibleAlerts()) {
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
      .then((l) => this.locations.set(l))
      .catch((e) => this.error.set(dbErrorMessage(e)));
    // Los avisos son accesorios: si fallan no impiden ver las localizaciones.
    Promise.all([this.alertsService.active(), this.catalog.items()])
      .then(([alerts, items]) => {
        this.alerts.set(alerts);
        this.items.set(items);
      })
      .catch((e) => this.error.set(dbErrorMessage(e)));
  }
}

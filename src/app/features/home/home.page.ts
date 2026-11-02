import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { dbErrorMessage } from '../../core/db-errors';
import { CatalogService } from '../../data/catalog.service';
import { Location } from '../../data/models';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatCardModule, MatIconModule],
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
    .alerts:empty {
      display: none;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h1>Inicio</h1>
    <section class="alerts" aria-label="Avisos"></section>
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

  private readonly locations = signal<Location[]>([]);
  protected readonly error = signal('');
  protected readonly visible = computed(() =>
    this.locations().filter((l) => this.auth.canOperate(l.id)),
  );

  constructor() {
    this.catalog
      .locations()
      .then((l) => this.locations.set(l))
      .catch((e) => this.error.set(dbErrorMessage(e)));
  }
}

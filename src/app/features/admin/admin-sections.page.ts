import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ADMIN_SECTIONS } from './admin-sections';

/** Pantalla de selección de Administración. */
@Component({
  selector: 'app-admin-sections-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  styles: `
    nav {
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
  `,
  template: `
    <nav aria-label="Secciones de administración">
      @for (s of sections; track s.path) {
        <a class="card" [routerLink]="['/admin', s.path]">
          <span class="symbol"
            ><mat-icon>{{ s.icon }}</mat-icon></span
          >
          <span class="name">{{ s.label }}</span>
        </a>
      }
    </nav>
  `,
})
export class AdminSectionsPage {
  protected readonly sections = ADMIN_SECTIONS;
}

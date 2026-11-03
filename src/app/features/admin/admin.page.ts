import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';

const TABS = [
  { path: 'usuarios', label: 'Usuarios' },
  { path: 'localizaciones', label: 'Localizaciones' },
  { path: 'articulos', label: 'Artículos' },
  { path: 'tipos', label: 'Tipos' },
  { path: 'avisos', label: 'Avisos' },
];

@Component({
  selector: 'app-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatTabsModule],
  styles: `
    nav {
      margin-bottom: 16px;
    }
  `,
  template: `
    <h1>Administración</h1>
    <nav mat-tab-nav-bar [tabPanel]="panel">
      @for (t of tabs; track t.path) {
        <a
          mat-tab-link
          [routerLink]="t.path"
          routerLinkActive
          #rla="routerLinkActive"
          [active]="rla.isActive"
          >{{ t.label }}</a
        >
      }
    </nav>
    <mat-tab-nav-panel #panel><router-outlet /></mat-tab-nav-panel>
  `,
})
export class AdminPage {
  protected readonly tabs = TABS;
}

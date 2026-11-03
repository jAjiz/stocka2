import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
  ],
  styles: `
    :host {
      display: block;
      height: 100%;
    }
    .layout-mobile {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .layout-mobile main {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }
    .bottom-nav {
      display: flex;
      border-top: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
    }
    .bottom-nav a {
      flex: 1;
      min-width: 0;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 8px 0;
      min-height: 48px;
      text-decoration: none;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .bottom-nav a.active {
      color: var(--mat-sys-primary);
    }
    .spacer {
      flex: 1;
    }
    mat-sidenav-container {
      height: 100%;
    }
    mat-sidenav {
      width: 240px;
    }
    .side-content {
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    main.desktop {
      padding: 24px;
    }
    .load-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      height: 100%;
      padding: 16px;
      box-sizing: border-box;
      text-align: center;
    }
  `,
  template: `
    @if (auth.loadError()) {
      <div class="load-error">
        <p role="alert">No se ha podido conectar.</p>
        <button mat-flat-button type="button" [disabled]="retrying()" (click)="retry()">
          Reintentar
        </button>
        <button mat-button type="button" (click)="signOut()">Cerrar sesión</button>
      </div>
    } @else if (isHandset()) {
      <div class="layout-mobile">
        <mat-toolbar color="primary">
          <span>Stocka2</span>
          <span class="spacer"></span>
          <button mat-icon-button type="button" aria-label="Cerrar sesión" (click)="signOut()">
            <mat-icon>logout</mat-icon>
          </button>
        </mat-toolbar>
        <main><router-outlet /></main>
        <nav class="bottom-nav" aria-label="Navegación principal">
          <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            <mat-icon>home</mat-icon>Inicio
          </a>
          <a routerLink="/stock" routerLinkActive="active">
            <mat-icon>inventory_2</mat-icon>Stock
          </a>
          <a routerLink="/historial" routerLinkActive="active">
            <mat-icon>history</mat-icon>Historial
          </a>
          <a routerLink="/perfil" routerLinkActive="active"> <mat-icon>person</mat-icon>Perfil </a>
          @if (auth.isAdmin()) {
            <a routerLink="/admin" routerLinkActive="active">
              <mat-icon>admin_panel_settings</mat-icon>Administración
            </a>
          }
        </nav>
      </div>
    } @else {
      <mat-sidenav-container>
        <mat-sidenav mode="side" opened>
          <div class="side-content">
            <mat-toolbar>Stocka2</mat-toolbar>
            <mat-nav-list>
              <a
                mat-list-item
                routerLink="/"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
              >
                <mat-icon matListItemIcon>home</mat-icon>
                <span matListItemTitle>Inicio</span>
              </a>
              <a mat-list-item routerLink="/stock" routerLinkActive="active">
                <mat-icon matListItemIcon>inventory_2</mat-icon>
                <span matListItemTitle>Stock</span>
              </a>
              <a mat-list-item routerLink="/historial" routerLinkActive="active">
                <mat-icon matListItemIcon>history</mat-icon>
                <span matListItemTitle>Historial</span>
              </a>
              @if (auth.isAdmin()) {
                <a mat-list-item routerLink="/admin" routerLinkActive="active">
                  <mat-icon matListItemIcon>admin_panel_settings</mat-icon>
                  <span matListItemTitle>Administración</span>
                </a>
              }
            </mat-nav-list>
            <span class="spacer"></span>
            <mat-nav-list>
              <a mat-list-item routerLink="/perfil" routerLinkActive="active">
                <mat-icon matListItemIcon>person</mat-icon>
                <span matListItemTitle>{{ auth.profile()?.displayName }}</span>
                <span matListItemLine>Perfil</span>
              </a>
            </mat-nav-list>
            <button mat-button type="button" (click)="signOut()">Cerrar sesión</button>
          </div>
        </mat-sidenav>
        <mat-sidenav-content>
          <main class="desktop"><router-outlet /></main>
        </mat-sidenav-content>
      </mat-sidenav-container>
    }
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly retrying = signal(false);

  constructor() {
    // Si la sesión desaparece (cierre de sesión, token caducado, cierre en otra pestaña),
    // se vuelve al login.
    effect(() => {
      if (!this.auth.session()) void this.router.navigateByUrl('/login');
    });
  }

  protected async retry(): Promise<void> {
    this.retrying.set(true);
    try {
      await this.auth.retry();
    } finally {
      this.retrying.set(false);
    }
  }

  /** La navegación a /login la hace el effect al quedar la sesión en null. */
  protected async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}

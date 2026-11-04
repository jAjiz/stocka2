import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { AuthService } from '../core/auth.service';
import { CurrentLocationService } from '../core/current-location.service';

interface PageHeader {
  title: string;
  icon: string;
  /** Pantalla a la que vuelve la flecha de la franja. Sin ella no hay flecha. */
  backTo?: string;
}

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
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
      background: var(--mat-sys-surface);
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
    .bottom-nav a.active,
    .bottom-nav a.in-location {
      color: var(--mat-sys-primary);
      font-weight: 700;
    }
    .page-bar {
      position: sticky;
      top: 0;
      z-index: 2;
      flex: none;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
      padding: 0 16px;
      background: var(--app-bar);
      border-bottom: 3px solid var(--app-accent);
      color: var(--app-on-bar);
    }
    .page-bar h1 {
      margin: 0;
      color: inherit;
      font: var(--mat-sys-title-large);
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .page-back {
      flex: none;
      margin-left: -8px;
      --mat-icon-button-icon-color: var(--app-on-bar);
      --mat-icon-button-state-layer-color: var(--app-on-bar);
    }
    .page-symbol {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: var(--app-radius);
      background: var(--app-accent);
      color: var(--app-bar);
    }
    .spacer {
      flex: 1;
    }
    mat-sidenav-container {
      height: 100%;
    }
    mat-sidenav {
      width: 240px;
      border-radius: 0;
      --mat-sidenav-container-background-color: var(--app-bar);
      --mat-sidenav-container-text-color: var(--app-on-bar);
      --mat-list-list-item-label-text-color: var(--app-on-bar);
      --mat-list-list-item-hover-label-text-color: var(--app-on-bar);
      --mat-list-list-item-focus-label-text-color: var(--app-on-bar);
      --mat-list-list-item-leading-icon-color: var(--app-on-bar-muted);
      --mat-list-list-item-hover-leading-icon-color: var(--app-on-bar);
      --mat-list-list-item-supporting-text-color: var(--app-on-bar-muted);
      --mat-list-list-item-hover-state-layer-color: #fff;
      --mat-list-list-item-focus-state-layer-color: #fff;
      --mat-button-text-label-text-color: var(--app-on-bar-muted);
    }
    .side-content {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .brand {
      padding: 20px 16px 12px;
      color: var(--app-accent);
      font: var(--mat-sys-title-large);
      font-weight: 700;
    }
    mat-nav-list a {
      border-radius: 0;
      --mat-list-active-indicator-shape: 0;
    }
    mat-nav-list a.active,
    mat-nav-list a.in-location {
      background: #ffffff1a;
      box-shadow: inset 3px 0 var(--app-accent);
    }
    .side-signout {
      margin: 0 8px 8px;
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
        <ng-container [ngTemplateOutlet]="locationBar" />
        <main><router-outlet /></main>
        <nav class="bottom-nav" aria-label="Navegación principal">
          <a
            routerLink="/"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
            [class.in-location]="current.location()"
          >
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
              <mat-icon>admin_panel_settings</mat-icon>Admin
            </a>
          }
        </nav>
      </div>
    } @else {
      <mat-sidenav-container>
        <mat-sidenav mode="side" opened>
          <div class="side-content">
            <div class="brand">Stocka2</div>
            <mat-nav-list>
              <a
                mat-list-item
                routerLink="/"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
                [class.in-location]="current.location()"
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
            <button class="side-signout" mat-button type="button" (click)="signOut()">
              Cerrar sesión
            </button>
          </div>
        </mat-sidenav>
        <mat-sidenav-content>
          <ng-container [ngTemplateOutlet]="locationBar" />
          <main class="desktop"><router-outlet /></main>
        </mat-sidenav-content>
      </mat-sidenav-container>
    }

    <ng-template #locationBar>
      @if (header(); as h) {
        <header class="page-bar">
          @if (h.backTo; as backTo) {
            <a class="page-back" mat-icon-button [routerLink]="backTo" aria-label="Volver">
              <mat-icon>arrow_back</mat-icon>
            </a>
          }
          <span class="page-symbol">
            <mat-icon>{{ h.icon }}</mat-icon>
          </span>
          <h1>{{ h.title }}</h1>
        </header>
      }
    </ng-template>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);
  protected readonly current = inject(CurrentLocationService);
  private readonly router = inject(Router);

  private readonly routeHeader = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.readRouteHeader()),
    ),
    { initialValue: this.readRouteHeader() },
  );

  /** Título de la franja superior: la localización abierta o, si no, el de la pantalla. */
  protected readonly header = computed<PageHeader | null>(() => {
    const location = this.current.location();
    if (!location) return this.routeHeader();
    return {
      title: location.name,
      icon: location.kind === 'vehicle' ? 'local_shipping' : 'warehouse',
    };
  });

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

  /** Manda el título de la ruta más interior que tenga uno. */
  private readRouteHeader(): PageHeader | null {
    let header: PageHeader | null = null;
    let route: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    while (route) {
      const { title, icon, backTo } = route.data;
      if (title) header = { title, icon, backTo };
      route = route.firstChild;
    }
    return header;
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

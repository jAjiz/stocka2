import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, PendingTasks, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { adminErrorMessage } from '../../core/db-errors';
import { AuthService } from '../../core/auth.service';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { AccessLink, AdminUser, Location } from '../../data/models';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/confirm-dialog.component';
import { dialogSize } from '../../shared/dialog-size';
import { AccessLinkDialogComponent, AccessLinkDialogData } from './access-link-dialog.component';
import { UserDialogComponent, UserDialogData, UserDialogResult } from './user-dialog.component';

export function userStatus(u: AdminUser): string {
  if (!u.active) return 'Desactivado';
  return u.hasPassword ? 'Activo' : 'Pendiente de acceso';
}

@Component({
  selector: 'app-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  styles: `
    .toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .list {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    }
    .meta {
      margin: 4px 0;
      color: var(--mat-sys-on-surface-variant);
    }
    .status {
      font: var(--mat-sys-label-large);
    }
    .inactive {
      opacity: 0.7;
    }
    .error {
      color: var(--mat-sys-error);
    }
    mat-card-actions {
      flex-wrap: wrap;
    }
  `,
  template: `
    <div class="toolbar">
      <button mat-flat-button type="button" (click)="invite()">
        <mat-icon>person_add</mat-icon>Invitar usuario
      </button>
    </div>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="list">
      @for (u of users(); track u.id) {
        <mat-card appearance="outlined" data-user [class.inactive]="!u.active">
          <mat-card-header>
            <mat-card-title>{{ u.displayName }}</mat-card-title>
            <mat-card-subtitle>{{ u.email }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p class="status">{{ status(u) }}</p>
            <p class="meta">{{ u.role === 'admin' ? 'Administrador' : 'Usuario' }}</p>
            <p class="meta">Localizaciones: {{ locationsLabel(u) }}</p>
          </mat-card-content>
          <mat-card-actions>
            <button mat-button type="button" (click)="edit(u)">Editar</button>
            @if (u.active) {
              <button mat-button type="button" (click)="link(u)">Generar enlace de acceso</button>
              @if (!isSelf(u)) {
                <button mat-button type="button" (click)="setActive(u, false)">Desactivar</button>
              }
            } @else {
              <button mat-button type="button" (click)="setActive(u, true)">Activar</button>
            }
          </mat-card-actions>
        </mat-card>
      }
    </div>
  `,
})
export class UsersPage {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly dialog = inject(MatDialog);
  private readonly pending = inject(PendingTasks);

  private readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly users = signal<AdminUser[]>([]);
  protected readonly locations = signal<Location[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly status = userStatus;

  constructor() {
    void this.run(() => this.load());
  }

  /** Uno mismo no se desactiva ni se quita el rol: perdería el acceso a esta página. */
  protected isSelf(u: AdminUser): boolean {
    return u.id === this.auth.profile()?.id;
  }

  protected locationsLabel(u: AdminUser): string {
    if (u.role === 'admin') return 'Todas';
    const names = this.locations()
      .filter((l) => u.locationIds.includes(l.id))
      .map((l) => l.name);
    return names.length ? names.join(', ') : 'Ninguna';
  }

  protected async invite(): Promise<void> {
    const result = await this.openUserDialog(null);
    if (!result) return;
    if (result !== true) this.showLink(result.name, result.link);
    await this.run(() => this.load());
  }

  protected async edit(u: AdminUser): Promise<void> {
    if (await this.openUserDialog(u)) await this.run(() => this.load());
  }

  protected async link(u: AdminUser): Promise<void> {
    await this.run(async () => this.showLink(u.displayName, await this.admin.regenerateLink(u.id)));
  }

  protected async setActive(u: AdminUser, active: boolean): Promise<void> {
    if (!active) {
      const ok = await firstValueFrom(
        this.dialog
          .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
            data: {
              message: `¿Desactivar a ${u.displayName}? No podrá entrar, pero seguirá apareciendo en el historial.`,
              confirmLabel: 'Desactivar',
            },
          })
          .afterClosed(),
      );
      if (!ok) return;
    }
    await this.run(async () => {
      await this.admin.setUserActive(u.id, active);
      await this.load();
    });
  }

  private openUserDialog(user: AdminUser | null): Promise<UserDialogResult | undefined> {
    return firstValueFrom(
      this.dialog
        .open<UserDialogComponent, UserDialogData, UserDialogResult>(UserDialogComponent, {
          data: { user, locations: this.locations(), isSelf: !!user && this.isSelf(user) },
          disableClose: true,
          ...dialogSize(this.isHandset()),
        })
        .afterClosed(),
    );
  }

  private showLink(name: string, link: AccessLink): void {
    this.dialog.open<AccessLinkDialogComponent, AccessLinkDialogData>(AccessLinkDialogComponent, {
      data: { name, link },
      ...dialogSize(this.isHandset()),
    });
  }

  private async load(): Promise<void> {
    const [users, locations] = await Promise.all([this.admin.users(), this.catalog.allLocations()]);
    this.users.set(users);
    this.locations.set(locations);
  }

  /** Ejecuta una acción mostrando su error. PendingTasks: la app (y los tests) esperan a que acabe. */
  private async run(fn: () => Promise<void>): Promise<void> {
    this.error.set(null);
    const done = this.pending.add();
    try {
      await fn();
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      done();
    }
  }
}

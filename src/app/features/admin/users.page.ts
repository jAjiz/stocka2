import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject, PendingTasks, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
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
  imports: [MatButtonModule, MatIconModule],
  styles: `
    .toolbar {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 16px;
    }
    .name {
      font: var(--mat-sys-title-small);
    }
    .email {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 4px;
    }
    .inactive {
      opacity: 0.7;
    }
    .error {
      color: var(--mat-sys-error);
    }
    @media (max-width: 599px) {
      thead {
        display: none;
      }
      tr,
      td {
        display: block;
      }
      tr {
        padding: 8px 0;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      tr:first-child {
        border-top: 0;
      }
      td {
        height: auto;
        padding: 2px 12px;
        border-top: 0;
      }
      .actions {
        justify-content: flex-start;
      }
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
    <table class="app-table">
      <thead>
        <tr>
          <th scope="col">Usuario</th>
          <th scope="col">Rol</th>
          <th scope="col">Estado</th>
          <th scope="col" aria-label="Acciones"></th>
        </tr>
      </thead>
      <tbody>
        @for (u of users(); track u.id) {
          <tr data-user [class.inactive]="!u.active">
            <td>
              <div class="name">{{ u.displayName }}</div>
              <div class="email">{{ u.email }}</div>
            </td>
            <td>{{ u.role === 'admin' ? 'Administrador' : 'Usuario' }}</td>
            <td>{{ status(u) }}</td>
            <td>
              <div class="actions">
                <button mat-button type="button" (click)="edit(u)">Editar</button>
                @if (u.active) {
                  <button mat-button type="button" (click)="link(u)">
                    Generar enlace de acceso
                  </button>
                  @if (!isSelf(u)) {
                    <button mat-button type="button" (click)="setActive(u, false)">
                      Desactivar
                    </button>
                  }
                } @else {
                  <button mat-button type="button" (click)="setActive(u, true)">Activar</button>
                }
              </div>
            </td>
          </tr>
        }
      </tbody>
    </table>
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

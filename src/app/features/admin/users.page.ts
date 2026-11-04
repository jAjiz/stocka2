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
import { RowAction, RowActionsComponent } from '../../shared/row-actions.component';
import { AccessLinkDialogComponent, AccessLinkDialogData } from './access-link-dialog.component';
import { UserDialogComponent, UserDialogData, UserDialogResult } from './user-dialog.component';

export function userStatus(u: AdminUser): string {
  if (!u.active) return 'Desactivado';
  return u.hasPassword ? 'Activo' : 'Pendiente de acceso';
}

@Component({
  selector: 'app-users-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RowActionsComponent],
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
    .inactive {
      opacity: 0.7;
    }
    .error {
      color: var(--mat-sys-error);
    }
    @media (max-width: 599px) {
      .toolbar button {
        width: 100%;
      }
      table,
      tbody,
      td {
        display: block;
      }
      thead {
        display: none;
      }
      tr {
        display: grid;
        grid-template-columns: auto auto 1fr auto;
        gap: 6px 4px;
        padding: 10px 4px 10px 12px;
        border-top: 1px solid var(--mat-sys-outline-variant);
      }
      tr:first-child {
        border-top: 0;
      }
      .app-table td {
        height: auto;
        padding: 0;
        border-top: 0;
      }
      .app-table td.user {
        grid-area: 1 / 1 / 2 / 4;
      }
      .app-table td.role {
        grid-area: 2 / 1;
      }
      .app-table td.state {
        grid-area: 2 / 2;
      }
      .app-table td.actions {
        grid-area: 1 / 4 / 3 / 5;
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
            <td class="user">
              <div class="name">{{ u.displayName }}</div>
              <div class="email">{{ u.email }}</div>
            </td>
            <td class="role">
              <span class="app-tag">{{ u.role === 'admin' ? 'Administrador' : 'Usuario' }}</span>
            </td>
            <td class="state">
              <span
                class="app-tag"
                [class.strong]="u.active && u.hasPassword"
                [class.warning]="u.active && !u.hasPassword"
                >{{ status(u) }}</span
              >
            </td>
            <td class="actions">
              <app-row-actions [name]="u.displayName" [actions]="actionsOf(u)" />
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

  protected actionsOf(u: AdminUser): RowAction[] {
    const edit = { label: 'Editar', run: () => void this.edit(u) };
    if (!u.active) return [edit, { label: 'Activar', run: () => void this.setActive(u, true) }];
    const link = { label: 'Generar enlace de acceso', run: () => void this.link(u) };
    return this.isSelf(u)
      ? [edit, link]
      : [edit, link, { label: 'Desactivar', run: () => void this.setActive(u, false) }];
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

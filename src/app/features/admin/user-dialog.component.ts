import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { adminErrorMessage } from '../../core/db-errors';
import { AdminService } from '../../data/admin.service';
import { AccessLink, AdminUser, Location, Profile } from '../../data/models';

export interface UserDialogData {
  /** null: invitar un usuario nuevo. */
  user: AdminUser | null;
  locations: Location[];
  /** Editando el propio usuario: el rol no se puede cambiar. */
  isSelf?: boolean;
}

/** Resultado: el enlace de acceso y el nombre al invitar, `true` al editar. */
export type UserDialogResult = { link: AccessLink; name: string } | true;

@Component({
  selector: 'app-user-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .locations {
      display: flex;
      flex-direction: column;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h2 mat-dialog-title>{{ data.user ? 'Editar usuario' : 'Invitar usuario' }}</h2>
    <mat-dialog-content>
      <form id="user-form" (submit)="save($event)">
        @if (!data.user) {
          <mat-form-field>
            <mat-label>Correo</mat-label>
            <input
              matInput
              type="email"
              name="email"
              [value]="email()"
              (input)="email.set($any($event.target).value)"
            />
          </mat-form-field>
        } @else {
          <p>{{ data.user.email }}</p>
        }
        <mat-form-field>
          <mat-label>Nombre visible</mat-label>
          <input
            matInput
            name="displayName"
            [value]="displayName()"
            (input)="displayName.set($any($event.target).value)"
          />
        </mat-form-field>
        <mat-radio-group
          aria-label="Rol"
          [disabled]="!!data.isSelf"
          [value]="role()"
          (change)="role.set($event.value)"
        >
          <mat-radio-button value="user">Usuario</mat-radio-button>
          <mat-radio-button value="admin">Administrador</mat-radio-button>
        </mat-radio-group>
        @if (data.isSelf) {
          <p class="hint">No puedes cambiar tu propio rol.</p>
        }
        @if (role() === 'user') {
          <div class="locations" role="group" aria-label="Localizaciones">
            <p>Puede operar en:</p>
            @for (l of data.locations; track l.id) {
              <mat-checkbox [checked]="selected().has(l.id)" (change)="toggle(l.id)">
                {{ l.name }}{{ l.active ? '' : ' (deshabilitada)' }}
              </mat-checkbox>
            }
          </div>
        } @else {
          <p>Un administrador puede operar en todas las localizaciones.</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="submit" form="user-form" [disabled]="!valid() || busy()">
        {{ data.user ? 'Guardar' : 'Invitar' }}
      </button>
    </mat-dialog-actions>
  `,
})
export class UserDialogComponent {
  protected readonly data = inject<UserDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<UserDialogComponent, UserDialogResult>>(MatDialogRef);
  private readonly admin = inject(AdminService);

  protected readonly email = signal('');
  protected readonly displayName = signal(this.data.user?.displayName ?? '');
  protected readonly role = signal<Profile['role']>(this.data.user?.role ?? 'user');
  protected readonly selected = signal(new Set(this.data.user?.locationIds ?? []));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valid = computed(
    () => !!this.displayName().trim() && (!!this.data.user || !!this.email().trim()),
  );

  protected toggle(id: string): void {
    this.selected.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const input = {
      displayName: this.displayName().trim(),
      role: this.role(),
      locationIds: this.role() === 'admin' ? [] : [...this.selected()],
    };
    try {
      if (this.data.user) {
        await this.admin.updateUser(this.data.user.id, input);
        this.ref.close(true);
      } else {
        const link = await this.admin.invite({ ...input, email: this.email().trim() });
        this.ref.close({ link, name: input.displayName });
      }
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

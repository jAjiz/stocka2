import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { dbErrorMessage } from '../../core/db-errors';
import { PasswordFormComponent } from '../../shared/password-form.component';

/** Perfil: nombre visible y contraseña. Las notificaciones llegan en el plan 3. */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    PasswordFormComponent,
  ],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 480px;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .email {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
  `,
  template: `
    <h1>Perfil</h1>
    <p class="email">{{ email() }}</p>
    <mat-card appearance="outlined">
      <mat-card-header><mat-card-title>Nombre visible</mat-card-title></mat-card-header>
      <mat-card-content>
        <form (submit)="saveName($event)">
          <mat-form-field>
            <mat-label>Nombre visible</mat-label>
            <input
              matInput
              name="displayName"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
            <mat-hint>Es el nombre que aparece en el historial.</mat-hint>
          </mat-form-field>
          @if (nameError()) {
            <p class="error" role="alert">{{ nameError() }}</p>
          }
          <button mat-flat-button type="submit" [disabled]="!name().trim() || savingName()">
            Guardar
          </button>
        </form>
      </mat-card-content>
    </mat-card>
    <mat-card appearance="outlined">
      <mat-card-header><mat-card-title>Cambiar contraseña</mat-card-title></mat-card-header>
      <mat-card-content>
        @if (passwordError()) {
          <p class="error" role="alert">{{ passwordError() }}</p>
        }
        <app-password-form [busy]="savingPassword()" (submitted)="savePassword($event)" />
      </mat-card-content>
    </mat-card>
  `,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly email = computed(() => this.auth.session()?.user.email ?? '');
  protected readonly name = signal(this.auth.profile()?.displayName ?? '');
  protected readonly savingName = signal(false);
  protected readonly nameError = signal<string | null>(null);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);

  protected async saveName(event: Event): Promise<void> {
    event.preventDefault();
    const name = this.name().trim();
    if (!name || this.savingName()) return;
    this.savingName.set(true);
    this.nameError.set(null);
    try {
      await this.auth.updateDisplayName(name);
      this.name.set(name);
      this.snackBar.open('Nombre guardado', undefined, { duration: 3000 });
    } catch (e) {
      this.nameError.set(dbErrorMessage(e));
    } finally {
      this.savingName.set(false);
    }
  }

  protected async savePassword(password: string): Promise<void> {
    if (this.savingPassword()) return;
    this.savingPassword.set(true);
    this.passwordError.set(null);
    try {
      await this.auth.setPassword(password);
      this.snackBar.open('Contraseña cambiada', undefined, { duration: 3000 });
    } catch (e) {
      this.passwordError.set((e as Error).message);
    } finally {
      this.savingPassword.set(false);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { dbErrorMessage } from '../../core/db-errors';
import { PushService } from '../../data/push.service';
import { PasswordFormComponent } from '../../shared/password-form.component';

/** Perfil: nombre visible, contraseña y notificaciones push de este dispositivo. */
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
    <p class="email">{{ email() }}</p>
    <mat-card appearance="outlined">
      <mat-card-header><mat-card-title>Nombre visible</mat-card-title></mat-card-header>
      <mat-card-content>
        <form (submit)="saveName($event)">
          <mat-form-field appearance="outline">
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
    <mat-card appearance="outlined">
      <mat-card-header><mat-card-title>Notificaciones</mat-card-title></mat-card-header>
      <mat-card-content>
        @switch (push.status()) {
          @case ('off') {
            <p>Recibe un aviso en este dispositivo cuando un artículo llegue a nivel grave.</p>
            <button mat-flat-button type="button" (click)="enablePush()">
              Activar notificaciones
            </button>
          }
          @case ('on') {
            <p>Las notificaciones están activadas en este dispositivo.</p>
            <button mat-stroked-button type="button" (click)="disablePush()">Desactivar</button>
          }
          @case ('busy') {
            <p>Un momento…</p>
          }
          @case ('denied') {
            <p>
              Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta
              web.
            </p>
          }
          @case ('ios-install') {
            <p>
              En iPhone las notificaciones solo funcionan con la aplicación instalada: pulsa
              Compartir, «Añadir a pantalla de inicio» y ábrela desde allí (iOS 16.4 o posterior).
            </p>
          }
          @default {
            <p>Este navegador no admite notificaciones.</p>
          }
        }
        @if (pushError()) {
          <p class="error" role="alert">{{ pushError() }}</p>
        }
      </mat-card-content>
    </mat-card>
    <button mat-stroked-button type="button" (click)="signOut()">Cerrar sesión</button>
  `,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly push = inject(PushService);

  protected readonly email = computed(() => this.auth.session()?.user.email ?? '');
  protected readonly name = signal(this.auth.profile()?.displayName ?? '');
  protected readonly savingName = signal(false);
  protected readonly nameError = signal<string | null>(null);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);
  protected readonly pushError = signal<string | null>(null);
  private readonly passwordForm = viewChild.required(PasswordFormComponent);

  /** La navegación a /login la hace el shell al quedar la sesión en null. */
  protected async signOut(): Promise<void> {
    await this.auth.signOut();
  }

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
      this.passwordForm().reset();
      this.snackBar.open('Contraseña cambiada', undefined, { duration: 3000 });
    } catch (e) {
      this.passwordError.set((e as Error).message);
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected async enablePush(): Promise<void> {
    this.pushError.set(null);
    try {
      await this.push.enable();
      if (this.push.status() === 'on') {
        this.snackBar.open('Notificaciones activadas', undefined, { duration: 3000 });
      }
    } catch (e) {
      this.pushError.set(dbErrorMessage(e));
    }
  }

  protected async disablePush(): Promise<void> {
    this.pushError.set(null);
    try {
      await this.push.disable();
      this.snackBar.open('Notificaciones desactivadas', undefined, { duration: 3000 });
    } catch (e) {
      this.pushError.set(dbErrorMessage(e));
    }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { dbErrorMessage } from '../../core/db-errors';
import { PushService } from '../../data/push.service';
import { dialogSize } from '../../shared/dialog-size';
import { NameDialogComponent, NameDialogData } from '../admin/name-dialog.component';
import { ChangePasswordDialogComponent } from './change-password-dialog.component';

/** Perfil: nombre visible, correo, contraseña y notificaciones push de este dispositivo. */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 16px;
      max-width: 560px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .row:first-child {
      border-top: 0;
    }
    .info {
      flex: 1;
      min-width: 0;
    }
    .value {
      font: var(--mat-sys-title-small);
      overflow-wrap: anywhere;
    }
    .detail {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .row > button {
      flex: none;
    }
    .error {
      margin: 4px 0 0;
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
  `,
  template: `
    <div class="app-list">
      <div class="row">
        <span class="app-list-symbol"><mat-icon aria-hidden="true">person</mat-icon></span>
        <div class="info">
          <div class="value">{{ name() }}</div>
          <div class="detail">Nombre visible en el historial</div>
        </div>
        <button mat-button type="button" (click)="editName()">Editar</button>
      </div>
      <div class="row">
        <span class="app-list-symbol"><mat-icon aria-hidden="true">mail</mat-icon></span>
        <div class="info">
          <div class="value">{{ email() }}</div>
          <div class="detail">Correo de acceso</div>
        </div>
      </div>
      <div class="row">
        <span class="app-list-symbol"><mat-icon aria-hidden="true">lock</mat-icon></span>
        <div class="info">
          <div class="value">Contraseña</div>
          <div class="detail">Mínimo 8 caracteres</div>
        </div>
        <button mat-button type="button" (click)="changePassword()">Cambiar</button>
      </div>
      <div class="row">
        <span class="app-list-symbol"><mat-icon aria-hidden="true">notifications</mat-icon></span>
        <div class="info">
          <div class="value">Notificaciones</div>
          <div class="detail">
            @switch (push.status()) {
              @case ('off') {
                Recibe un aviso en este dispositivo cuando un artículo llegue a nivel grave.
              }
              @case ('on') {
                Activadas en este dispositivo.
              }
              @case ('busy') {
                Un momento…
              }
              @case ('denied') {
                Has bloqueado las notificaciones. Actívalas en los ajustes del navegador para esta
                web.
              }
              @case ('ios-install') {
                En iPhone las notificaciones solo funcionan con la aplicación instalada: pulsa
                Compartir, «Añadir a pantalla de inicio» y ábrela desde allí (iOS 16.4 o posterior).
              }
              @default {
                Este navegador no admite notificaciones.
              }
            }
          </div>
          @if (pushError()) {
            <p class="error" role="alert">{{ pushError() }}</p>
          }
        </div>
        @if (push.status() === 'off') {
          <button mat-button type="button" (click)="enablePush()">Activar</button>
        }
        @if (push.status() === 'on') {
          <button mat-button type="button" (click)="disablePush()">Desactivar</button>
        }
      </div>
    </div>
    <button mat-stroked-button type="button" (click)="signOut()">Cerrar sesión</button>
  `,
})
export class ProfilePage {
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly push = inject(PushService);

  protected readonly email = computed(() => this.auth.session()?.user.email ?? '');
  protected readonly name = computed(() => this.auth.profile()?.displayName ?? '');
  protected readonly pushError = signal<string | null>(null);

  /** La navegación a /login la hace el shell al quedar la sesión en null. */
  protected async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  protected async editName(): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<NameDialogComponent, NameDialogData, boolean>(NameDialogComponent, {
          data: {
            title: 'Nombre visible',
            fields: ['name'],
            value: { name: this.name() },
            save: (v) => this.auth.updateDisplayName(v.name),
          },
          disableClose: true,
          ...dialogSize(false),
        })
        .afterClosed(),
    );
    if (saved) this.notify('Nombre guardado');
  }

  protected async changePassword(): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<ChangePasswordDialogComponent, void, boolean>(ChangePasswordDialogComponent, {
          disableClose: true,
          ...dialogSize(false),
        })
        .afterClosed(),
    );
    if (saved) this.notify('Contraseña cambiada');
  }

  protected async enablePush(): Promise<void> {
    this.pushError.set(null);
    try {
      await this.push.enable();
      if (this.push.status() === 'on') this.notify('Notificaciones activadas');
    } catch (e) {
      this.pushError.set(dbErrorMessage(e));
    }
  }

  protected async disablePush(): Promise<void> {
    this.pushError.set(null);
    try {
      await this.push.disable();
      this.notify('Notificaciones desactivadas');
    } catch (e) {
      this.pushError.set(dbErrorMessage(e));
    }
  }

  private notify(message: string): void {
    this.snackBar.open(message, undefined, { duration: 3000 });
  }
}

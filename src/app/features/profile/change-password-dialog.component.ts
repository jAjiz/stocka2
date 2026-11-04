import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../core/auth.service';
import { PasswordFormComponent } from '../../shared/password-form.component';

/** Cambia la contraseña del usuario. Se cierra con `true` al guardar. */
@Component({
  selector: 'app-change-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, PasswordFormComponent],
  styles: `
    .error {
      margin: 0;
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h2 mat-dialog-title>Cambiar contraseña</h2>
    <mat-dialog-content>
      <app-password-form
        #form
        formId="change-password-form"
        [busy]="busy()"
        (submitted)="save($event)"
      />
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        type="submit"
        form="change-password-form"
        [disabled]="!form.valid() || busy()"
      >
        Guardar
      </button>
    </mat-dialog-actions>
  `,
})
export class ChangePasswordDialogComponent {
  private readonly auth = inject(AuthService);
  private readonly ref = inject<MatDialogRef<ChangePasswordDialogComponent, boolean>>(MatDialogRef);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async save(password: string): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.setPassword(password);
      this.ref.close(true);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}

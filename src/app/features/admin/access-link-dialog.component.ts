import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AccessLink } from '../../data/models';
import { formatDateTime } from '../../shared/format';

export interface AccessLinkDialogData {
  name: string;
  link: AccessLink;
}

/** Muestra un enlace de acceso para enviarlo a mano (la app no envía emails). */
@Component({
  selector: 'app-access-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule],
  styles: `
    mat-form-field {
      width: 100%;
    }
    .expiry {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
  template: `
    <h2 mat-dialog-title>Enlace de acceso</h2>
    <mat-dialog-content>
      <p>Envía este enlace a {{ data.name }}. Al abrirlo podrá crear su contraseña.</p>
      <mat-form-field>
        <mat-label>Enlace</mat-label>
        <input #urlInput matInput readonly [value]="data.link.url" (focus)="urlInput.select()" />
      </mat-form-field>
      <p class="expiry">Caduca el {{ expiresAt }}. Si caduca, genera otro desde Administración.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cerrar</button>
      @if (canShare) {
        <button mat-stroked-button type="button" (click)="share()">
          <mat-icon>share</mat-icon>Compartir
        </button>
      }
      <button mat-flat-button type="button" (click)="copy()">
        <mat-icon>content_copy</mat-icon>Copiar
      </button>
    </mat-dialog-actions>
  `,
})
export class AccessLinkDialogComponent {
  protected readonly data = inject<AccessLinkDialogData>(MAT_DIALOG_DATA);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly expiresAt = formatDateTime(this.data.link.expiresAt);
  protected readonly canShare = typeof navigator.share === 'function';

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.data.link.url);
      this.snackBar.open('Enlace copiado', undefined, { duration: 3000 });
    } catch {
      this.snackBar.open('No se ha podido copiar. Copia el enlace a mano.', undefined, {
        duration: 4000,
      });
    }
  }

  protected async share(): Promise<void> {
    try {
      await navigator.share({
        title: 'Acceso a Stocka2',
        text: 'Entra en Stocka2 y crea tu contraseña:',
        url: this.data.link.url,
      });
    } catch {
      // cancelado por el usuario
    }
  }
}

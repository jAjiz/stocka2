import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { PasswordFormComponent } from '../../shared/password-form.component';

const INVALID_LINK = 'El enlace no es válido o ha caducado. Pide uno nuevo al administrador.';

/**
 * Destino de los enlaces de invitación y recuperación (/acceso?t=<token_hash>).
 * El token se canjea al pulsar "Continuar", no al cargar: un navegador o una vista previa
 * que abra la página no lo gasta.
 */
@Component({
  selector: 'app-access-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatCardModule, PasswordFormComponent],
  styles: `
    :host {
      display: flex;
      min-height: 100%;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
    }
    mat-card {
      width: 100%;
      max-width: 400px;
    }
    .content {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
  `,
  template: `
    <mat-card appearance="outlined">
      <div class="content">
        <h1>Stocka2</h1>
        @if (!token) {
          <p class="error" role="alert">{{ invalidLink }}</p>
          <a mat-button routerLink="/login">Ir a la pantalla de entrada</a>
        } @else if (!accepted()) {
          <p>Pulsa Continuar para crear tu contraseña.</p>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button mat-flat-button type="button" [disabled]="busy()" (click)="accept()">
            Continuar
          </button>
        } @else {
          <p>Crea tu contraseña. La usarás para entrar con tu correo.</p>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <app-password-form [busy]="busy()" (submitted)="save($event)" />
        }
      </div>
    </mat-card>
  `,
})
export class AccessPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('t');
  protected readonly invalidLink = INVALID_LINK;
  protected readonly accepted = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async accept(): Promise<void> {
    if (!this.token) return;
    await this.run(async () => {
      await this.auth.acceptLink(this.token!);
      this.accepted.set(true);
    });
  }

  protected async save(password: string): Promise<void> {
    await this.run(async () => {
      await this.auth.setPassword(password);
      this.snackBar.open('Contraseña guardada', undefined, { duration: 3000 });
      await this.router.navigateByUrl('/');
    });
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}

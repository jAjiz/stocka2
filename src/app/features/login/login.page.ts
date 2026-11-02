import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatInputModule],
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
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
    }
    .error {
      color: var(--mat-sys-error);
      margin: 0;
    }
    .forgot {
      margin: 0;
      padding: 0 16px 16px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
  template: `
    <mat-card appearance="outlined">
      <form (ngSubmit)="submit()">
        <h1>Stocka2</h1>
        <mat-form-field>
          <mat-label>Correo</mat-label>
          <input
            matInput
            type="email"
            name="email"
            autocomplete="username"
            required
            [(ngModel)]="email"
          />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Contraseña</mat-label>
          <input
            matInput
            type="password"
            name="password"
            autocomplete="current-password"
            required
            [(ngModel)]="password"
          />
        </mat-form-field>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button mat-flat-button type="submit" [disabled]="busy()">Entrar</button>
      </form>
      <p class="forgot">¿Has olvidado tu contraseña? Pide un enlace de acceso al administrador.</p>
    </mat-card>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async submit(): Promise<void> {
    if (!this.email || !this.password) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.signIn(this.email.trim(), this.password);
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }
}

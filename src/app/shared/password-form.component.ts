import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export const MIN_PASSWORD_LENGTH = 8;

/** Nueva contraseña + repetirla. Emite la contraseña cuando es válida y se envía. */
@Component({
  selector: 'app-password-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  `,
  template: `
    <form (submit)="submit($event)">
      <mat-form-field appearance="outline">
        <mat-label>Nueva contraseña</mat-label>
        <input
          matInput
          type="password"
          name="password"
          autocomplete="new-password"
          [value]="password()"
          (input)="password.set($any($event.target).value)"
        />
        @if (tooShort()) {
          <mat-hint class="error">Mínimo 8 caracteres.</mat-hint>
        }
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Repite la contraseña</mat-label>
        <input
          matInput
          type="password"
          name="repeat"
          autocomplete="new-password"
          [value]="repeat()"
          (input)="repeat.set($any($event.target).value)"
        />
        @if (mismatch()) {
          <mat-hint class="error">Las contraseñas no coinciden.</mat-hint>
        }
      </mat-form-field>
      <button mat-flat-button type="submit" [disabled]="!valid() || busy()">
        Guardar contraseña
      </button>
    </form>
  `,
})
export class PasswordFormComponent {
  readonly busy = input(false);
  readonly submitted = output<string>();

  protected readonly password = signal('');
  protected readonly repeat = signal('');

  protected readonly tooShort = computed(
    () => this.password().length > 0 && this.password().length < MIN_PASSWORD_LENGTH,
  );
  protected readonly mismatch = computed(
    () => this.repeat().length > 0 && this.repeat() !== this.password(),
  );
  protected readonly valid = computed(
    () => this.password().length >= MIN_PASSWORD_LENGTH && this.repeat() === this.password(),
  );

  /** Vacía los campos (tras guardar con éxito). */
  reset(): void {
    this.password.set('');
    this.repeat.set('');
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.valid() && !this.busy()) this.submitted.emit(this.password());
  }
}

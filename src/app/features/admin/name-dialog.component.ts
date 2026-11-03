import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { adminErrorMessage } from '../../core/db-errors';
import { ItemType, Location } from '../../data/models';

export type NameDialogField = 'name' | 'kind' | 'type' | 'reference';

export interface NameDialogValue {
  name: string;
  kind?: Location['kind'];
  typeId?: string;
  reference?: string | null;
}

export interface NameDialogData {
  title: string;
  fields: NameDialogField[];
  value: NameDialogValue;
  /** Tipos que se ofrecen si `fields` incluye 'type'. */
  types?: ItemType[];
  /** Guarda el valor; si lanza, el diálogo muestra el error y sigue abierto. */
  save: (v: NameDialogValue) => Promise<unknown>;
}

/** Alta y edición de localizaciones, tipos y artículos. Se cierra con `true` al guardar. */
@Component({
  selector: 'app-name-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 8px;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <form id="name-form" (submit)="save($event)">
        <mat-form-field>
          <mat-label>Nombre</mat-label>
          <input
            matInput
            name="name"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </mat-form-field>
        @if (has('kind')) {
          <mat-form-field>
            <mat-label>Tipo de localización</mat-label>
            <mat-select [value]="kind()" (valueChange)="kind.set($event)">
              <mat-option value="warehouse">Almacén</mat-option>
              <mat-option value="vehicle">Vehículo</mat-option>
            </mat-select>
          </mat-form-field>
        }
        @if (has('type')) {
          <mat-form-field>
            <mat-label>Tipo</mat-label>
            <mat-select [value]="typeId()" (valueChange)="typeId.set($event)">
              @for (t of data.types ?? []; track t.id) {
                <mat-option [value]="t.id">{{ t.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        @if (has('reference')) {
          <mat-form-field>
            <mat-label>Referencia (opcional)</mat-label>
            <input
              matInput
              name="reference"
              [value]="reference()"
              (input)="reference.set($any($event.target).value)"
            />
          </mat-form-field>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="submit" form="name-form" [disabled]="!valid() || busy()">
        Guardar
      </button>
    </mat-dialog-actions>
  `,
})
export class NameDialogComponent {
  protected readonly data = inject<NameDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<NameDialogComponent, boolean>>(MatDialogRef);

  protected readonly name = signal(this.data.value.name);
  protected readonly kind = signal<Location['kind']>(this.data.value.kind ?? 'warehouse');
  protected readonly typeId = signal(this.data.value.typeId ?? '');
  protected readonly reference = signal(this.data.value.reference ?? '');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valid = computed(
    () => !!this.name().trim() && (!this.has('type') || !!this.typeId()),
  );

  protected has(f: NameDialogField): boolean {
    return this.data.fields.includes(f);
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.data.save({
        name: this.name().trim(),
        kind: this.kind(),
        typeId: this.typeId(),
        reference: this.reference().trim() || null,
      });
      this.ref.close(true);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

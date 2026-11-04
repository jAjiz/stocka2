import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { normalizeText } from '../../shared/format';

export interface CatalogRow {
  id: string;
  name: string;
  /** Texto secundario (tipo, referencia…); también entra en la búsqueda. */
  detail?: string;
  icon?: string;
  active: boolean;
}

/** Lista de administración con buscador, "Mostrar deshabilitados" y acciones por fila. */
@Component({
  selector: 'app-catalog-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
  ],
  styles: `
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-bottom: 8px;
    }
    .toolbar mat-form-field {
      flex: 1;
      min-width: 200px;
    }
    @media (min-width: 600px) {
      .toolbar mat-form-field {
        max-width: 320px;
      }
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 10px;
      padding: 8px 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .row:first-child {
      border-top: 0;
    }
    .info {
      flex: 1;
      min-width: 180px;
    }
    .name {
      font: var(--mat-sys-title-small);
    }
    .detail,
    .tag {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .inactive .name {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .empty {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  template: `
    <div class="toolbar">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="search"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </mat-form-field>
      <mat-slide-toggle [checked]="showInactive()" (change)="showInactive.set($event.checked)">
        Mostrar deshabilitados
      </mat-slide-toggle>
      <button mat-flat-button type="button" (click)="add.emit()">
        <mat-icon>add</mat-icon>{{ addLabel() }}
      </button>
    </div>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (visible().length > 0) {
      <div class="app-list">
        @for (r of visible(); track r.id) {
          <div class="row" data-row [class.inactive]="!r.active">
            @if (r.icon) {
              <span class="app-list-symbol"
                ><mat-icon aria-hidden="true">{{ r.icon }}</mat-icon></span
              >
            }
            <div class="info">
              <div class="name">{{ r.name }}</div>
              @if (r.detail) {
                <div class="detail">{{ r.detail }}</div>
              }
              @if (!r.active) {
                <div class="tag">{{ inactiveLabel() }}</div>
              }
            </div>
            <button mat-button type="button" (click)="edit.emit(r.id)">Editar</button>
            @if (duplicable()) {
              <button mat-button type="button" (click)="duplicate.emit(r.id)">Duplicar</button>
            }
            <button mat-button type="button" (click)="toggle.emit(r.id)">
              {{ r.active ? 'Deshabilitar' : 'Habilitar' }}
            </button>
            <button mat-button type="button" (click)="remove.emit(r.id)">Eliminar</button>
          </div>
        }
      </div>
    } @else {
      <p class="empty">No hay resultados.</p>
    }
  `,
})
export class CatalogListComponent {
  readonly rows = input.required<CatalogRow[]>();
  readonly addLabel = input.required<string>();
  /** "Deshabilitada" o "Deshabilitado". */
  readonly inactiveLabel = input('Deshabilitado');
  readonly error = input<string | null>(null);
  /** Muestra la acción "Duplicar" en cada fila. */
  readonly duplicable = input(false);

  readonly add = output<void>();
  readonly edit = output<string>();
  readonly duplicate = output<string>();
  readonly toggle = output<string>();
  readonly remove = output<string>();

  protected readonly query = signal('');
  protected readonly showInactive = signal(false);

  protected readonly visible = computed(() => {
    const q = normalizeText(this.query());
    return this.rows().filter(
      (r) =>
        (this.showInactive() || r.active) &&
        (!q || normalizeText(`${r.name} ${r.detail ?? ''}`).includes(q)),
    );
  });
}

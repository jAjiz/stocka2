import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { normalizeText } from '../../shared/format';
import { RowAction, RowActionsComponent } from '../../shared/row-actions.component';

export interface CatalogRowTag {
  label: string;
  tone?: 'warning' | 'error';
}

export interface CatalogRow {
  id: string;
  name: string;
  /** Líneas de texto secundario (tipo, referencia…); también entran en la búsqueda. */
  details?: string[];
  /** Datos cortos que se muestran como etiquetas; también entran en la búsqueda. */
  tags?: CatalogRowTag[];
  icon?: string;
  active: boolean;
}

function searchText(r: CatalogRow): string {
  return [r.name, ...(r.details ?? []), ...(r.tags ?? []).map((t) => t.label)].join(' ');
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
    RowActionsComponent,
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
    @media (max-width: 599px) {
      .toolbar mat-form-field {
        min-width: 0;
      }
      .toolbar button {
        flex: none;
      }
      .toolbar mat-slide-toggle {
        order: 1;
        flex-basis: 100%;
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
    .detail {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    @media (max-width: 599px) {
      .row {
        flex-wrap: nowrap;
        align-items: flex-start;
        padding-right: 4px;
      }
      .info {
        min-width: 0;
      }
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
              @for (d of r.details; track $index) {
                <div class="detail">{{ d }}</div>
              }
              @if (r.tags?.length || !r.active) {
                <div class="tags">
                  @for (t of r.tags; track t.label) {
                    <span
                      class="app-tag"
                      [class.warning]="t.tone === 'warning'"
                      [class.error]="t.tone === 'error'"
                      >{{ t.label }}</span
                    >
                  }
                  @if (!r.active) {
                    <span class="app-tag">{{ inactiveLabel() }}</span>
                  }
                </div>
              }
            </div>
            <app-row-actions [name]="r.name" [actions]="actionsOf(r)" />
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
      (r) => (this.showInactive() || r.active) && (!q || normalizeText(searchText(r)).includes(q)),
    );
  });

  protected actionsOf(r: CatalogRow): RowAction[] {
    return [
      { label: 'Editar', run: () => this.edit.emit(r.id) },
      ...(this.duplicable() ? [{ label: 'Duplicar', run: () => this.duplicate.emit(r.id) }] : []),
      {
        label: r.active ? 'Deshabilitar' : 'Habilitar',
        run: () => this.toggle.emit(r.id),
      },
      { label: 'Eliminar', run: () => this.remove.emit(r.id) },
    ];
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { adminErrorMessage } from '../../core/db-errors';
import { AlertsService } from '../../data/alerts.service';
import { AlertRule, Item, Location } from '../../data/models';
import { normalizeText } from '../../shared/format';

export interface AlertRuleDialogData {
  rule: AlertRule | null;
  /** Duplicar: parte de `rule` pero guarda una regla nueva. */
  copy: boolean;
  /** Artículos y localizaciones activos que se pueden elegir. */
  items: Item[];
  locations: Location[];
}

const THRESHOLDS_MESSAGE =
  'Indica al menos un umbral. Si pones los dos, el grave tiene que ser menor que el leve.';

/** Convierte el texto de un umbral: null si está vacío, NaN si no es un entero >= 0. */
function parseThreshold(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

/** Alta, edición y duplicado de reglas de aviso. Se cierra con `true` al guardar. */
@Component({
  selector: 'app-alert-rule-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  styles: `
    form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 8px;
    }
    .locations {
      display: flex;
      flex-direction: column;
    }
    .error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 0;
    }
  `,
  template: `
    <h2 mat-dialog-title>{{ title }}</h2>
    <mat-dialog-content>
      <form id="rule-form" (submit)="save($event)">
        <mat-form-field>
          <mat-label>Nombre</mat-label>
          <input
            matInput
            name="name"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </mat-form-field>

        <mat-checkbox [checked]="allItems()" (change)="allItems.set($event.checked)">
          Todos los artículos
        </mat-checkbox>
        @if (!allItems()) {
          <mat-form-field>
            <mat-label>Artículos</mat-label>
            <mat-chip-grid #grid aria-label="Artículos elegidos">
              @for (i of selectedItems(); track i.id) {
                <mat-chip-row (removed)="removeItem(i.id)">
                  {{ i.name }}
                  <button matChipRemove [attr.aria-label]="'Quitar ' + i.name">
                    <mat-icon>cancel</mat-icon>
                  </button>
                </mat-chip-row>
              }
            </mat-chip-grid>
            <input
              placeholder="Buscar artículo"
              [matChipInputFor]="grid"
              [matAutocomplete]="auto"
              [value]="query()"
              (input)="query.set($any($event.target).value)"
            />
            <mat-autocomplete #auto (optionSelected)="addItem($event)">
              @for (i of suggestions(); track i.id) {
                <mat-option [value]="i.id">{{ i.name }}</mat-option>
              }
            </mat-autocomplete>
          </mat-form-field>
          @if (itemIds().length + hiddenItemIds.length === 0) {
            <p class="error">Elige al menos un artículo.</p>
          }
        }

        <mat-checkbox [checked]="allLocations()" (change)="allLocations.set($event.checked)">
          Todas las localizaciones
        </mat-checkbox>
        @if (!allLocations()) {
          <div class="locations">
            @for (l of data.locations; track l.id) {
              <mat-checkbox
                [checked]="locationIds().includes(l.id)"
                (change)="toggleLocation(l.id, $event.checked)"
              >
                {{ l.name }}
              </mat-checkbox>
            }
          </div>
          @if (locationIds().length + hiddenLocationIds.length === 0) {
            <p class="error">Elige al menos una localización.</p>
          }
        }

        <mat-form-field>
          <mat-label>Aviso leve si quedan</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            name="warning"
            [value]="warning()"
            (input)="warning.set($any($event.target).value)"
          />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Aviso grave si quedan</mat-label>
          <input
            matInput
            type="number"
            min="0"
            step="1"
            name="critical"
            [value]="critical()"
            (input)="critical.set($any($event.target).value)"
          />
        </mat-form-field>
        @if (thresholdsError()) {
          <p class="error">{{ thresholdsError() }}</p>
        }
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="submit" form="rule-form" [disabled]="!valid() || busy()">
        Guardar
      </button>
    </mat-dialog-actions>
  `,
})
export class AlertRuleDialogComponent {
  protected readonly data = inject<AlertRuleDialogData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<AlertRuleDialogComponent, boolean>>(MatDialogRef);
  private readonly alerts = inject(AlertsService);

  protected readonly title = this.data.rule
    ? this.data.copy
      ? 'Duplicar regla'
      : 'Editar regla'
    : 'Nueva regla';

  protected readonly name = signal(
    this.data.rule ? this.data.rule.name + (this.data.copy ? ' (copia)' : '') : '',
  );
  protected readonly allItems = signal(this.data.rule?.allItems ?? true);
  protected readonly allLocations = signal(this.data.rule?.allLocations ?? true);
  // Los ids que no están entre los elegibles (artículos o localizaciones deshabilitados)
  // no se muestran, pero se conservan al guardar para que sigan cubiertos si se rehabilitan.
  protected readonly hiddenItemIds = (this.data.rule?.itemIds ?? []).filter(
    (id) => !this.data.items.some((i) => i.id === id),
  );
  protected readonly hiddenLocationIds = (this.data.rule?.locationIds ?? []).filter(
    (id) => !this.data.locations.some((l) => l.id === id),
  );
  protected readonly itemIds = signal(
    (this.data.rule?.itemIds ?? []).filter((id) => this.data.items.some((i) => i.id === id)),
  );
  protected readonly locationIds = signal(
    (this.data.rule?.locationIds ?? []).filter((id) =>
      this.data.locations.some((l) => l.id === id),
    ),
  );
  protected readonly warning = signal(String(this.data.rule?.warning ?? ''));
  protected readonly critical = signal(String(this.data.rule?.critical ?? ''));
  protected readonly query = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedItems = computed(() =>
    this.itemIds()
      .map((id) => this.data.items.find((i) => i.id === id))
      .filter((i): i is Item => !!i),
  );

  protected readonly suggestions = computed(() => {
    const q = normalizeText(this.query());
    const chosen = new Set(this.itemIds());
    return this.data.items
      .filter((i) => !chosen.has(i.id) && (!q || normalizeText(i.name).includes(q)))
      .slice(0, 50);
  });

  protected readonly thresholdsError = computed(() => {
    const w = parseThreshold(this.warning());
    const c = parseThreshold(this.critical());
    if (Number.isNaN(w) || Number.isNaN(c)) return 'Los umbrales son números enteros, desde 0.';
    if (w === null && c === null) return THRESHOLDS_MESSAGE;
    if (w !== null && c !== null && c >= w) return THRESHOLDS_MESSAGE;
    return null;
  });

  protected readonly valid = computed(
    () =>
      !!this.name().trim() &&
      !this.thresholdsError() &&
      (this.allItems() || this.itemIds().length + this.hiddenItemIds.length > 0) &&
      (this.allLocations() || this.locationIds().length + this.hiddenLocationIds.length > 0),
  );

  protected addItem(event: MatAutocompleteSelectedEvent): void {
    const id = event.option.value as string;
    this.itemIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
    this.query.set('');
  }

  protected removeItem(id: string): void {
    this.itemIds.update((ids) => ids.filter((x) => x !== id));
  }

  protected toggleLocation(id: string, checked: boolean): void {
    this.locationIds.update((ids) =>
      checked ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id),
    );
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.valid() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.alerts.saveRule(this.data.copy ? null : (this.data.rule?.id ?? null), {
        name: this.name().trim(),
        itemIds: this.allItems() ? null : [...this.itemIds(), ...this.hiddenItemIds],
        locationIds: this.allLocations() ? null : [...this.locationIds(), ...this.hiddenLocationIds],
        warning: parseThreshold(this.warning()),
        critical: parseThreshold(this.critical()),
      });
      this.ref.close(true);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

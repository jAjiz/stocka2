import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  PendingTasks,
  signal,
} from '@angular/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { dbErrorMessage } from '../../core/db-errors';
import { CatalogService } from '../../data/catalog.service';
import { Item, ItemType, Location, OperationKind, OperationLineInput } from '../../data/models';
import { OperationsService } from '../../data/operations.service';
import { StockService } from '../../data/stock.service';
import { normalizeText } from '../../shared/format';
import { addLine, buildPayload, validateLines } from './operation-form.model';

export interface OperationFormData {
  kind: OperationKind;
  locationId: string;
}

@Component({
  selector: 'app-operation-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  styles: `
    form {
      display: contents;
    }
    mat-form-field {
      width: 100%;
    }
    .line {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }
    .line .name {
      flex: 1 1 auto;
      padding-top: 16px;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .line .qty {
      flex: 0 0 110px;
      width: 110px;
    }
    .line button {
      margin-top: 4px;
    }
    .hint {
      color: var(--mat-sys-on-surface-variant);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .new-item {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 12px;
      margin: 8px 0;
    }
  `,
  template: `
    <form (submit)="$event.preventDefault(); submit()">
      <h2 mat-dialog-title>{{ title() }}</h2>
      <mat-dialog-content>
        @if (loadError()) {
          <p class="error" role="alert">{{ loadError() }}</p>
        }

        @if (data.kind === 'move') {
          <mat-form-field>
            <mat-label>Origen</mat-label>
            <mat-select [value]="originId()" (selectionChange)="setOrigin($event.value)">
              @for (l of origins(); track l.id) {
                <mat-option [value]="l.id">{{ l.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field>
          <mat-label>Buscar artículo</mat-label>
          <input
            matInput
            type="search"
            autocomplete="off"
            [matAutocomplete]="auto"
            [disabled]="data.kind === 'move' && !originId()"
            [value]="search()"
            (input)="search.set($any($event.target).value)"
          />
          <mat-autocomplete
            #auto="matAutocomplete"
            [displayWith]="noDisplay"
            (optionSelected)="pickItem($event.option.value); search.set('')"
          >
            @for (c of candidates(); track c.id) {
              <mat-option [value]="c.id">
                {{ c.name }}
                @if (available(); as av) {
                  <span class="hint"> (hay {{ av.get(c.id) ?? 0 }})</span>
                }
              </mat-option>
            } @empty {
              <mat-option disabled>Sin resultados</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>

        @if (data.kind === 'add') {
          @if (!creating()) {
            <button mat-button type="button" (click)="creating.set(true)">
              Crear artículo nuevo
            </button>
          } @else {
            <div class="new-item">
              <mat-form-field>
                <mat-label>Nombre</mat-label>
                <input
                  matInput
                  [value]="newName()"
                  (input)="newName.set($any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field>
                <mat-label>Tipo</mat-label>
                <mat-select [value]="newType()" (selectionChange)="newType.set($event.value)">
                  @for (t of types(); track t.id) {
                    <mat-option [value]="t.id">{{ t.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Referencia (opcional)</mat-label>
                <input
                  matInput
                  [value]="newRef()"
                  (input)="newRef.set($any($event.target).value)"
                />
              </mat-form-field>
              @if (createError()) {
                <p class="error" role="alert">{{ createError() }}</p>
              }
              <button
                mat-flat-button
                type="button"
                [disabled]="createBusy() || !newName().trim() || !newType()"
                (click)="createItem()"
              >
                Crear y añadir
              </button>
              <button mat-button type="button" (click)="creating.set(false)">Cancelar</button>
            </div>
          }
        }

        @for (l of lines(); track l.itemId) {
          <div class="line">
            <div class="name">{{ itemName(l.itemId) }}</div>
            <mat-form-field class="qty" subscriptSizing="dynamic">
              <mat-label>Cantidad</mat-label>
              <input
                matInput
                type="number"
                inputmode="numeric"
                min="1"
                step="1"
                [value]="l.quantity"
                (input)="setQuantity(l.itemId, $any($event.target).value)"
              />
            </mat-form-field>
            <button
              mat-icon-button
              type="button"
              aria-label="Quitar artículo"
              (click)="removeLine(l.itemId)"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
          @if (errors().get(l.itemId); as e) {
            <div class="error" role="alert">{{ itemName(l.itemId) }}: {{ e }}</div>
          }
        } @empty {
          <p class="hint">Añade al menos un artículo</p>
        }

        @if (data.kind === 'consume') {
          <mat-form-field>
            <mat-label>Referencia (opcional)</mat-label>
            <input
              matInput
              [value]="reference()"
              (input)="reference.set($any($event.target).value)"
            />
          </mat-form-field>
        }
        <mat-form-field>
          <mat-label>Notas (opcional)</mat-label>
          <textarea
            matInput
            rows="2"
            [value]="notes()"
            (input)="notes.set($any($event.target).value)"
          ></textarea>
        </mat-form-field>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [disabled]="busy()" (click)="ref.close(false)">
          Cancelar
        </button>
        <button mat-flat-button type="submit" [disabled]="busy() || errors().size > 0">
          Confirmar
        </button>
      </mat-dialog-actions>
    </form>
  `,
})
export class OperationFormComponent implements OnInit {
  protected readonly data = inject<OperationFormData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<OperationFormComponent, boolean>>(MatDialogRef);
  private readonly catalog = inject(CatalogService);
  private readonly stockService = inject(StockService);
  private readonly operations = inject(OperationsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly pending = inject(PendingTasks);

  protected readonly locations = signal<Location[]>([]);
  protected readonly types = signal<ItemType[]>([]);
  private readonly items = signal<Item[]>([]);
  /** Stock de la localización de la que salen los artículos (origen o actual). */
  private readonly sourceStock = signal<Map<string, number>>(new Map());

  protected readonly originId = signal('');
  protected readonly lines = signal<OperationLineInput[]>([]);
  protected readonly search = signal('');
  protected readonly reference = signal('');
  protected readonly notes = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly loadError = signal('');

  protected readonly creating = signal(false);
  protected readonly createBusy = signal(false);
  protected readonly createError = signal('');
  protected readonly newName = signal('');
  protected readonly newType = signal('');
  protected readonly newRef = signal('');

  protected readonly title = computed(() => {
    switch (this.data.kind) {
      case 'add':
        return 'Añadir material';
      case 'move': {
        const name = this.locations().find((l) => l.id === this.data.locationId)?.name ?? '';
        return `Traer material a ${name}`.trim();
      }
      case 'remove':
        return 'Dar de baja material';
      case 'consume':
        return 'Registrar salida por trabajo';
    }
  });

  protected readonly origins = computed(() =>
    this.locations().filter((l) => l.id !== this.data.locationId),
  );

  /** null cuando no hay límite de stock (añadir). */
  protected readonly available = computed<Map<string, number> | null>(() =>
    this.data.kind === 'add' ? null : this.sourceStock(),
  );

  protected readonly errors = computed(() => validateLines(this.lines(), this.available()));

  private readonly itemNames = computed(() => new Map(this.items().map((i) => [i.id, i.name])));

  protected readonly candidates = computed(() => {
    const q = normalizeText(this.search());
    const av = this.available();
    const taken = new Set(this.lines().map((l) => l.itemId));
    return this.items().filter(
      (i) =>
        !taken.has(i.id) &&
        (!av || (av.get(i.id) ?? 0) > 0) &&
        (!q || normalizeText(i.name).includes(q) || normalizeText(i.reference ?? '').includes(q)),
    );
  });

  private sourceSeq = 0;

  /**
   * Un id por instancia del diálogo, reenviado en cada intento de Confirmar: si la respuesta
   * se perdió tras el commit, el reintento no duplica la operación.
   */
  private readonly operationId = crypto.randomUUID();

  ngOnInit(): void {
    void this.pending.run(() => this.init());
  }

  private async init(): Promise<void> {
    try {
      const [locations, types, items] = await Promise.all([
        this.catalog.locations(),
        this.catalog.itemTypes(),
        this.catalog.items(),
      ]);
      this.locations.set(locations);
      this.types.set(types);
      this.items.set(items);
      if (this.data.kind === 'remove' || this.data.kind === 'consume') {
        await this.loadSource(this.data.locationId);
      }
    } catch (e) {
      this.loadError.set(dbErrorMessage(e));
    }
  }

  /** `refresh`: conserva el stock actual hasta tener el nuevo (evita marcar todas las líneas). */
  private async loadSource(locationId: string, refresh = false): Promise<void> {
    const seq = ++this.sourceSeq;
    if (!refresh) this.sourceStock.set(new Map());
    try {
      const rows = await this.stockService.byLocation(locationId);
      if (seq !== this.sourceSeq) return;
      this.sourceStock.set(new Map(rows.map((r) => [r.itemId, r.quantity])));
    } catch (e) {
      if (seq === this.sourceSeq) this.loadError.set(dbErrorMessage(e));
    }
  }

  protected setOrigin(id: string): void {
    this.originId.set(id);
    this.lines.set([]);
    this.error.set('');
    void this.loadSource(id);
  }

  /** Evita que el autocompletado escriba el id del artículo en el campo. */
  protected readonly noDisplay = () => '';

  protected pickItem(itemId: string): void {
    this.lines.update((ls) => addLine(ls, itemId));
  }

  protected removeLine(itemId: string): void {
    this.lines.update((ls) => ls.filter((l) => l.itemId !== itemId));
  }

  protected setQuantity(itemId: string, raw: string): void {
    const quantity = raw.trim() === '' ? NaN : Number(raw);
    this.lines.update((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, quantity } : l)));
  }

  protected itemName(id: string): string {
    return this.itemNames().get(id) ?? 'Artículo';
  }

  protected async createItem(): Promise<void> {
    if (this.createBusy()) return;
    this.createBusy.set(true);
    this.createError.set('');
    const name = this.newName().trim();
    const typeId = this.newType();
    const reference = this.newRef().trim() || null;
    try {
      const id = await this.catalog.createItem(name, typeId, reference);
      this.items.update((is) => [...is, { id, name, typeId, reference, active: true }]);
      this.pickItem(id);
      this.creating.set(false);
      this.newName.set('');
      this.newRef.set('');
    } catch (e) {
      this.createError.set(dbErrorMessage(e));
    } finally {
      this.createBusy.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (this.busy() || this.errors().size > 0) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.operations.perform({
        ...buildPayload({
          kind: this.data.kind,
          locationId: this.data.locationId,
          originId: this.originId() || undefined,
          reference: this.reference(),
          notes: this.notes(),
          lines: this.lines(),
        }),
        operationId: this.operationId,
      });
      this.snackBar.open('Operación registrada', 'Cerrar', { duration: 4000 });
      this.ref.close(true);
    } catch (e) {
      this.error.set(dbErrorMessage(e, this.itemNames()));
      this.busy.set(false);
      // El stock cambió desde que se abrió el diálogo: se recarga para que la validación
      // local use la disponibilidad real.
      const source = this.data.kind === 'move' ? this.originId() : this.data.locationId;
      if ((e as { message?: string } | null)?.message === 'insufficient_stock' && source) {
        void this.pending.run(() => this.loadSource(source, true));
      }
    }
  }
}

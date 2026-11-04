import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PendingTasks,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Item, Location, OperationKind, Profile } from '../../data/models';
import { formatDay, parseDay } from '../../shared/dates';
import { operationKindLabel } from '../../shared/format';
import { HistoryView, KINDS } from './history-view';

export interface HistoryFiltersPanelData {
  view: HistoryView;
  locations: Location[];
  items: Item[];
  profiles: Profile[];
  /** Cuántos movimientos saldrían con estos filtros. */
  count: (view: HistoryView) => Promise<number>;
}

type TextKey = 'originId' | 'destinationId' | 'itemId' | 'userId';

/** Panel con los filtros del historial. Devuelve lo elegido solo si se confirma. */
@Component({
  selector: 'app-history-filters-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  styles: `
    :host {
      --mat-form-field-container-height: 36px;
      --mat-form-field-container-vertical-padding: 6px;
      --mat-form-field-container-text-size: 14px;
      --mat-form-field-container-text-line-height: 20px;
      --mat-form-field-outlined-label-text-size: 14px;
      --mat-select-trigger-text-size: 14px;
      --mat-select-trigger-text-line-height: 20px;
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-right: 16px;
    }
    .label {
      margin: 0 0 6px;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    .kinds {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    mat-form-field {
      width: 100%;
      margin-bottom: 12px;
    }
    .dates {
      display: flex;
      gap: 8px;
    }
    .apply {
      width: 100%;
    }
  `,
  template: `
    <div class="head">
      <h2 mat-dialog-title>Filtros</h2>
      <button mat-button type="button" (click)="clear()">Limpiar</button>
    </div>
    <mat-dialog-content>
      <p class="label">Tipo</p>
      <div class="kinds">
        @for (k of kinds; track k) {
          <button
            class="app-chip"
            type="button"
            [attr.aria-pressed]="isKindSelected(k)"
            (click)="toggleKind(k)"
          >
            {{ kindLabel(k) }}
          </button>
        }
      </div>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Referencia</mat-label>
        <input
          matInput
          name="reference"
          type="search"
          [value]="draft().reference ?? ''"
          (change)="setReference($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Origen</mat-label>
        <mat-select
          [value]="draft().originId ?? ''"
          (selectionChange)="setText('originId', $event.value)"
        >
          <mat-option value="">Todos</mat-option>
          @for (l of data.locations; track l.id) {
            <mat-option [value]="l.id">{{ l.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Destino</mat-label>
        <mat-select
          [value]="draft().destinationId ?? ''"
          (selectionChange)="setText('destinationId', $event.value)"
        >
          <mat-option value="">Todos</mat-option>
          @for (l of data.locations; track l.id) {
            <mat-option [value]="l.id">{{ l.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Artículo</mat-label>
        <mat-select
          [value]="draft().itemId ?? ''"
          (selectionChange)="setText('itemId', $event.value)"
        >
          <mat-option value="">Todos</mat-option>
          @for (i of data.items; track i.id) {
            <mat-option [value]="i.id">{{ i.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Usuario</mat-label>
        <mat-select
          [value]="draft().userId ?? ''"
          (selectionChange)="setText('userId', $event.value)"
        >
          <mat-option value="">Todos</mat-option>
          @for (u of data.profiles; track u.id) {
            <mat-option [value]="u.id">{{ u.displayName }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <div class="dates">
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Desde</mat-label>
          <input
            matInput
            name="from"
            type="date"
            [value]="dayValue(draft().from)"
            (change)="setDay('from', $any($event.target).value)"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" subscriptSizing="dynamic">
          <mat-label>Hasta</mat-label>
          <input
            matInput
            name="to"
            type="date"
            [value]="dayValue(draft().to)"
            (change)="setDay('to', $any($event.target).value)"
          />
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button class="apply" mat-flat-button type="button" (click)="apply()">
        {{ applyLabel() }}
      </button>
    </mat-dialog-actions>
  `,
})
export class HistoryFiltersPanelComponent {
  protected readonly data = inject<HistoryFiltersPanelData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<HistoryFiltersPanelComponent, HistoryView>);
  private readonly pending = inject(PendingTasks);

  protected readonly kinds = KINDS;
  protected readonly kindLabel = operationKindLabel;
  protected readonly draft = signal<HistoryView>(this.data.view);

  private readonly total = signal<number | null>(null);
  protected readonly applyLabel = computed(() => {
    const total = this.total();
    if (total === null) return 'Ver movimientos';
    return total === 1 ? 'Ver 1 movimiento' : `Ver ${total} movimientos`;
  });

  private countSeq = 0;

  constructor() {
    effect(() => {
      const view = this.draft();
      void this.pending.run(() => this.loadCount(view));
    });
  }

  protected dayValue(d: Date | undefined): string {
    return d ? formatDay(d) : '';
  }

  protected isKindSelected(kind: OperationKind): boolean {
    return this.draft().kinds?.includes(kind) ?? false;
  }

  protected toggleKind(kind: OperationKind): void {
    const toggled = (k: OperationKind) =>
      k === kind ? !this.isKindSelected(k) : this.isKindSelected(k);
    const kinds = KINDS.filter(toggled);
    this.patch({ kinds: kinds.length > 0 ? kinds : undefined });
  }

  protected setReference(value: string): void {
    this.patch({ reference: value.trim() || undefined });
  }

  protected setText(key: TextKey, value: string): void {
    this.patch({ [key]: value || undefined });
  }

  protected setDay(key: 'from' | 'to', value: string): void {
    this.patch({ [key]: parseDay(value) });
  }

  protected clear(): void {
    const { period } = this.draft();
    this.draft.set(period ? { period } : {});
  }

  protected apply(): void {
    this.dialogRef.close(this.draft());
  }

  /** Los filtros sin valor se quitan: la vista solo guarda lo que está activo. */
  private patch(change: Partial<HistoryView>): void {
    const next: HistoryView = { ...this.draft(), ...change };
    for (const key of Object.keys(change) as (keyof HistoryView)[]) {
      if (next[key] === undefined) delete next[key];
    }
    this.draft.set(next);
  }

  private async loadCount(view: HistoryView): Promise<void> {
    const seq = ++this.countSeq;
    this.total.set(null);
    try {
      const total = await this.data.count(view);
      if (seq === this.countSeq) this.total.set(total);
    } catch {
      // La cuenta es accesoria: sin ella el botón sigue funcionando, solo que sin número.
    }
  }
}

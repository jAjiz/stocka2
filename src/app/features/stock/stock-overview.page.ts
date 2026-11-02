import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  PendingTasks,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { dbErrorMessage } from '../../core/db-errors';
import { CatalogService } from '../../data/catalog.service';
import { Item, ItemType, Location, StockRow } from '../../data/models';
import { StockService } from '../../data/stock.service';
import { normalizeText } from '../../shared/format';

interface ItemRow {
  id: string;
  name: string;
  reference: string | null;
  typeId: string;
  typeName: string;
  quantities: Map<string, number>;
}

@Component({
  selector: 'app-stock-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .filters mat-form-field {
      flex: 1 1 220px;
    }
    .table-wrap {
      overflow-x: auto;
    }
    table {
      width: 100%;
    }
    .num {
      text-align: right;
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card-body {
      padding: 12px 16px;
    }
    .name {
      font: var(--mat-sys-title-medium);
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .qtys {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 16px;
      margin-top: 8px;
    }
    .qtys .q {
      text-align: right;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h1>Stock global</h1>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="filters">
      <mat-form-field>
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="search"
          placeholder="Nombre o referencia"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field>
        <mat-label>Tipo</mat-label>
        <mat-select [value]="typeFilter()" (selectionChange)="typeFilter.set($event.value)">
          <mat-option value="">Todos</mat-option>
          @for (t of types(); track t.id) {
            <mat-option [value]="t.id">{{ t.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>

    @if (!loaded()) {
      <p role="status">Cargando…</p>
    } @else if (filtered().length === 0 && !error()) {
      <p>No hay artículos que mostrar.</p>
    }

    @if (isHandset()) {
      <div class="cards">
        @for (r of filtered(); track r.id) {
          <mat-card appearance="outlined">
            <div class="card-body">
              <div class="name">{{ r.name }}</div>
              <div class="meta">{{ r.typeName }}</div>
              <div class="qtys">
                @for (l of locations(); track l.id) {
                  <span>{{ l.name }}</span>
                  <span class="q">{{ r.quantities.get(l.id) ?? 0 }}</span>
                }
              </div>
            </div>
          </mat-card>
        }
      </div>
    } @else {
      <div class="table-wrap">
        <table mat-table [dataSource]="filtered()">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>Artículo</th>
            <td mat-cell *matCellDef="let r">{{ r.name }}</td>
          </ng-container>
          <ng-container matColumnDef="typeName">
            <th mat-header-cell *matHeaderCellDef>Tipo</th>
            <td mat-cell *matCellDef="let r">{{ r.typeName }}</td>
          </ng-container>
          @for (l of locations(); track l.id) {
            <ng-container [matColumnDef]="'loc-' + l.id">
              <th mat-header-cell *matHeaderCellDef class="num">{{ l.name }}</th>
              <td mat-cell *matCellDef="let r" class="num">{{ r.quantities.get(l.id) ?? 0 }}</td>
            </ng-container>
          }
          <tr mat-header-row *matHeaderRowDef="columns()"></tr>
          <tr mat-row *matRowDef="let row; columns: columns()"></tr>
        </table>
      </div>
    }
  `,
})
export class StockOverviewPage {
  private readonly catalog = inject(CatalogService);
  private readonly stockService = inject(StockService);

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly locations = signal<Location[]>([]);
  protected readonly types = signal<ItemType[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly search = signal('');
  protected readonly typeFilter = signal('');

  private readonly items = signal<Item[]>([]);
  private readonly stock = signal<StockRow[]>([]);

  protected readonly columns = computed(() => [
    'name',
    'typeName',
    ...this.locations().map((l) => 'loc-' + l.id),
  ]);

  private readonly rows = computed<ItemRow[]>(() => {
    const types = new Map(this.types().map((t) => [t.id, t.name]));
    const byItem = new Map<string, Map<string, number>>();
    for (const s of this.stock()) {
      let m = byItem.get(s.itemId);
      if (!m) byItem.set(s.itemId, (m = new Map()));
      m.set(s.locationId, s.quantity);
    }
    return this.items().map((i) => ({
      id: i.id,
      name: i.name,
      reference: i.reference,
      typeId: i.typeId,
      typeName: types.get(i.typeId) ?? '',
      quantities: byItem.get(i.id) ?? new Map<string, number>(),
    }));
  });

  protected readonly filtered = computed<ItemRow[]>(() => {
    const q = normalizeText(this.search());
    const type = this.typeFilter();
    return this.rows().filter(
      (r) =>
        (!type || r.typeId === type) &&
        (!q || normalizeText(r.name).includes(q) || normalizeText(r.reference ?? '').includes(q)),
    );
  });

  constructor() {
    void inject(PendingTasks).run(() => this.load());
  }

  private async load(): Promise<void> {
    try {
      const [locations, types, items, stock] = await Promise.all([
        this.catalog.locations(),
        this.catalog.itemTypes(),
        this.catalog.items(),
        this.stockService.all(),
      ]);
      this.locations.set(locations);
      this.types.set(types);
      this.items.set(items);
      this.stock.set(stock);
    } catch (e) {
      this.error.set(dbErrorMessage(e));
    } finally {
      this.loaded.set(true);
    }
  }
}

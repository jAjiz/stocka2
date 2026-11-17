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
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { dbErrorMessage } from '../../core/db-errors';
import { CatalogService } from '../../data/catalog.service';
import { GlobalAlertsStore } from '../../data/global-alerts.store';
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
  total: number;
}

@Component({
  selector: 'app-stock-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTableModule],
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 16px;
    }
    .filters mat-form-field {
      flex: 1 1 220px;
    }
    .filters .only-alerts {
      align-self: center;
    }
    .only-alerts[aria-pressed='true'] {
      background: var(--app-error-container);
      color: var(--app-on-error-container);
    }
    td.total {
      font-weight: 600;
    }
    td.total.warning {
      background: var(--app-warning-container);
      color: var(--app-warning);
    }
    td.total.critical {
      background: var(--app-error-container);
      color: var(--app-on-error-container);
    }
    @media (min-width: 600px) {
      .filters mat-form-field {
        max-width: 320px;
      }
    }
    .table-wrap {
      overflow-x: auto;
    }
    .reference {
      white-space: nowrap;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    <div class="filters">
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Buscar</mat-label>
        <input
          matInput
          type="search"
          placeholder="Nombre o referencia"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
      </mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic">
        <mat-label>Tipo</mat-label>
        <mat-select [value]="typeFilter()" (selectionChange)="typeFilter.set($event.value)">
          <mat-option value="">Todos</mat-option>
          @for (t of types(); track t.id) {
            <mat-option [value]="t.id">{{ t.name }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (globalAlerts.count() > 0) {
        <button
          mat-stroked-button
          type="button"
          class="only-alerts"
          [attr.aria-pressed]="onlyAlerts()"
          (click)="onlyAlerts.set(!onlyAlerts())"
        >
          Solo con aviso ({{ globalAlerts.count() }})
        </button>
      }
    </div>

    @if (!loaded()) {
      <p role="status">Cargando…</p>
    }

    <div class="table-wrap">
      <table class="app-table" mat-table [dataSource]="filtered()">
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef>Artículo</th>
          <td mat-cell *matCellDef="let r">
            {{ r.name }}
            @if (isHandset() && r.reference) {
              <div class="sub">{{ r.reference }}</div>
            }
          </td>
        </ng-container>
        <ng-container matColumnDef="reference">
          <th mat-header-cell *matHeaderCellDef>Referencia</th>
          <td mat-cell *matCellDef="let r" class="reference">{{ r.reference }}</td>
        </ng-container>
        <ng-container matColumnDef="typeName">
          <th mat-header-cell *matHeaderCellDef>Tipo</th>
          <td mat-cell *matCellDef="let r">{{ r.typeName }}</td>
        </ng-container>
        <ng-container matColumnDef="total">
          <th mat-header-cell *matHeaderCellDef class="num">Total</th>
          <td
            mat-cell
            *matCellDef="let r"
            class="num total"
            [class.warning]="globalAlerts.byItem().get(r.id)?.level === 'warning'"
            [class.critical]="globalAlerts.byItem().get(r.id)?.level === 'critical'"
            [attr.title]="alertTitle(r.id)"
          >
            {{ r.total }}
          </td>
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
  `,
})
export class StockOverviewPage {
  private readonly catalog = inject(CatalogService);
  private readonly stockService = inject(StockService);
  protected readonly globalAlerts = inject(GlobalAlertsStore);

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
  protected readonly onlyAlerts = signal(false);

  private readonly items = signal<Item[]>([]);
  private readonly stock = signal<StockRow[]>([]);

  /**
   * En móvil se quita el tipo para dejar sitio a las cantidades de cada localización, y la
   * referencia pasa a ir bajo el nombre.
   */
  protected readonly columns = computed(() => [
    'name',
    ...(this.isHandset() ? [] : ['reference', 'typeName']),
    'total',
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
    return this.items().map((i) => {
      const quantities = byItem.get(i.id) ?? new Map<string, number>();
      let total = 0;
      for (const q of quantities.values()) total += q;
      return {
        id: i.id,
        name: i.name,
        reference: i.reference,
        typeId: i.typeId,
        typeName: types.get(i.typeId) ?? '',
        quantities,
        total,
      };
    });
  });

  protected readonly filtered = computed<ItemRow[]>(() => {
    const q = normalizeText(this.search());
    const type = this.typeFilter();
    // Sin avisos el botón desaparece; el filtro deja de aplicarse para no dejar la tabla vacía.
    const alerts =
      this.onlyAlerts() && this.globalAlerts.count() > 0 ? this.globalAlerts.byItem() : null;
    return this.rows().filter(
      (r) =>
        (!type || r.typeId === type) &&
        (!alerts || alerts.has(r.id)) &&
        (!q || normalizeText(r.name).includes(q) || normalizeText(r.reference ?? '').includes(q)),
    );
  });

  constructor() {
    void inject(PendingTasks).run(() => this.load());
  }

  protected alertTitle(itemId: string): string | null {
    const a = this.globalAlerts.byItem().get(itemId);
    if (!a) return null;
    return `Aviso ${a.level === 'critical' ? 'grave' : 'leve'}: umbral ${a.threshold}`;
  }

  private async load(): Promise<void> {
    // Los avisos son accesorios: se cargan aparte y no bloquean la tabla.
    void this.globalAlerts.refresh();
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

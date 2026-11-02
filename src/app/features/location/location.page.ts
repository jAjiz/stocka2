import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  PendingTasks,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { AuthService } from '../../core/auth.service';
import { dbErrorMessage } from '../../core/db-errors';
import { CatalogService } from '../../data/catalog.service';
import { Item, ItemType, OperationKind, StockRow } from '../../data/models';
import { StockService } from '../../data/stock.service';
import { normalizeText } from '../../shared/format';
import { OperationFormComponent } from './operation-form.component';

interface Line {
  itemId: string;
  name: string;
  reference: string | null;
  typeId: string;
  typeName: string;
  quantity: number;
}

@Component({
  selector: 'app-location-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
  ],
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .filters mat-form-field {
      flex: 1 1 220px;
    }
    .cards {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .card-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
    }
    .name {
      font: var(--mat-sys-title-medium);
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .qty {
      font: var(--mat-sys-display-small);
    }
    table {
      width: 100%;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    @if (!allowed()) {
      <h1>Localización</h1>
      <p>No tienes acceso a esta localización</p>
      <a mat-button routerLink="/">Volver a Inicio</a>
    } @else {
      <h1>{{ locationName() }}</h1>
      <div class="actions">
        <button mat-flat-button type="button" (click)="openForm('add')">Añadir</button>
        <button mat-stroked-button type="button" (click)="openForm('move')">Traer aquí</button>
        <button mat-stroked-button type="button" (click)="openForm('remove')">Baja</button>
        <button mat-stroked-button type="button" (click)="openForm('consume')">
          Salida por trabajo
        </button>
        <a mat-stroked-button routerLink="/historial" [queryParams]="{ locationId: locationId() }">
          Ver historial
        </a>
      </div>

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
        <p class="loading" role="status">Cargando…</p>
      }

      @if (filtered().length === 0 && loaded() && !error()) {
        <p>No hay artículos que mostrar.</p>
      }

      @if (isHandset()) {
        <div class="cards">
          @for (l of filtered(); track l.itemId) {
            <mat-card appearance="outlined">
              <div class="card-row">
                <div>
                  <div class="name">{{ l.name }}</div>
                  <div class="meta">{{ l.typeName }}</div>
                </div>
                <div class="qty">{{ l.quantity }}</div>
              </div>
            </mat-card>
          }
        </div>
      } @else {
        <table mat-table matSort [dataSource]="filtered()" (matSortChange)="sort.set($event)">
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Artículo</th>
            <td mat-cell *matCellDef="let l">{{ l.name }}</td>
          </ng-container>
          <ng-container matColumnDef="reference">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Referencia</th>
            <td mat-cell *matCellDef="let l">{{ l.reference }}</td>
          </ng-container>
          <ng-container matColumnDef="typeName">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Tipo</th>
            <td mat-cell *matCellDef="let l">{{ l.typeName }}</td>
          </ng-container>
          <ng-container matColumnDef="quantity">
            <th mat-header-cell *matHeaderCellDef mat-sort-header>Cantidad</th>
            <td mat-cell *matCellDef="let l">{{ l.quantity }}</td>
          </ng-container>
          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      }
    }
  `,
})
export class LocationPage {
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogService);
  private readonly stockService = inject(StockService);
  private readonly pending = inject(PendingTasks);
  private readonly dialog = inject(MatDialog);

  protected readonly columns = ['name', 'reference', 'typeName', 'quantity'];

  private readonly locationId = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('id') ?? '')),
    { initialValue: '' },
  );
  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly allowed = computed(() => this.auth.canOperate(this.locationId()));
  protected readonly locationName = signal('');
  protected readonly types = signal<ItemType[]>([]);
  protected readonly error = signal('');
  protected readonly loaded = signal(false);
  protected readonly search = signal('');
  protected readonly typeFilter = signal('');
  protected readonly sort = signal<Sort>({ active: 'name', direction: 'asc' });

  private readonly items = signal<Item[]>([]);
  private readonly stock = signal<StockRow[]>([]);

  private readonly lines = computed<Line[]>(() => {
    const items = new Map(this.items().map((i) => [i.id, i]));
    const types = new Map(this.types().map((t) => [t.id, t.name]));
    const out: Line[] = [];
    for (const s of this.stock()) {
      const item = items.get(s.itemId);
      if (!item) continue;
      out.push({
        itemId: item.id,
        name: item.name,
        reference: item.reference,
        typeId: item.typeId,
        typeName: types.get(item.typeId) ?? '',
        quantity: s.quantity,
      });
    }
    return out;
  });

  protected readonly filtered = computed<Line[]>(() => {
    const q = normalizeText(this.search());
    const type = this.typeFilter();
    const { active, direction } = this.sort();
    const rows = this.lines().filter(
      (l) =>
        (!type || l.typeId === type) &&
        (!q || normalizeText(l.name).includes(q) || normalizeText(l.reference ?? '').includes(q)),
    );
    const dir = direction === 'desc' ? -1 : 1;
    const key = (active || 'name') as keyof Line;
    return rows.sort((a, b) => {
      const x = a[key] ?? '';
      const y = b[key] ?? '';
      const c =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'es');
      return c * dir;
    });
  });

  constructor() {
    effect(() => {
      const id = this.locationId();
      untracked(() => void this.pending.run(() => this.load(id)));
    });
  }

  protected openForm(kind: OperationKind): void {
    if (this.dialog.openDialogs.length > 0) return;
    const handset = this.isHandset();
    this.dialog
      .open(OperationFormComponent, {
        data: { kind, locationId: this.locationId() },
        disableClose: true,
        ...(handset
          ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh' }
          : { width: '560px', maxWidth: '95vw' }),
      })
      .afterClosed()
      .subscribe((done) => {
        if (done) void this.pending.run(() => this.load(this.locationId(), true));
      });
  }

  private requestSeq = 0;

  /** `refresh`: recarga la misma localización conservando las filas actuales hasta tener las nuevas. */
  private async load(id: string, refresh = false): Promise<void> {
    const seq = ++this.requestSeq;
    const stale = () => seq !== this.requestSeq;
    this.loaded.set(false);
    this.error.set('');
    if (!refresh) {
      this.locationName.set('');
      this.items.set([]);
      this.stock.set([]);
    }
    if (!this.auth.canOperate(id)) {
      this.loaded.set(true);
      return;
    }
    try {
      const [locations, types, items, stock] = await Promise.all([
        this.catalog.locations(),
        this.catalog.itemTypes(),
        this.catalog.items(),
        this.stockService.byLocation(id),
      ]);
      if (stale()) return;
      this.locationName.set(locations.find((l) => l.id === id)?.name ?? 'Localización');
      this.types.set(types);
      this.items.set(items);
      this.stock.set(stock);
    } catch (e) {
      if (!stale()) this.error.set(dbErrorMessage(e));
    } finally {
      if (!stale()) this.loaded.set(true);
    }
  }
}

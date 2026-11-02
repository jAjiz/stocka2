import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
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
import { ActivatedRoute, Params, Router } from '@angular/router';
import { map } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { dbErrorMessage } from '../../core/db-errors';
import { CatalogService } from '../../data/catalog.service';
import { Item, Location, OperationKind, OperationSummary, Profile } from '../../data/models';
import { HistoryFilters, OperationsService } from '../../data/operations.service';
import { formatDay, parseDay } from '../../shared/dates';
import { formatDateTime, operationKindLabel } from '../../shared/format';
import { OperationDetailComponent, OperationDetailData } from './operation-detail.component';

const KINDS: OperationKind[] = ['add', 'move', 'remove', 'consume'];
const PAGE_SIZE = 50;
const TEXT_KEYS = [
  'locationId',
  'originId',
  'destinationId',
  'itemId',
  'userId',
  'reference',
] as const;

/** Los filtros viven en la URL; `to` es el día elegido (inclusivo). */
export function toQueryParams(f: HistoryFilters): Params {
  const p: Params = {};
  if (f.kind) p['kind'] = f.kind;
  for (const k of TEXT_KEYS) if (f[k]) p[k] = f[k];
  if (f.from) p['from'] = formatDay(f.from);
  if (f.to) p['to'] = formatDay(f.to);
  return p;
}

export function fromQueryParams(p: Params): HistoryFilters {
  const str = (k: string): string | undefined => {
    const v = p[k];
    return typeof v === 'string' && v !== '' ? v : undefined;
  };
  const f: HistoryFilters = {};
  const kind = str('kind');
  if (kind && (KINDS as string[]).includes(kind)) f.kind = kind as OperationKind;
  for (const k of TEXT_KEYS) {
    const v = str(k);
    if (v) f[k] = v;
  }
  const from = parseDay(str('from'));
  if (from) f.from = from;
  const to = parseDay(str('to'));
  if (to) f.to = to;
  return f;
}

@Component({
  selector: 'app-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTableModule,
  ],
  styles: `
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      padding-top: 8px;
    }
    .filters mat-form-field {
      flex: 1 1 200px;
    }
    table {
      width: 100%;
    }
    tr.mat-mdc-row {
      cursor: pointer;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 12px 0;
    }
    .list button {
      text-align: left;
      width: 100%;
      padding: 12px 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface);
      color: var(--mat-sys-on-surface);
      font: inherit;
      cursor: pointer;
    }
    .kind {
      font: var(--mat-sys-title-medium);
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h1>Historial</h1>

    <ng-template #filtersForm>
      <div class="filters">
        <mat-form-field>
          <mat-label>Tipo</mat-label>
          <mat-select
            [value]="filters().kind ?? ''"
            (selectionChange)="setFilter('kind', $event.value)"
          >
            <mat-option value="">Todos</mat-option>
            @for (k of kinds; track k) {
              <mat-option [value]="k">{{ kindLabel(k) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Localización (origen o destino)</mat-label>
          <mat-select
            [value]="filters().locationId ?? ''"
            (selectionChange)="setFilter('locationId', $event.value)"
          >
            <mat-option value="">Todas</mat-option>
            @for (l of locations(); track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Origen</mat-label>
          <mat-select
            [value]="filters().originId ?? ''"
            (selectionChange)="setFilter('originId', $event.value)"
          >
            <mat-option value="">Todos</mat-option>
            @for (l of locations(); track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Destino</mat-label>
          <mat-select
            [value]="filters().destinationId ?? ''"
            (selectionChange)="setFilter('destinationId', $event.value)"
          >
            <mat-option value="">Todos</mat-option>
            @for (l of locations(); track l.id) {
              <mat-option [value]="l.id">{{ l.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Artículo</mat-label>
          <mat-select
            [value]="filters().itemId ?? ''"
            (selectionChange)="setFilter('itemId', $event.value)"
          >
            <mat-option value="">Todos</mat-option>
            @for (i of items(); track i.id) {
              <mat-option [value]="i.id">{{ i.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Usuario</mat-label>
          <mat-select
            [value]="filters().userId ?? ''"
            (selectionChange)="setFilter('userId', $event.value)"
          >
            <mat-option value="">Todos</mat-option>
            @for (u of profiles(); track u.id) {
              <mat-option [value]="u.id">{{ u.displayName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>Desde</mat-label>
          <input
            matInput
            type="date"
            [value]="fromValue()"
            (change)="setFilter('from', $any($event.target).value)"
          />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Hasta</mat-label>
          <input
            matInput
            type="date"
            [value]="toValue()"
            (change)="setFilter('to', $any($event.target).value)"
          />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Referencia</mat-label>
          <input
            matInput
            type="search"
            [value]="filters().reference ?? ''"
            (change)="setFilter('reference', $any($event.target).value.trim())"
          />
        </mat-form-field>
      </div>
    </ng-template>

    @if (isHandset()) {
      <mat-expansion-panel>
        <mat-expansion-panel-header>
          <mat-panel-title>Filtros</mat-panel-title>
        </mat-expansion-panel-header>
        <ng-container [ngTemplateOutlet]="filtersForm" />
      </mat-expansion-panel>
    } @else {
      <ng-container [ngTemplateOutlet]="filtersForm" />
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (!loaded()) {
      <p role="status">Cargando…</p>
    } @else if (rows().length === 0 && !error()) {
      <p>No hay operaciones que mostrar.</p>
    }

    @if (isHandset()) {
      <div class="list">
        @for (r of rows(); track r.id) {
          <button type="button" (click)="open(r)">
            <div class="kind">{{ kindLabel(r.kind) }}</div>
            <div class="meta">{{ locationsText(r) }}</div>
            <div class="meta">{{ date(r) }} · {{ userName(r.userId) }}</div>
          </button>
        }
      </div>
    } @else {
      <table mat-table [dataSource]="rows()">
        <ng-container matColumnDef="date">
          <th mat-header-cell *matHeaderCellDef>Fecha</th>
          <td mat-cell *matCellDef="let r">{{ date(r) }}</td>
        </ng-container>
        <ng-container matColumnDef="kind">
          <th mat-header-cell *matHeaderCellDef>Tipo</th>
          <td mat-cell *matCellDef="let r">{{ kindLabel(r.kind) }}</td>
        </ng-container>
        <ng-container matColumnDef="origin">
          <th mat-header-cell *matHeaderCellDef>Origen</th>
          <td mat-cell *matCellDef="let r">{{ locationName(r.originId) }}</td>
        </ng-container>
        <ng-container matColumnDef="destination">
          <th mat-header-cell *matHeaderCellDef>Destino</th>
          <td mat-cell *matCellDef="let r">{{ locationName(r.destinationId) }}</td>
        </ng-container>
        <ng-container matColumnDef="user">
          <th mat-header-cell *matHeaderCellDef>Usuario</th>
          <td mat-cell *matCellDef="let r">{{ userName(r.userId) }}</td>
        </ng-container>
        <ng-container matColumnDef="reference">
          <th mat-header-cell *matHeaderCellDef>Referencia</th>
          <td mat-cell *matCellDef="let r">{{ r.reference }}</td>
        </ng-container>
        <ng-container matColumnDef="lineCount">
          <th mat-header-cell *matHeaderCellDef>Nº artículos</th>
          <td mat-cell *matCellDef="let r">{{ r.lineCount }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns" (click)="open(row)"></tr>
      </table>
    }

    <mat-paginator
      [length]="total()"
      [pageSize]="pageSize"
      [pageIndex]="page()"
      [hidePageSize]="true"
      (page)="onPage($event)"
    />
  `,
})
export class HistoryPage {
  private readonly catalog = inject(CatalogService);
  private readonly operations = inject(OperationsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly pending = inject(PendingTasks);

  protected readonly kinds = KINDS;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly columns = [
    'date',
    'kind',
    'origin',
    'destination',
    'user',
    'reference',
    'lineCount',
  ];

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly filters = toSignal(
    this.route.queryParams.pipe(map((p) => fromQueryParams(p))),
    { initialValue: fromQueryParams(this.route.snapshot?.queryParams ?? {}) },
  );
  protected readonly fromValue = computed(() => {
    const d = this.filters().from;
    return d ? formatDay(d) : '';
  });
  protected readonly toValue = computed(() => {
    const d = this.filters().to;
    return d ? formatDay(d) : '';
  });

  protected readonly page = signal(0);
  protected readonly rows = signal<OperationSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  protected readonly locations = signal<Location[]>([]);
  protected readonly profiles = signal<Profile[]>([]);
  protected readonly items = signal<Item[]>([]);

  private readonly locationNames = computed(
    () => new Map(this.locations().map((l) => [l.id, l.name])),
  );
  private readonly userNames = computed(
    () => new Map(this.profiles().map((u) => [u.id, u.displayName])),
  );
  private readonly itemNames = computed(() => new Map(this.items().map((i) => [i.id, i.name])));

  private requestSeq = 0;

  constructor() {
    void this.pending.run(() => this.loadCatalog());
    effect(() => {
      const f = this.filters();
      const page = this.page();
      untracked(() => void this.pending.run(() => this.load(f, page)));
    });
  }

  protected readonly kindLabel = operationKindLabel;

  protected date(r: OperationSummary): string {
    return formatDateTime(r.createdAt);
  }

  protected locationName(id: string | null): string {
    return id ? (this.locationNames().get(id) ?? 'Desconocida') : '';
  }

  protected userName(id: string): string {
    return this.userNames().get(id) ?? 'Desconocido';
  }

  protected locationsText(r: OperationSummary): string {
    const o = this.locationName(r.originId);
    const d = this.locationName(r.destinationId);
    return o && d ? `${o} → ${d}` : o || d;
  }

  protected setFilter(key: keyof HistoryFilters, value: string): void {
    const p: Params = { ...toQueryParams(this.filters()) };
    if (value) p[key] = value;
    else delete p[key];
    this.page.set(0);
    void this.router.navigate([], { relativeTo: this.route, queryParams: p, replaceUrl: true });
  }

  protected onPage(e: PageEvent): void {
    this.page.set(e.pageIndex);
  }

  protected open(operation: OperationSummary): void {
    if (this.dialog.openDialogs.length > 0) return;
    const data: OperationDetailData = {
      operation,
      locationNames: this.locationNames(),
      userNames: this.userNames(),
      itemNames: this.itemNames(),
    };
    this.dialog.open(OperationDetailComponent, {
      data,
      ...(this.isHandset()
        ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh' }
        : { width: '560px', maxWidth: '95vw' }),
    });
  }

  private async loadCatalog(): Promise<void> {
    try {
      const [locations, profiles, items] = await Promise.all([
        this.catalog.allLocations(),
        this.catalog.profiles(),
        this.catalog.items(),
      ]);
      this.locations.set(locations);
      this.profiles.set(profiles);
      this.items.set(items);
    } catch (e) {
      this.error.set(dbErrorMessage(e));
    }
  }

  private async load(f: HistoryFilters, page: number): Promise<void> {
    const seq = ++this.requestSeq;
    const stale = () => seq !== this.requestSeq;
    this.loaded.set(false);
    this.error.set('');
    try {
      const res = await this.operations.search(f, page, PAGE_SIZE);
      if (stale()) return;
      if (res.rows.length === 0 && page > 0) {
        // página fuera de rango (los datos cambiaron): vuelve a la primera
        this.page.set(0);
        return;
      }
      this.rows.set(res.rows);
      this.total.set(res.total);
    } catch (e) {
      if (!stale()) {
        this.rows.set([]);
        this.total.set(0);
        this.error.set(dbErrorMessage(e));
      }
    } finally {
      if (!stale()) this.loaded.set(true);
    }
  }
}

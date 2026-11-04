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
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { dbErrorMessage } from '../../core/db-errors';
import { CatalogService } from '../../data/catalog.service';
import { Item, Location, OperationKind, OperationSummary, Profile } from '../../data/models';
import { OperationsService } from '../../data/operations.service';
import { madridDay } from '../../shared/dates';
import {
  formatDayHeading,
  formatDayShort,
  formatTime,
  operationKindLabel,
} from '../../shared/format';
import {
  HistoryFiltersPanelComponent,
  HistoryFiltersPanelData,
} from './history-filters-panel.component';
import {
  activePeriod,
  fromQueryParams,
  HistoryPeriod,
  HistoryView,
  PERIODS,
  searchFilters,
  toQueryParams,
} from './history-view';
import { OperationDetailComponent, OperationDetailData } from './operation-detail.component';

const PAGE_SIZE = 50;

const KIND_ICONS: Record<OperationKind, string> = {
  add: 'add',
  move: 'swap_horiz',
  remove: 'delete',
  consume: 'output',
};

/** Un filtro activo. Los tipos tienen una etiqueta cada uno, así que `kind` dice cuál quita. */
interface FilterTag {
  key: keyof HistoryView;
  kind?: OperationKind;
  label: string;
}

@Component({
  selector: 'app-history-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatPaginatorModule],
  styles: `
    :host {
      display: block;
      max-width: 800px;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 12px;
    }
    .periods,
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .tags {
      margin-bottom: 12px;
    }
    .filters-button {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .filters-button mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 32px;
      padding: 0 8px;
      border: 0;
      border-radius: var(--app-radius);
      background: var(--app-warning-container);
      color: var(--mat-sys-on-primary-container);
      font: var(--mat-sys-label-medium);
      cursor: pointer;
    }
    .tag mat-icon {
      width: 16px;
      height: 16px;
      font-size: 16px;
    }
    .day {
      margin: 0;
      padding: 8px 12px;
      border-top: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container);
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-label-medium);
    }
    section:first-child .day {
      border-top: 0;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 12px;
      border: 0;
      border-top: 1px solid var(--mat-sys-outline-variant);
      background: transparent;
      color: var(--mat-sys-on-surface);
      font: var(--mat-sys-body-medium);
      text-align: left;
      cursor: pointer;
    }
    .row:hover {
      background: var(--mat-sys-surface-container);
    }
    .main {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .title {
      font: var(--mat-sys-title-small);
    }
    .meta {
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
    .end {
      flex: none;
      text-align: right;
    }
    mat-paginator {
      background: transparent;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <div class="toolbar">
      <div class="periods">
        @for (p of periods; track p.value) {
          <button
            class="app-chip"
            type="button"
            [attr.aria-pressed]="period() === p.value"
            (click)="setPeriod(p.value)"
          >
            {{ p.label }}
          </button>
        }
      </div>
      <button class="app-chip filters-button" type="button" (click)="openFilters()">
        <mat-icon>tune</mat-icon>Filtros
        @if (tags().length > 0) {
          · {{ tags().length }}
        }
      </button>
    </div>

    @if (tags().length > 0) {
      <div class="tags">
        @for (t of tags(); track t.label) {
          <button
            class="tag"
            type="button"
            [attr.aria-label]="'Quitar filtro ' + t.label"
            (click)="removeTag(t)"
          >
            {{ t.label }} <mat-icon>close</mat-icon>
          </button>
        }
      </div>
    }

    @if (catalogError()) {
      <p class="error" role="alert">{{ catalogError() }}</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (!loaded()) {
      <p role="status">Cargando…</p>
    } @else if (rows().length === 0 && !error()) {
      <p>No hay operaciones que mostrar.</p>
    }

    @if (groups().length > 0) {
      <div class="app-list">
        @for (g of groups(); track g.heading) {
          <section>
            <h2 class="day">{{ g.heading }}</h2>
            @for (r of g.rows; track r.id) {
              <button class="row" type="button" (click)="open(r)">
                <span class="app-list-symbol"
                  ><mat-icon>{{ kindIcon(r.kind) }}</mat-icon></span
                >
                <span class="main">
                  <div class="title">{{ rowTitle(r) }}</div>
                  <div class="meta">{{ rowDetail(r) }}</div>
                </span>
                <span class="end">
                  <div>{{ time(r) }}</div>
                  <div class="meta">{{ userName(r.userId) }}</div>
                </span>
              </button>
            }
          </section>
        }
      </div>
    }

    @if (total() > pageSize) {
      <mat-paginator
        [length]="total()"
        [pageSize]="pageSize"
        [pageIndex]="page()"
        [hidePageSize]="true"
        (page)="onPage($event)"
      />
    }
  `,
})
export class HistoryPage {
  private readonly catalog = inject(CatalogService);
  private readonly operations = inject(OperationsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  private readonly pending = inject(PendingTasks);

  protected readonly periods = PERIODS;
  protected readonly pageSize = PAGE_SIZE;

  protected readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly view = toSignal(this.route.queryParams.pipe(map((p) => fromQueryParams(p))), {
    initialValue: fromQueryParams(this.route.snapshot?.queryParams ?? {}),
  });
  protected readonly period = computed(() => activePeriod(this.view()));

  protected readonly page = signal(0);
  protected readonly rows = signal<OperationSummary[]>([]);
  protected readonly total = signal(0);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');
  protected readonly catalogError = signal('');

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

  /** Los filtros del panel que están activos. El periodo se ve aparte. */
  protected readonly tags = computed(() => {
    const v = this.view();
    const tags: FilterTag[] = [];
    if (v.reference) tags.push({ key: 'reference', label: `Ref.: ${v.reference}` });
    for (const kind of v.kinds ?? []) {
      tags.push({ key: 'kinds', kind, label: operationKindLabel(kind) });
    }
    if (v.originId)
      tags.push({ key: 'originId', label: `Origen: ${this.locationName(v.originId)}` });
    if (v.destinationId) {
      tags.push({ key: 'destinationId', label: `Destino: ${this.locationName(v.destinationId)}` });
    }
    if (v.itemId) {
      const name = this.itemNames().get(v.itemId) ?? 'Desconocido';
      tags.push({ key: 'itemId', label: `Artículo: ${name}` });
    }
    if (v.userId) tags.push({ key: 'userId', label: `Usuario: ${this.userName(v.userId)}` });
    if (v.from) tags.push({ key: 'from', label: `Desde: ${formatDayShort(v.from)}` });
    if (v.to) tags.push({ key: 'to', label: `Hasta: ${formatDayShort(v.to)}` });
    return tags;
  });

  /** Las filas llegan ordenadas por fecha, así que los días consecutivos forman cada grupo. */
  protected readonly groups = computed(() => {
    const now = new Date();
    const groups: { heading: string; rows: OperationSummary[] }[] = [];
    for (const row of this.rows()) {
      const heading = formatDayHeading(row.createdAt, now);
      const last = groups.at(-1);
      if (last?.heading === heading) last.rows.push(row);
      else groups.push({ heading, rows: [row] });
    }
    return groups;
  });

  private requestSeq = 0;

  constructor() {
    void this.pending.run(() => this.loadCatalog());
    effect(() => {
      const v = this.view();
      const page = this.page();
      untracked(() => void this.pending.run(() => this.load(v, page)));
    });
  }

  protected kindIcon(kind: OperationKind): string {
    return KIND_ICONS[kind];
  }

  protected rowTitle(r: OperationSummary): string {
    const lines = r.lineCount === 1 ? '1 artículo' : `${r.lineCount} artículos`;
    return `${operationKindLabel(r.kind)} · ${lines}`;
  }

  protected rowDetail(r: OperationSummary): string {
    const origin = r.originId ? this.locationName(r.originId) : '';
    const destination = r.destinationId ? this.locationName(r.destinationId) : '';
    const places = origin && destination ? `${origin} → ${destination}` : origin || destination;
    return r.reference ? `${places} · Ref. ${r.reference}` : places;
  }

  protected time(r: OperationSummary): string {
    return formatTime(r.createdAt);
  }

  protected userName(id: string): string {
    return this.userNames().get(id) ?? 'Desconocido';
  }

  private locationName(id: string): string {
    return this.locationNames().get(id) ?? 'Desconocida';
  }

  /** Elegir un periodo sustituye a las fechas concretas. */
  protected setPeriod(period: HistoryPeriod): void {
    const { from: _from, to: _to, ...rest } = this.view();
    this.navigate({ ...rest, period });
  }

  protected removeTag(tag: FilterTag): void {
    const next = { ...this.view() };
    const kinds = next.kinds?.filter((k) => k !== tag.kind);
    if (tag.kind && kinds?.length) next.kinds = kinds;
    else delete next[tag.key];
    this.navigate(next);
  }

  protected async openFilters(): Promise<void> {
    if (this.dialog.openDialogs.length > 0) return;
    const data: HistoryFiltersPanelData = {
      view: this.view(),
      locations: this.locations(),
      items: this.items(),
      profiles: this.profiles(),
      count: async (view) => {
        const filters = searchFilters(view, madridDay(new Date()));
        return (await this.operations.search(filters, 0, 1)).total;
      },
    };
    const chosen = await firstValueFrom(
      this.dialog
        .open<HistoryFiltersPanelComponent, HistoryFiltersPanelData, HistoryView>(
          HistoryFiltersPanelComponent,
          { data, ...this.panelPosition() },
        )
        .afterClosed(),
    );
    if (chosen) this.navigate(chosen);
  }

  /** Desde abajo en el móvil y como panel lateral en el PC. */
  private panelPosition(): MatDialogConfig {
    return this.isHandset()
      ? { position: { bottom: '0' }, width: '100vw', maxWidth: '100vw', maxHeight: '90dvh' }
      : {
          position: { top: '0', right: '0' },
          width: '380px',
          maxWidth: '95vw',
          height: '100dvh',
          maxHeight: '100dvh',
        };
  }

  private navigate(view: HistoryView): void {
    this.page.set(0);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: toQueryParams(view),
      replaceUrl: true,
    });
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
        this.catalog.allItems(),
      ]);
      this.locations.set(locations);
      this.profiles.set(profiles);
      this.items.set(items);
    } catch (e) {
      this.catalogError.set(dbErrorMessage(e));
    }
  }

  private async load(view: HistoryView, page: number): Promise<void> {
    const seq = ++this.requestSeq;
    const stale = () => seq !== this.requestSeq;
    this.loaded.set(false);
    this.error.set('');
    try {
      const filters = searchFilters(view, madridDay(new Date()));
      const res = await this.operations.search(filters, page, PAGE_SIZE);
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

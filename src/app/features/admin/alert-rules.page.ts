import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AlertsService } from '../../data/alerts.service';
import { CatalogService } from '../../data/catalog.service';
import { AlertRule, Item, Location } from '../../data/models';
import { dialogSize } from '../../shared/dialog-size';
import { AlertRuleDialogComponent, AlertRuleDialogData } from './alert-rule-dialog.component';
import { CatalogAdmin } from './catalog-admin';
import { CatalogListComponent, CatalogRow } from './catalog-list.component';

@Component({
  selector: 'app-alert-rules-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogListComponent],
  template: `
    <app-catalog-list
      addLabel="Nueva regla"
      inactiveLabel="Deshabilitada"
      [duplicable]="true"
      [rows]="rows()"
      [error]="error()"
      (add)="open(null, false)"
      (edit)="open(byId($event), false)"
      (duplicate)="open(byId($event), true)"
      (toggle)="toggle(byId($event))"
      (remove)="remove(byId($event))"
    />
  `,
})
export class AlertRulesPage extends CatalogAdmin {
  private readonly alerts = inject(AlertsService);
  private readonly catalog = inject(CatalogService);

  private readonly rules = signal<AlertRule[]>([]);
  private readonly items = signal<Item[]>([]);
  /** Todas, también las deshabilitadas, para nombrar las localizaciones de cada regla. */
  private readonly locations = signal<Location[]>([]);

  protected readonly rows = computed<CatalogRow[]>(() =>
    this.rules().map((r) => ({
      id: r.id,
      name: r.name,
      detail: this.detail(r),
      active: r.active,
    })),
  );

  constructor() {
    super();
    void this.refresh();
  }

  protected async load(): Promise<void> {
    const [rules, items, locations] = await Promise.all([
      this.alerts.rules(),
      this.catalog.items(),
      this.catalog.allLocations(),
    ]);
    this.rules.set(rules);
    this.items.set(items);
    this.locations.set(locations);
  }

  private detail(r: AlertRule): string {
    const names = r.locationIds
      .map((id) => this.locations().find((l) => l.id === id))
      .filter((l): l is Location => !!l)
      .map((l) => (l.active ? l.name : `${l.name} (deshabilitada)`));
    const levels = [
      r.warning !== null ? `Leve ≤ ${r.warning}` : null,
      r.critical !== null ? `Grave ≤ ${r.critical}` : null,
    ].filter((x) => x !== null);
    return [
      r.allItems ? 'Artículos: Todos' : `Artículos: ${r.itemIds.length}`,
      r.allLocations ? 'Localizaciones: Todas' : `Localizaciones: ${names.join(', ')}`,
      levels.join(' · '),
    ].join(' · ');
  }

  protected byId(id: string): AlertRule {
    return this.rules().find((r) => r.id === id)!;
  }

  protected async open(rule: AlertRule | null, copy: boolean): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<AlertRuleDialogComponent, AlertRuleDialogData, boolean>(AlertRuleDialogComponent, {
          data: { rule, copy, items: this.items(), locations: this.locations().filter((l) => l.active) },
          disableClose: true,
          ...dialogSize(this.isHandset()),
        })
        .afterClosed(),
    );
    if (saved) await this.refresh();
  }

  protected toggle(r: AlertRule): Promise<void> {
    return this.run(() => this.alerts.setRuleActive(r.id, !r.active));
  }

  protected async remove(r: AlertRule): Promise<void> {
    if (await this.confirmDelete(r.name)) await this.run(() => this.alerts.deleteRule(r.id));
  }
}

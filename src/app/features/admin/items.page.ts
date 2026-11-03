import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { Item, ItemType } from '../../data/models';
import { CatalogAdmin } from './catalog-admin';
import { CatalogListComponent, CatalogRow } from './catalog-list.component';

@Component({
  selector: 'app-items-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogListComponent],
  template: `
    <app-catalog-list
      addLabel="Nuevo artículo"
      [rows]="rows()"
      [error]="error()"
      (add)="open(null)"
      (edit)="open(byId($event))"
      (toggle)="toggle(byId($event))"
      (remove)="remove(byId($event))"
    />
  `,
})
export class ItemsPage extends CatalogAdmin {
  private readonly admin = inject(AdminService);
  private readonly catalog = inject(CatalogService);

  private readonly items = signal<Item[]>([]);
  private readonly types = signal<ItemType[]>([]);

  protected readonly rows = computed<CatalogRow[]>(() => {
    const typeNames = new Map(this.types().map((t) => [t.id, t.name]));
    return this.items().map((i) => ({
      id: i.id,
      name: i.name,
      detail: [typeNames.get(i.typeId), i.reference].filter(Boolean).join(' · '),
      active: i.active,
    }));
  });

  constructor() {
    super();
    void this.refresh();
  }

  protected async load(): Promise<void> {
    const [items, types] = await Promise.all([
      this.catalog.allItems(),
      this.catalog.allItemTypes(),
    ]);
    this.items.set(items);
    this.types.set(types);
  }

  protected byId(id: string): Item {
    return this.items().find((i) => i.id === id)!;
  }

  /** Se ofrecen los tipos activos y, al editar, también el tipo actual aunque esté deshabilitado. */
  protected open(i: Item | null): Promise<void> {
    return this.edit({
      title: i ? 'Editar artículo' : 'Nuevo artículo',
      fields: ['name', 'type', 'reference'],
      value: { name: i?.name ?? '', typeId: i?.typeId ?? '', reference: i?.reference ?? null },
      types: this.types().filter((t) => t.active || t.id === i?.typeId),
      save: (v) =>
        i
          ? this.admin.updateItem(i.id, v.name, v.typeId!, v.reference ?? null)
          : this.catalog.createItem(v.name, v.typeId!, v.reference ?? null),
    });
  }

  protected toggle(i: Item): Promise<void> {
    return this.run(() => this.admin.setItemActive(i.id, !i.active));
  }

  protected async remove(i: Item): Promise<void> {
    if (await this.confirmDelete(i.name)) await this.run(() => this.admin.deleteItem(i.id));
  }
}

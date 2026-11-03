import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { ItemType } from '../../data/models';
import { CatalogAdmin } from './catalog-admin';
import { CatalogListComponent, CatalogRow } from './catalog-list.component';

@Component({
  selector: 'app-item-types-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogListComponent],
  template: `
    <app-catalog-list
      addLabel="Nuevo tipo"
      [rows]="rows()"
      [error]="error()"
      (add)="open(null)"
      (edit)="open(byId($event))"
      (toggle)="toggle(byId($event))"
      (remove)="remove(byId($event))"
    />
  `,
})
export class ItemTypesPage extends CatalogAdmin {
  private readonly admin = inject(AdminService);
  private readonly catalog = inject(CatalogService);

  private readonly types = signal<ItemType[]>([]);
  protected readonly rows = computed<CatalogRow[]>(() =>
    this.types().map((t) => ({ id: t.id, name: t.name, active: t.active })),
  );

  constructor() {
    super();
    void this.refresh();
  }

  protected async load(): Promise<void> {
    this.types.set(await this.catalog.allItemTypes());
  }

  protected byId(id: string): ItemType {
    return this.types().find((t) => t.id === id)!;
  }

  protected open(t: ItemType | null): Promise<void> {
    return this.edit({
      title: t ? 'Editar tipo' : 'Nuevo tipo',
      fields: ['name'],
      value: { name: t?.name ?? '' },
      save: (v) => this.admin.saveItemType(t?.id ?? null, v.name),
    });
  }

  protected toggle(t: ItemType): Promise<void> {
    return this.run(() => this.admin.setItemTypeActive(t.id, !t.active));
  }

  protected async remove(t: ItemType): Promise<void> {
    if (await this.confirmDelete(t.name)) await this.run(() => this.admin.deleteItemType(t.id));
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { Item, ItemType } from '../../data/models';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { dialogSize } from '../../shared/dialog-size';
import { CatalogAdmin } from './catalog-admin';
import {
  ImportItemsDialogComponent,
  ImportItemsDialogData,
} from './import/import-items-dialog.component';
import { ITEMS_TEMPLATE_DOWNLOAD } from './import/items-template';
import { CatalogListComponent, CatalogRow } from './catalog-list.component';

@Component({
  selector: 'app-items-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogListComponent, MatButtonModule, MatIconModule],
  template: `
    <app-catalog-list
      addLabel="Nuevo artículo"
      [rows]="rows()"
      [error]="error()"
      (add)="open(null)"
      (edit)="open(byId($event))"
      (toggle)="toggle(byId($event))"
      (remove)="remove(byId($event))"
    >
      <button
        catalogActions
        mat-stroked-button
        type="button"
        aria-label="Descargar plantilla"
        (click)="downloadTemplate()"
      >
        <mat-icon>download</mat-icon>
        @if (!isHandset()) {
          Descargar plantilla
        }
      </button>
      <button
        catalogActions
        mat-stroked-button
        type="button"
        aria-label="Importar"
        (click)="openImport()"
      >
        <mat-icon>upload_file</mat-icon>
        @if (!isHandset()) {
          Importar
        }
      </button>
    </app-catalog-list>
  `,
})
export class ItemsPage extends CatalogAdmin {
  private readonly admin = inject(AdminService);
  private readonly catalog = inject(CatalogService);
  private readonly downloadTemplateFile = inject(ITEMS_TEMPLATE_DOWNLOAD);

  private readonly items = signal<Item[]>([]);
  private readonly types = signal<ItemType[]>([]);

  protected readonly rows = computed<CatalogRow[]>(() => {
    const typeNames = new Map(this.types().map((t) => [t.id, t.name]));
    return this.items().map((i) => ({
      id: i.id,
      name: i.name,
      details: [[typeNames.get(i.typeId), i.reference].filter(Boolean).join(' · ')].filter(Boolean),
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

  protected async downloadTemplate(): Promise<void> {
    this.error.set(null);
    try {
      await this.downloadTemplateFile(this.types());
    } catch {
      this.error.set('No se ha podido generar la plantilla.');
    }
  }

  protected async openImport(): Promise<void> {
    const created = await firstValueFrom(
      this.dialog
        .open<ImportItemsDialogComponent, ImportItemsDialogData, boolean>(
          ImportItemsDialogComponent,
          {
            data: { types: this.types(), items: this.items() },
            disableClose: true,
            ...dialogSize(this.isHandset()),
          },
        )
        .afterClosed(),
    );
    if (created) await this.refresh();
  }
}

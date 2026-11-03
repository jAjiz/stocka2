import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { Location } from '../../data/models';
import { CatalogAdmin } from './catalog-admin';
import { CatalogListComponent, CatalogRow } from './catalog-list.component';

const KIND_LABEL: Record<Location['kind'], string> = { warehouse: 'Almacén', vehicle: 'Vehículo' };
const KIND_ICON: Record<Location['kind'], string> = {
  warehouse: 'warehouse',
  vehicle: 'local_shipping',
};

@Component({
  selector: 'app-locations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogListComponent],
  template: `
    <app-catalog-list
      addLabel="Nueva localización"
      inactiveLabel="Deshabilitada"
      [rows]="rows()"
      [error]="error()"
      (add)="open(null)"
      (edit)="open(byId($event))"
      (toggle)="toggle(byId($event))"
      (remove)="remove(byId($event))"
    />
  `,
})
export class LocationsPage extends CatalogAdmin {
  private readonly admin = inject(AdminService);
  private readonly catalog = inject(CatalogService);

  private readonly locations = signal<Location[]>([]);
  protected readonly rows = computed<CatalogRow[]>(() =>
    this.locations().map((l) => ({
      id: l.id,
      name: l.name,
      detail: KIND_LABEL[l.kind],
      icon: KIND_ICON[l.kind],
      active: l.active,
    })),
  );

  constructor() {
    super();
    void this.refresh();
  }

  protected async load(): Promise<void> {
    this.locations.set(await this.catalog.allLocations());
  }

  protected byId(id: string): Location {
    return this.locations().find((l) => l.id === id)!;
  }

  protected open(l: Location | null): Promise<void> {
    return this.edit({
      title: l ? 'Editar localización' : 'Nueva localización',
      fields: ['name', 'kind'],
      value: { name: l?.name ?? '', kind: l?.kind ?? 'vehicle' },
      save: (v) => this.admin.saveLocation(l?.id ?? null, v.name, v.kind!),
    });
  }

  protected toggle(l: Location): Promise<void> {
    return this.run(() => this.admin.setLocationActive(l.id, !l.active));
  }

  protected async remove(l: Location): Promise<void> {
    if (await this.confirmDelete(l.name)) await this.run(() => this.admin.deleteLocation(l.id));
  }
}

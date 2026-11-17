import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  InjectionToken,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { map } from 'rxjs';
import { adminErrorMessage } from '../../../core/db-errors';
import { AdminService } from '../../../data/admin.service';
import { Item, ItemType } from '../../../data/models';
import { classifyRows, PreviewRow, PreviewStatus } from './items-preview';
import { ImportFileError, ImportRow, readItemsFile } from './items-reader';

export interface ImportItemsDialogData {
  types: ItemType[];
  items: Item[];
}

/** Lector del .xlsx; se sustituye en las pruebas. */
export const ITEMS_FILE_READER = new InjectionToken<(data: ArrayBuffer) => Promise<ImportRow[]>>(
  'ITEMS_FILE_READER',
  { factory: () => readItemsFile },
);

const STATUS_LABEL: Record<PreviewStatus, string> = {
  new: 'Nuevo',
  exists: 'Ya existe',
  error: 'Error',
};
const STATUS_TONE: Record<PreviewStatus, string> = { new: 'strong', exists: '', error: 'error' };
const INACTIVE_TYPE =
  'Uno de los tipos se ha deshabilitado o eliminado. Vuelve a cargar el archivo.';

/** Importación de artículos desde la plantilla (spec §8.1). Cierra con true si ha creado algo. */
@Component({
  selector: 'app-import-items-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatTableModule],
  styles: `
    .pick {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 12px;
    }
    .file {
      font-weight: 600;
    }
    .counts {
      margin: 0 0 8px;
    }
    .table-wrap {
      overflow-x: auto;
    }
    .reason {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
    }
    .error {
      color: var(--mat-sys-error);
    }
    .summary {
      font: var(--mat-sys-title-medium);
    }
  `,
  template: `
    <h2 mat-dialog-title>Importar artículos</h2>
    <mat-dialog-content>
      @if (result(); as r) {
        <p class="summary" role="status">Creados {{ r.created }} · Ya existían {{ r.skipped }}</p>
      } @else {
        <div class="pick">
          <input #file type="file" accept=".xlsx" hidden (change)="pick(file)" />
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="file.click()">
            <mat-icon>upload_file</mat-icon>Elegir archivo
          </button>
          @if (fileName()) {
            <span class="file">{{ fileName() }}</span>
          }
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        @if (rows().length > 0) {
          <p class="counts">
            {{ counts().new }} nuevos · {{ counts().exists }} ya existen · {{ counts().error }} con
            error
          </p>
          <div class="table-wrap">
            <table class="app-table" mat-table [dataSource]="rows()">
              <ng-container matColumnDef="row">
                <th mat-header-cell *matHeaderCellDef class="num">Fila</th>
                <td mat-cell *matCellDef="let r" class="num">{{ r.row }}</td>
              </ng-container>
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Nombre</th>
                <td mat-cell *matCellDef="let r">{{ r.name }}</td>
              </ng-container>
              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef>Tipo</th>
                <td mat-cell *matCellDef="let r">{{ r.type }}</td>
              </ng-container>
              <ng-container matColumnDef="reference">
                <th mat-header-cell *matHeaderCellDef>Referencia</th>
                <td mat-cell *matCellDef="let r">{{ r.reference }}</td>
              </ng-container>
              <ng-container matColumnDef="status">
                <th mat-header-cell *matHeaderCellDef>Estado</th>
                <td mat-cell *matCellDef="let r">
                  <span class="app-tag" [class]="'app-tag ' + tone(r)">{{ label(r) }}</span>
                  @for (reason of r.reasons; track reason) {
                    <div class="reason">{{ reason }}</div>
                  }
                </td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="columns()"></tr>
              <tr mat-row *matRowDef="let row; columns: columns()"></tr>
            </table>
          </div>
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (result()) {
        <button mat-flat-button type="button" (click)="ref.close(true)">Cerrar</button>
      } @else {
        <button mat-button type="button" (click)="ref.close(false)">Cancelar</button>
        @if (rows().length > 0) {
          <button mat-flat-button type="button" [disabled]="!canImport()" (click)="import()">
            Importar
          </button>
        }
      }
    </mat-dialog-actions>
  `,
})
export class ImportItemsDialogComponent {
  private readonly data = inject<ImportItemsDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<ImportItemsDialogComponent, boolean>>(MatDialogRef);
  private readonly admin = inject(AdminService);
  private readonly read = inject(ITEMS_FILE_READER);

  private readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly fileName = signal('');
  protected readonly rows = signal<PreviewRow[]>([]);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly result = signal<{ created: number; skipped: number } | null>(null);

  protected readonly columns = computed(() =>
    this.isHandset()
      ? ['row', 'name', 'type', 'status']
      : ['row', 'name', 'type', 'reference', 'status'],
  );

  protected readonly counts = computed(() => {
    const c = { new: 0, exists: 0, error: 0 };
    for (const r of this.rows()) c[r.status]++;
    return c;
  });

  protected readonly canImport = computed(
    () => !this.busy() && this.counts().error === 0 && this.counts().new > 0,
  );

  protected label(r: PreviewRow): string {
    return STATUS_LABEL[r.status];
  }

  protected tone(r: PreviewRow): string {
    return STATUS_TONE[r.status];
  }

  protected async pick(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo tras corregirlo
    if (!file) return;
    this.fileName.set(file.name);
    this.rows.set([]);
    this.error.set('');
    this.busy.set(true);
    try {
      const rows = await this.read(await file.arrayBuffer());
      this.rows.set(classifyRows(rows, this.data.types, this.data.items));
    } catch (e) {
      this.error.set(
        e instanceof ImportFileError ? e.message : 'El archivo no es un Excel (.xlsx) válido.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected async import(): Promise<void> {
    if (!this.canImport()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const items = this.rows()
        .filter((r) => r.status === 'new')
        .map((r) => ({ name: r.name, typeId: r.typeId!, reference: r.reference }));
      this.result.set(await this.admin.importItems(items));
    } catch (e) {
      const code = (e as { message?: unknown } | null)?.message;
      this.error.set(code === 'inactive_type' ? INACTIVE_TYPE : adminErrorMessage(e));
      this.rows.set([]);
    } finally {
      this.busy.set(false);
    }
  }
}

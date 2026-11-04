import { ChangeDetectionStrategy, Component, inject, PendingTasks, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { dbErrorMessage } from '../../core/db-errors';
import { OperationLine, OperationSummary } from '../../data/models';
import { OperationsService } from '../../data/operations.service';
import { formatDateTime, operationKindLabel } from '../../shared/format';

export interface OperationDetailData {
  operation: OperationSummary;
  locationNames: Map<string, string>;
  userNames: Map<string, string>;
  itemNames: Map<string, string>;
}

@Component({
  selector: 'app-operation-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  styles: `
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 16px;
      margin: 0 0 16px;
    }
    dt {
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
    }
    .error {
      color: var(--mat-sys-error);
    }
  `,
  template: `
    <h2 mat-dialog-title>{{ kind }}</h2>
    <mat-dialog-content>
      <dl>
        <dt>Fecha</dt>
        <dd>{{ date }}</dd>
        <dt>Usuario</dt>
        <dd>{{ user }}</dd>
        <dt>Origen</dt>
        <dd>{{ location(data.operation.originId) }}</dd>
        <dt>Destino</dt>
        <dd>{{ location(data.operation.destinationId) }}</dd>
        <dt>Referencia</dt>
        <dd>{{ data.operation.reference || '—' }}</dd>
        <dt>Notas</dt>
        <dd>{{ data.operation.notes || '—' }}</dd>
      </dl>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      } @else if (!loaded()) {
        <p role="status">Cargando…</p>
      } @else {
        <table class="app-table">
          <thead>
            <tr>
              <th scope="col">Artículo</th>
              <th scope="col" class="num">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            @for (l of lines(); track l.itemId) {
              <tr>
                <td>{{ data.itemNames.get(l.itemId) ?? 'Artículo deshabilitado' }}</td>
                <td class="num">{{ l.quantity }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cerrar</button>
    </mat-dialog-actions>
  `,
})
export class OperationDetailComponent {
  protected readonly data = inject<OperationDetailData>(MAT_DIALOG_DATA);
  private readonly operations = inject(OperationsService);

  protected readonly lines = signal<OperationLine[]>([]);
  protected readonly loaded = signal(false);
  protected readonly error = signal('');

  protected readonly kind = operationKindLabel(this.data.operation.kind);
  protected readonly date = formatDateTime(this.data.operation.createdAt);
  protected readonly user =
    this.data.userNames.get(this.data.operation.userId) ?? 'Usuario desconocido';

  constructor() {
    void inject(PendingTasks).run(async () => {
      try {
        this.lines.set(await this.operations.lines(this.data.operation.id));
      } catch (e) {
        this.error.set(dbErrorMessage(e));
      } finally {
        this.loaded.set(true);
      }
    });
  }

  protected location(id: string | null): string {
    return id ? (this.data.locationNames.get(id) ?? 'Localización desconocida') : '—';
  }
}

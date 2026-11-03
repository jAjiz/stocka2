import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { inject, PendingTasks, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom, map } from 'rxjs';
import { adminErrorMessage } from '../../core/db-errors';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../shared/confirm-dialog.component';
import { dialogSize } from '../../shared/dialog-size';
import { NameDialogComponent, NameDialogData } from './name-dialog.component';

/** Lo común de las páginas de localizaciones, tipos y artículos. */
export abstract class CatalogAdmin {
  private readonly dialog = inject(MatDialog);
  private readonly pending = inject(PendingTasks);
  private readonly isHandset = toSignal(
    inject(BreakpointObserver)
      .observe(Breakpoints.Handset)
      .pipe(map((s) => s.matches)),
    { initialValue: false },
  );

  protected readonly error = signal<string | null>(null);

  protected abstract load(): Promise<void>;

  /** Ejecuta una acción y recarga; si falla, muestra el error traducido. */
  protected async run(fn: () => Promise<unknown>, reload = true): Promise<void> {
    this.error.set(null);
    const done = this.pending.add();
    try {
      await fn();
      if (reload) await this.load();
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      done();
    }
  }

  /** Carga (o recarga) la lista mostrando el error si falla. */
  protected refresh(): Promise<void> {
    return this.run(async () => undefined);
  }

  protected async confirmDelete(name: string): Promise<boolean> {
    const ok = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: { message: `¿Eliminar ${name}? No se puede deshacer.`, confirmLabel: 'Eliminar' },
        })
        .afterClosed(),
    );
    return !!ok;
  }

  /** Abre el diálogo de alta/edición y recarga si se guardó. */
  protected async edit(data: NameDialogData): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog
        .open<NameDialogComponent, NameDialogData, boolean>(NameDialogComponent, {
          data,
          disableClose: true,
          ...dialogSize(this.isHandset()),
        })
        .afterClosed(),
    );
    if (saved) await this.refresh();
  }
}

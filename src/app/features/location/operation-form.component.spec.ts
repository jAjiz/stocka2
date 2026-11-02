import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth.service';
import { CatalogService } from '../../data/catalog.service';
import { OperationsService } from '../../data/operations.service';
import { StockService } from '../../data/stock.service';
import { OperationFormComponent } from './operation-form.component';

async function setup() {
  let resolve!: (v: string) => void;
  let reject!: (e: unknown) => void;
  const perform = vi.fn(
    () =>
      new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
      }),
  );
  const close = vi.fn();
  const open = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: { kind: 'remove', locationId: 'l1' } },
      { provide: MatDialogRef, useValue: { close } },
      { provide: MatSnackBar, useValue: { open } },
      { provide: AuthService, useValue: { isAdmin: signal(false) } },
      { provide: OperationsService, useValue: { perform } },
      {
        provide: CatalogService,
        useValue: {
          locations: async () => [{ id: 'l1', name: 'Taller', kind: 'warehouse', active: true }],
          itemTypes: async () => [],
          items: async () => [
            { id: 'a', name: 'Bujía', typeId: 't', reference: null, active: true },
          ],
        },
      },
      {
        provide: StockService,
        useValue: { byLocation: async () => [{ itemId: 'a', locationId: 'l1', quantity: 5 }] },
      },
    ],
  });
  const fixture = TestBed.createComponent(OperationFormComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const cmp = fixture.componentInstance as unknown as {
    pickItem(id: string): void;
  };
  cmp.pickItem('a');
  fixture.detectChanges();
  const button = () =>
    fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  return { fixture, perform, close, open, button, resolve: (v: string) => resolve(v), reject: (e: unknown) => reject(e) };
}

describe('OperationFormComponent', () => {
  it('doble clic en Confirmar llama una sola vez y bloquea el botón', async () => {
    const s = await setup();
    expect(s.button().disabled).toBe(false);
    s.button().click();
    s.button().click();
    s.fixture.detectChanges();
    expect(s.perform).toHaveBeenCalledTimes(1);
    expect(s.button().disabled).toBe(true);
    s.resolve('op1');
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect(s.close).toHaveBeenCalledWith(true);
    expect(s.open).toHaveBeenCalled();
  });

  it('si falla, muestra el error y no cierra', async () => {
    const s = await setup();
    s.button().click();
    s.reject({
      message: 'insufficient_stock',
      details: '[{"item_id":"a","available":0,"requested":1}]',
    });
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect(s.close).not.toHaveBeenCalled();
    expect(s.fixture.nativeElement.textContent).toContain('No hay stock suficiente de');
    expect(s.button().disabled).toBe(false);
  });
});

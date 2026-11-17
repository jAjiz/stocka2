import { BreakpointObserver } from '@angular/cdk/layout';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { AdminService } from '../../../data/admin.service';
import { Item, ItemType } from '../../../data/models';
import {
  ImportItemsDialogComponent,
  ImportItemsDialogData,
  ITEMS_FILE_READER,
} from './import-items-dialog.component';
import { ImportFileError, ImportRow } from './items-reader';

const TYPES: ItemType[] = [{ id: 't1', name: 'Fontanería', active: true }];
const ITEMS: Item[] = [{ id: 'i1', name: 'Codo', typeId: 't1', reference: null, active: true }];

const row = (r: number, name: string, type = 'Fontanería', reference = ''): ImportRow => ({
  row: r,
  name,
  type,
  reference,
});

async function setup(read: () => Promise<ImportRow[]>) {
  const admin = { importItems: vi.fn().mockResolvedValue({ created: 2, skipped: 0 }) };
  const ref = { close: vi.fn() };
  const data: ImportItemsDialogData = { types: TYPES, items: ITEMS };
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: MatDialogRef, useValue: ref },
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: ITEMS_FILE_READER, useValue: vi.fn(read) },
      {
        provide: BreakpointObserver,
        useValue: { observe: () => of({ matches: false, breakpoints: {} }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ImportItemsDialogComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const choose = async () => {
    const input = el.querySelector('input[type=file]') as HTMLInputElement;
    expect(input.accept).toBe('.xlsx');
    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'articulos.xlsx')],
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim().endsWith(label)) as
      HTMLButtonElement | undefined;
  return { fixture, el, admin, ref, choose, button };
}

describe('ImportItemsDialogComponent', () => {
  it('muestra la tabla y los recuentos de un archivo válido', async () => {
    const { el, choose, button } = await setup(async () => [
      row(2, 'Tubo'),
      row(3, 'Grifo'),
      row(4, 'codo'),
    ]);
    await choose();
    expect(el.textContent).toContain('articulos.xlsx');
    expect(el.textContent).toContain('2 nuevos · 1 ya existen · 0 con error');
    expect(el.querySelectorAll('tbody tr').length).toBe(3);
    expect(el.querySelector('tbody tr .app-tag')?.textContent?.trim()).toBe('Nuevo');
    expect(button('Importar')?.disabled).toBe(false);
  });

  it('con alguna fila en error no se puede importar y se ve el motivo', async () => {
    const { el, choose, button } = await setup(async () => [row(2, 'Tubo'), row(3, 'X', 'Otro')]);
    await choose();
    expect(el.textContent).toContain('El tipo «Otro» no existe o está deshabilitado.');
    expect(button('Importar')?.disabled).toBe(true);
  });

  it('si todo ya existe no se puede importar', async () => {
    const { choose, button } = await setup(async () => [row(2, 'Codo')]);
    await choose();
    expect(button('Importar')?.disabled).toBe(true);
  });

  it('importa solo las filas nuevas y muestra el resumen', async () => {
    const { el, fixture, admin, ref, choose, button } = await setup(async () => [
      row(2, 'Tubo', 'Fontanería', 'T-1'),
      row(3, 'Codo'),
      row(4, 'Grifo'),
    ]);
    await choose();
    button('Importar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(admin.importItems).toHaveBeenCalledWith([
      { name: 'Tubo', typeId: 't1', reference: 'T-1' },
      { name: 'Grifo', typeId: 't1', reference: '' },
    ]);
    // «Ya existían» suma las filas marcadas en la vista previa y las que el servidor saltó
    expect(el.textContent).toContain('Creados 2 · Ya existían 1');
    expect(el.querySelector('table')).toBeNull();
    button('Cerrar')!.click();
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('un error de archivo muestra su mensaje sin tabla', async () => {
    const { el, choose, button } = await setup(async () => {
      throw new ImportFileError('Falta la hoja «Artículos».');
    });
    await choose();
    expect(el.textContent).toContain('Falta la hoja «Artículos».');
    expect(el.querySelector('table')).toBeNull();
    expect(button('Importar')).toBeUndefined();
  });

  it('si un tipo se deshabilita entretanto lo explica y deja volver a elegir archivo', async () => {
    const { el, fixture, admin, choose, button } = await setup(async () => [row(2, 'Tubo')]);
    admin.importItems.mockRejectedValueOnce({ message: 'inactive_type' });
    await choose();
    button('Importar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain(
      'Uno de los tipos se ha deshabilitado o eliminado. Vuelve a cargar el archivo.',
    );
    expect(button('Elegir archivo')).toBeDefined();
  });

  it('el resumen suma las que ya existían en la vista previa y las creadas entretanto', async () => {
    const { el, fixture, admin, choose, button } = await setup(async () => [
      row(2, 'Tubo'),
      row(3, 'Codo'),
      row(4, 'Grifo'),
    ]);
    admin.importItems.mockResolvedValueOnce({ created: 1, skipped: 1 });
    await choose();
    button('Importar')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('Creados 1 · Ya existían 2');
  });
});

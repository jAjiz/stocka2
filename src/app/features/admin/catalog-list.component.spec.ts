import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogListComponent, CatalogRow } from './catalog-list.component';

async function setup(rows: CatalogRow[]) {
  const fixture = TestBed.createComponent(CatalogListComponent);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('addLabel', 'Añadir');
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('CatalogListComponent', () => {
  it('agrupa las filas en la lista común de la aplicación', async () => {
    const el = await setup([{ id: '1', name: 'Taller', active: true }]);
    expect(el.querySelector('.app-list [data-row]')?.textContent).toContain('Taller');
  });

  it('muestra el icono de cada fila con el símbolo común', async () => {
    const el = await setup([{ id: '1', name: 'Taller', icon: 'warehouse', active: true }]);
    expect(el.querySelector('[data-row] .app-list-symbol')?.textContent).toContain('warehouse');
  });

  it('cada detalle ocupa su propia línea', async () => {
    const el = await setup([{ id: '1', name: 'Regla', details: ['Uno', 'Dos'], active: true }]);
    const lines = [...el.querySelectorAll('[data-row] .detail')].map((d) => d.textContent?.trim());
    expect(lines).toEqual(['Uno', 'Dos']);
  });

  it('muestra las etiquetas de la fila con su tono', async () => {
    const el = await setup([
      {
        id: '1',
        name: 'Regla',
        tags: [
          { label: 'Leve', tone: 'warning' },
          { label: 'Grave', tone: 'error' },
        ],
        active: true,
      },
    ]);
    expect(el.querySelector('.app-tag.warning')?.textContent).toContain('Leve');
    expect(el.querySelector('.app-tag.error')?.textContent).toContain('Grave');
  });

  it('busca también en los detalles y las etiquetas', async () => {
    const el = await setup([
      { id: '1', name: 'Una', details: ['Taller'], active: true },
      { id: '2', name: 'Otra', tags: [{ label: 'Grave' }], active: true },
    ]);
    const input = el.querySelector('input[type="search"]') as HTMLInputElement;
    const search = async (q: string) => {
      input.value = q;
      input.dispatchEvent(new Event('input'));
      await TestBed.inject(ApplicationRef).whenStable();
      TestBed.inject(ApplicationRef).tick();
      return [...el.querySelectorAll('[data-row] .name')].map((n) => n.textContent);
    };
    expect(await search('taller')).toEqual(['Una']);
    expect(await search('grave')).toEqual(['Otra']);
  });

  it('las acciones de cada fila avisan con su id', async () => {
    const fixture = TestBed.createComponent(CatalogListComponent);
    fixture.componentRef.setInput('rows', [{ id: '7', name: 'Taller', active: true }]);
    fixture.componentRef.setInput('addLabel', 'Añadir');
    const edited: string[] = [];
    fixture.componentInstance.edit.subscribe((id) => edited.push(id));
    fixture.detectChanges();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const labels = [...el.querySelectorAll('[data-row] .buttons button')] as HTMLButtonElement[];
    expect(labels.map((b) => b.textContent?.trim())).toEqual([
      'Editar',
      'Deshabilitar',
      'Eliminar',
    ]);
    labels[0].click();
    expect(edited).toEqual(['7']);
  });

  it('sin resultados no dibuja la lista vacía', async () => {
    const el = await setup([]);
    expect(el.querySelector('.app-list')).toBeNull();
    expect(el.textContent).toContain('No hay resultados.');
  });
});

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

  it('sin resultados no dibuja la lista vacía', async () => {
    const el = await setup([]);
    expect(el.querySelector('.app-list')).toBeNull();
    expect(el.textContent).toContain('No hay resultados.');
  });
});

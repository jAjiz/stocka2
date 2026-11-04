import { TestBed } from '@angular/core/testing';
import { RowAction, RowActionsComponent } from './row-actions.component';

async function setup(actions: RowAction[]) {
  const fixture = TestBed.createComponent(RowActionsComponent);
  fixture.componentRef.setInput('actions', actions);
  fixture.componentRef.setInput('name', 'Ana');
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('RowActionsComponent', () => {
  it('cada botón ejecuta su acción', async () => {
    const edit = vi.fn();
    const { el } = await setup([{ label: 'Editar', run: edit }]);
    (el.querySelector('.buttons button') as HTMLButtonElement).click();
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it('el menú nombra la fila a la que pertenece', async () => {
    const { el } = await setup([{ label: 'Editar', run: vi.fn() }]);
    expect(el.querySelector('.more')?.getAttribute('aria-label')).toBe('Acciones de Ana');
  });

  it('el menú ofrece las mismas acciones y las ejecuta', async () => {
    const edit = vi.fn();
    const remove = vi.fn();
    const { el, fixture } = await setup([
      { label: 'Editar', run: edit },
      { label: 'Eliminar', run: remove },
    ]);
    (el.querySelector('.more') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const items = [...document.querySelectorAll<HTMLButtonElement>('[mat-menu-item]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual(['Editar', 'Eliminar']);
    items[1].click();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(edit).not.toHaveBeenCalled();
  });
});

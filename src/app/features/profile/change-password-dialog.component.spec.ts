import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../../core/auth.service';
import { ChangePasswordDialogComponent } from './change-password-dialog.component';

async function setup(setPassword = vi.fn().mockResolvedValue(undefined)) {
  const ref = { close: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { setPassword } },
      { provide: MatDialogRef, useValue: ref },
    ],
  });
  const fixture = TestBed.createComponent(ChangePasswordDialogComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const save = [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Guardar',
  ) as HTMLButtonElement;
  const type = (value: string, repeat = value) => {
    const [a, b] = [...el.querySelectorAll('input[type="password"]')] as HTMLInputElement[];
    a.value = value;
    b.value = repeat;
    a.dispatchEvent(new Event('input'));
    b.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, el, ref, setPassword, save, type };
}

describe('ChangePasswordDialogComponent', () => {
  it('no deja guardar hasta que la contraseña es válida', async () => {
    const { save, type } = await setup();
    expect(save.disabled).toBe(true);
    type('corta');
    expect(save.disabled).toBe(true);
    type('nueva-clave', 'otra-clave');
    expect(save.disabled).toBe(true);
    type('nueva-clave');
    expect(save.disabled).toBe(false);
  });

  it('el botón de las acciones envía el formulario y cierra la ventana guardando', async () => {
    const { fixture, ref, setPassword, save, type } = await setup();
    type('nueva-clave');
    save.click();
    await fixture.whenStable();
    expect(setPassword).toHaveBeenCalledTimes(1);
    expect(setPassword).toHaveBeenCalledWith('nueva-clave');
    expect(ref.close).toHaveBeenCalledWith(true);
  });

  it('si falla muestra el error y la ventana sigue abierta', async () => {
    const { fixture, el, ref, save, type } = await setup(
      vi.fn().mockRejectedValue(new Error('Contraseña demasiado débil')),
    );
    type('nueva-clave');
    save.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('demasiado débil');
    expect(ref.close).not.toHaveBeenCalled();
  });
});

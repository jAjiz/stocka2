import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { PushService, PushStatus } from '../../data/push.service';
import { NameDialogComponent, NameDialogData } from '../admin/name-dialog.component';
import { ChangePasswordDialogComponent } from './change-password-dialog.component';
import { ProfilePage } from './profile.page';

async function setup(status: PushStatus = 'off', dialogResult: boolean | null = true) {
  const auth = {
    profile: signal({ id: 'u1', displayName: 'Juan', role: 'user', active: true }),
    session: signal({ user: { email: 'juan@x.es' } }),
    updateDisplayName: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  };
  const push = {
    status: signal<PushStatus>(status),
    enable: vi.fn().mockResolvedValue(undefined),
    disable: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: PushService, useValue: push },
    ],
  });
  const open = vi
    .spyOn(TestBed.inject(MatDialog), 'open')
    .mockReturnValue({ afterClosed: () => of(dialogResult ?? undefined) } as never);
  const snack = vi.spyOn(TestBed.inject(MatSnackBar), 'open');
  const fixture = TestBed.createComponent(ProfilePage);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const button = (label: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  return { fixture, el, auth, push, open, snack, button };
}

describe('ProfilePage', () => {
  it('muestra el correo y el nombre actual', async () => {
    const { el } = await setup();
    expect(el.textContent).toContain('juan@x.es');
    expect(el.textContent).toContain('Juan');
  });

  it('permite cerrar sesión', async () => {
    const { auth, button } = await setup();
    button('Cerrar sesión')!.click();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('edita el nombre en una ventana que guarda en el perfil', async () => {
    const { auth, open, button, fixture } = await setup();
    button('Editar')!.click();
    await fixture.whenStable();
    expect(open.mock.calls[0][0]).toBe(NameDialogComponent);
    const data = open.mock.calls[0][1]!.data as NameDialogData;
    expect(data.fields).toEqual(['name']);
    expect(data.value.name).toBe('Juan');
    await data.save({ name: 'Pepe' });
    expect(auth.updateDisplayName).toHaveBeenCalledWith('Pepe');
  });

  it('avisa de que el nombre se ha guardado al cerrar la ventana guardando', async () => {
    const { snack, button, fixture } = await setup();
    button('Editar')!.click();
    await fixture.whenStable();
    expect(snack.mock.calls[0][0]).toBe('Nombre guardado');
  });

  it('la contraseña no se escribe en la pantalla: el botón abre una ventana', async () => {
    const { el, open, button, fixture } = await setup();
    expect(el.querySelector('input')).toBeNull();
    button('Cambiar')!.click();
    await fixture.whenStable();
    expect(open.mock.calls[0][0]).toBe(ChangePasswordDialogComponent);
  });

  it('avisa de que la contraseña ha cambiado al cerrar la ventana guardando', async () => {
    const { snack, button, fixture } = await setup();
    button('Cambiar')!.click();
    await fixture.whenStable();
    expect(snack.mock.calls[0][0]).toBe('Contraseña cambiada');
  });

  it('al cancelar la ventana de la contraseña no avisa de nada', async () => {
    const { snack, button, fixture } = await setup('off', null);
    button('Cambiar')!.click();
    await fixture.whenStable();
    expect(snack).not.toHaveBeenCalled();
  });

  it('con las notificaciones desactivadas, "Activar" las activa', async () => {
    const { push, button, fixture } = await setup('off');
    button('Activar')!.click();
    await fixture.whenStable();
    expect(push.enable).toHaveBeenCalled();
  });

  it('con las notificaciones activadas, "Desactivar" las desactiva', async () => {
    const { push, button, fixture } = await setup('on');
    button('Desactivar')!.click();
    await fixture.whenStable();
    expect(push.disable).toHaveBeenCalled();
  });

  it('en iPhone sin instalar explica cómo instalar y no hay botón', async () => {
    const { el, button } = await setup('ios-install');
    expect(el.textContent).toContain('Añadir a pantalla de inicio');
    expect(button('Activar')).toBeUndefined();
    expect(button('Desactivar')).toBeUndefined();
  });
});

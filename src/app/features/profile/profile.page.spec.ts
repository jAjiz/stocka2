import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth.service';
import { PushService, PushStatus } from '../../data/push.service';
import { ProfilePage } from './profile.page';

async function setup(status: PushStatus = 'off') {
  const auth = {
    profile: signal({ id: 'u1', displayName: 'Juan', role: 'user', active: true }),
    session: signal({ user: { email: 'juan@x.es' } }),
    updateDisplayName: vi.fn().mockResolvedValue(undefined),
    setPassword: vi.fn().mockResolvedValue(undefined),
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
  const fixture = TestBed.createComponent(ProfilePage);
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const nameInput = el.querySelector('input[name="displayName"]') as HTMLInputElement;
  const saveName = [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Guardar',
  ) as HTMLButtonElement;
  const setName = (v: string) => {
    nameInput.value = v;
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  return { fixture, el, auth, push, nameInput, saveName, setName };
}

describe('ProfilePage', () => {
  it('muestra el correo y el nombre actual', async () => {
    const { el, nameInput } = await setup();
    expect(el.textContent).toContain('juan@x.es');
    expect(nameInput.value).toBe('Juan');
  });

  it('permite cerrar sesión', async () => {
    const { el, auth } = await setup();
    const button = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cerrar sesión',
    ) as HTMLButtonElement;
    button.click();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('guarda el nombre recortado', async () => {
    const { auth, saveName, setName, fixture } = await setup();
    setName('  Pepe ');
    saveName.click();
    await fixture.whenStable();
    expect(auth.updateDisplayName).toHaveBeenCalledWith('Pepe');
  });

  it('con el nombre vacío el botón está desactivado', async () => {
    const { saveName, setName } = await setup();
    setName('   ');
    expect(saveName.disabled).toBe(true);
  });

  it('cambia la contraseña una vez', async () => {
    const { el, auth, fixture } = await setup();
    const [pw, repeat] = [...el.querySelectorAll('input[type="password"]')] as HTMLInputElement[];
    for (const input of [pw, repeat]) {
      input.value = 'nueva-clave';
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    (el.querySelector('app-password-form button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(auth.setPassword).toHaveBeenCalledTimes(1);
    expect(auth.setPassword).toHaveBeenCalledWith('nueva-clave');
    fixture.detectChanges();
    expect(pw.value).toBe('');
    expect(repeat.value).toBe('');
  });

  it('con las notificaciones desactivadas, "Activar notificaciones" las activa', async () => {
    const { el, push, fixture } = await setup('off');
    const btn = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Activar notificaciones',
    ) as HTMLButtonElement;
    btn.click();
    await fixture.whenStable();
    expect(push.enable).toHaveBeenCalled();
  });

  it('con las notificaciones activadas, "Desactivar" las desactiva', async () => {
    const { el, push, fixture } = await setup('on');
    const btn = [...el.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Desactivar',
    ) as HTMLButtonElement;
    btn.click();
    await fixture.whenStable();
    expect(push.disable).toHaveBeenCalled();
  });

  it('en iPhone sin instalar explica cómo instalar y no hay botón', async () => {
    const { el } = await setup('ios-install');
    expect(el.textContent).toContain('Añadir a pantalla de inicio');
    const labels = [...el.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Activar notificaciones');
    expect(labels).not.toContain('Desactivar');
  });
});

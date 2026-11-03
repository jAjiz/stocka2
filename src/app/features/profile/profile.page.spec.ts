import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth.service';
import { ProfilePage } from './profile.page';

async function setup() {
  const auth = {
    profile: signal({ id: 'u1', displayName: 'Juan', role: 'user', active: true }),
    session: signal({ user: { email: 'juan@x.es' } }),
    updateDisplayName: vi.fn().mockResolvedValue(undefined),
    setPassword: vi.fn().mockResolvedValue(undefined),
  };
  TestBed.configureTestingModule({ providers: [{ provide: AuthService, useValue: auth }] });
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
  return { fixture, el, auth, nameInput, saveName, setName };
}

describe('ProfilePage', () => {
  it('muestra el correo y el nombre actual', async () => {
    const { el, nameInput } = await setup();
    expect(el.textContent).toContain('juan@x.es');
    expect(nameInput.value).toBe('Juan');
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
});

import { TestBed } from '@angular/core/testing';
import { PasswordFormComponent } from './password-form.component';

async function setup() {
  const fixture = TestBed.createComponent(PasswordFormComponent);
  const submitted: string[] = [];
  fixture.componentInstance.submitted.subscribe((p) => submitted.push(p));
  fixture.detectChanges();
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const [pw, repeat] = [...el.querySelectorAll('input')] as HTMLInputElement[];
  const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;
  async function type(a: string, b: string) {
    pw.value = a;
    pw.dispatchEvent(new Event('input'));
    repeat.value = b;
    repeat.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }
  return { fixture, el, button, type, submitted };
}

describe('PasswordFormComponent', () => {
  it('menos de 8 caracteres muestra el error y desactiva el botón', async () => {
    const { el, button, type } = await setup();
    await type('1234567', '1234567');
    expect(el.textContent).toContain('Mínimo 8 caracteres.');
    expect(button.disabled).toBe(true);
  });

  it('contraseñas distintas muestran el error', async () => {
    const { el, button, type } = await setup();
    await type('12345678', '12345679');
    expect(el.textContent).toContain('Las contraseñas no coinciden.');
    expect(button.disabled).toBe(true);
  });

  it('válidas e iguales emiten una vez', async () => {
    const { button, type, submitted, fixture } = await setup();
    await type('12345678', '12345678');
    expect(button.disabled).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(submitted).toEqual(['12345678']);
  });
});

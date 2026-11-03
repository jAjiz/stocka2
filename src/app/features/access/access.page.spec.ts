import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AccessPage } from './access.page';

async function setup(query: Record<string, string>) {
  const auth = { acceptLink: vi.fn().mockResolvedValue(undefined), setPassword: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccessPage);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, auth, el: fixture.nativeElement as HTMLElement };
}

function clickContinue(el: HTMLElement) {
  const button = [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === 'Continuar',
  ) as HTMLButtonElement;
  button.click();
}

describe('AccessPage', () => {
  it('sin token muestra el aviso y no canjea nada', async () => {
    const { el, auth } = await setup({});
    expect(el.textContent).toContain(
      'El enlace no es válido o ha caducado. Pide uno nuevo al administrador.',
    );
    expect(auth.acceptLink).not.toHaveBeenCalled();
  });

  it('con token no lo canjea hasta pulsar Continuar', async () => {
    const { el, auth, fixture } = await setup({ t: 'h' });
    expect(auth.acceptLink).not.toHaveBeenCalled();
    clickContinue(el);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(auth.acceptLink).toHaveBeenCalledWith('h');
    expect(el.textContent).toContain('Repite la contraseña');
  });

  it('si el canje falla muestra el error', async () => {
    const { el, auth, fixture } = await setup({ t: 'h' });
    auth.acceptLink.mockRejectedValueOnce(new Error('El enlace no es válido o ha caducado.'));
    clickContinue(el);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('El enlace no es válido o ha caducado.');
  });
});

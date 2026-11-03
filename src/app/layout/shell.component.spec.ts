import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ShellComponent } from './shell.component';

function setup(opts: { loadError?: boolean; admin?: boolean } = {}) {
  const session = signal<unknown>({ user: { id: 'u1' } });
  const loadError = signal(!!opts.loadError);
  const retry = vi.fn(async () => loadError.set(false));
  const auth = {
    session,
    loadError,
    retry,
    profile: signal({ id: 'u1', displayName: 'Furgo 1', role: 'user', active: true }),
    isAdmin: signal(!!opts.admin),
    signOut: vi.fn(async () => session.set(null)),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ShellComponent);
  fixture.detectChanges();
  return { fixture, auth, navigate };
}

describe('ShellComponent', () => {
  it('con loadError muestra Reintentar en lugar de la aplicación', async () => {
    const s = setup({ loadError: true });
    const el = s.fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No se ha podido conectar.');
    expect(el.querySelector('router-outlet')).toBeNull();
    const button = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Reintentar'),
    ) as HTMLButtonElement;
    button.click();
    await s.fixture.whenStable();
    s.fixture.detectChanges();
    expect(s.auth.retry).toHaveBeenCalled();
    expect(el.textContent).not.toContain('No se ha podido conectar.');
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('si la sesión pasa a null navega a /login', async () => {
    const s = setup();
    expect(s.navigate).not.toHaveBeenCalled();
    s.auth.session.set(null);
    s.fixture.detectChanges();
    await s.fixture.whenStable();
    expect(s.navigate).toHaveBeenCalledWith('/login');
  });

  it('Perfil siempre; Administración solo para administradores', () => {
    const user = setup();
    let text = (user.fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Perfil');
    expect(text).not.toContain('Administración');

    TestBed.resetTestingModule();
    const admin = setup({ admin: true });
    text = (admin.fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Perfil');
    expect(text).toContain('Administración');
  });
});

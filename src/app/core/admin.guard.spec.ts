import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
  function run(isAdmin: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { ready: Promise.resolve(), isAdmin: signal(isAdmin) } },
      ],
    });
    return TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
  }

  it('un usuario normal vuelve a Inicio', async () => {
    const result = await run(false);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/');
  });

  it('un administrador pasa', async () => {
    expect(await run(true)).toBe(true);
  });
});

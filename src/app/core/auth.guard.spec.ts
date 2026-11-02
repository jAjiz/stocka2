import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  function run(hasSession: boolean) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { ready: Promise.resolve(), session: signal(hasSession ? { user: {} } : null) },
        },
      ],
    });
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
  }

  it('sin sesión redirige a /login', async () => {
    const result = await run(false);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('con sesión deja pasar', async () => {
    expect(await run(true)).toBe(true);
  });
});

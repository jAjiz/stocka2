import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { CatalogService } from '../data/catalog.service';
import { AuthService } from './auth.service';
import { homeGuard } from './home.guard';

describe('homeGuard', () => {
  function run(permitted: string[], locations: () => Promise<{ id: string }[]>) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            ready: Promise.resolve(),
            canOperate: (id: string) => permitted.includes(id),
          },
        },
        { provide: CatalogService, useValue: { locations } },
      ],
    });
    return TestBed.runInInjectionContext(() => homeGuard({} as never, {} as never));
  }

  const three = async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('con una sola localización accesible entra directamente en ella', async () => {
    const result = await run(['b'], three);
    expect(result instanceof UrlTree).toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/localizaciones/b');
  });

  it('con varias localizaciones se queda en Inicio', async () => {
    expect(await run(['a', 'b'], three)).toBe(true);
  });

  it('sin localizaciones se queda en Inicio', async () => {
    expect(await run([], three)).toBe(true);
  });

  it('un permiso sobre una localización deshabilitada no cuenta', async () => {
    const result = await run(['a', 'deshabilitada'], async () => [{ id: 'a' }]);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/localizaciones/a');
  });

  it('si no se pueden cargar las localizaciones se queda en Inicio, que muestra el error', async () => {
    expect(await run(['a'], () => Promise.reject(new Error('red')))).toBe(true);
  });
});

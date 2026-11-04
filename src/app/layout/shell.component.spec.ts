import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CurrentLocationService } from '../core/current-location.service';
import { ShellComponent } from './shell.component';

@Component({ template: '' })
class Blank {}

const routes: Routes = [
  { path: 'stock', component: Blank, data: { title: 'Stock global', icon: 'inventory_2' } },
  {
    path: 'admin',
    component: Blank,
    data: { title: 'Administración', icon: 'admin_panel_settings' },
    children: [
      { path: '', pathMatch: 'full', component: Blank },
      {
        path: 'usuarios',
        component: Blank,
        data: { title: 'Usuarios', icon: 'group', backTo: '/admin' },
      },
    ],
  },
];

function setup(opts: { loadError?: boolean; admin?: boolean; handset?: boolean } = {}) {
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
    providers: [
      provideRouter(routes),
      { provide: AuthService, useValue: auth },
      {
        provide: BreakpointObserver,
        useValue: { observe: () => of({ matches: !!opts.handset, breakpoints: {} }) },
      },
    ],
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

  describe('barra superior', () => {
    const bar = (el: HTMLElement) => el.querySelector('.page-bar');

    async function go(s: ReturnType<typeof setup>, url: string) {
      s.navigate.mockRestore();
      await TestBed.inject(Router).navigateByUrl(url);
      s.fixture.detectChanges();
      await s.fixture.whenStable();
    }

    for (const handset of [true, false]) {
      it(`muestra el título de la pantalla (${handset ? 'móvil' : 'PC'})`, async () => {
        const s = setup({ handset });
        await go(s, '/stock');
        const el = s.fixture.nativeElement as HTMLElement;
        expect(bar(el)?.querySelector('h1')?.textContent).toContain('Stock global');
        expect(bar(el)?.querySelector('mat-icon')?.textContent).toContain('inventory_2');
      });
    }

    for (const handset of [true, false]) {
      const device = handset ? 'móvil' : 'PC';

      it(`una sección de administración muestra su nombre y una flecha para volver (${device})`, async () => {
        const s = setup({ handset });
        await go(s, '/admin/usuarios');
        const el = s.fixture.nativeElement as HTMLElement;
        expect(bar(el)?.querySelector('h1')?.textContent).toContain('Usuarios');
        expect(bar(el)?.querySelector('a[aria-label="Volver"]')?.getAttribute('href')).toBe(
          '/admin',
        );
      });

      it(`la pantalla de selección no tiene flecha (${device})`, async () => {
        const s = setup({ handset });
        await go(s, '/admin');
        const el = s.fixture.nativeElement as HTMLElement;
        expect(bar(el)?.querySelector('h1')?.textContent).toContain('Administración');
        expect(bar(el)?.querySelector('a[aria-label="Volver"]')).toBeNull();
      });
    }

    it('en móvil no hay botón de cerrar sesión en la barra', async () => {
      const s = setup({ handset: true });
      await go(s, '/stock');
      const el = s.fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[aria-label="Cerrar sesión"]')).toBeNull();
    });

    for (const handset of [true, false]) {
      it(`dentro de una localización muestra su nombre (${handset ? 'móvil' : 'PC'})`, () => {
        const s = setup({ handset });
        const el = s.fixture.nativeElement as HTMLElement;
        TestBed.inject(CurrentLocationService).location.set({
          name: 'Furgoneta 1',
          kind: 'vehicle',
        });
        s.fixture.detectChanges();
        expect(bar(el)?.querySelector('h1')?.textContent).toContain('Furgoneta 1');
        expect(bar(el)?.querySelector('mat-icon')?.textContent).toContain('local_shipping');
      });
    }

    it('al salir de la localización vuelve al título de la pantalla', async () => {
      const s = setup({ handset: true });
      await go(s, '/stock');
      const el = s.fixture.nativeElement as HTMLElement;
      const current = TestBed.inject(CurrentLocationService);
      current.location.set({ name: 'Taller', kind: 'warehouse' });
      s.fixture.detectChanges();
      expect(bar(el)?.querySelector('h1')?.textContent).toContain('Taller');
      current.location.set(null);
      s.fixture.detectChanges();
      expect(bar(el)?.querySelector('h1')?.textContent).toContain('Stock global');
    });

    it('Inicio sigue marcado dentro de una localización', () => {
      const s = setup({ handset: true });
      const el = s.fixture.nativeElement as HTMLElement;
      TestBed.inject(CurrentLocationService).location.set({ name: 'Taller', kind: 'warehouse' });
      s.fixture.detectChanges();
      expect(el.querySelector('nav a[href="/"]')?.classList).toContain('in-location');
    });
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

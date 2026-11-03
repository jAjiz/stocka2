import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { AdminService } from '../../data/admin.service';
import { CatalogService } from '../../data/catalog.service';
import { AdminUser } from '../../data/models';
import { UsersPage } from './users.page';

const users: AdminUser[] = [
  {
    id: 'a',
    email: 'admin@x.es',
    displayName: 'Ana',
    role: 'admin',
    active: true,
    locationIds: [],
    hasPassword: true,
  },
  {
    id: 'p',
    email: 'pend@x.es',
    displayName: 'Pedro',
    role: 'user',
    active: true,
    locationIds: ['l1'],
    hasPassword: false,
  },
  {
    id: 'd',
    email: 'baja@x.es',
    displayName: 'Diego',
    role: 'user',
    active: false,
    locationIds: [],
    hasPassword: true,
  },
];

async function setup() {
  const admin = {
    users: vi.fn().mockResolvedValue(users),
    setUserActive: vi.fn().mockRejectedValue({ message: 'last_admin' }),
    regenerateLink: vi.fn(),
  };
  const catalog = {
    allLocations: async () => [{ id: 'l1', name: 'Furgoneta 1', kind: 'vehicle', active: true }],
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AdminService, useValue: admin },
      { provide: CatalogService, useValue: catalog },
      { provide: AuthService, useValue: { profile: signal({ id: 'p' }) } },
    ],
  });
  const fixture = TestBed.createComponent(UsersPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, admin, el: fixture.nativeElement as HTMLElement };
}

const card = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll('[data-user]')].find((c) => c.textContent?.includes(name)) as HTMLElement;

describe('UsersPage', () => {
  it('muestra el estado y las localizaciones de cada usuario', async () => {
    const { el } = await setup();
    expect(card(el, 'Pedro').textContent).toContain('Pendiente de acceso');
    expect(card(el, 'Pedro').textContent).toContain('Furgoneta 1');
    expect(card(el, 'Diego').textContent).toContain('Desactivado');
    expect(card(el, 'Ana').textContent).toContain('Activo');
    expect(card(el, 'Ana').textContent).toContain('Todas');
  });

  it('un error al desactivar se muestra y la lista no cambia', async () => {
    const { el, admin, fixture } = await setup();
    vi.spyOn(TestBed.inject(MatDialog), 'open').mockReturnValue({
      afterClosed: () => of(true),
    } as never);
    const button = [...card(el, 'Ana').querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Desactivar',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(admin.setUserActive).toHaveBeenCalledWith('a', false);
    expect(el.textContent).toContain('Tiene que quedar al menos un administrador activo.');
    expect(admin.users).toHaveBeenCalledTimes(1);
    expect(card(el, 'Ana').textContent).toContain('Activo');
  });

  it('en la propia tarjeta no se ofrece Desactivar', async () => {
    const { el } = await setup();
    const labels = (name: string) =>
      [...card(el, name).querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels('Pedro')).not.toContain('Desactivar');
    expect(labels('Ana')).toContain('Desactivar');
  });
});

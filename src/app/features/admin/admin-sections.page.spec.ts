import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminSectionsPage } from './admin-sections.page';

describe('AdminSectionsPage', () => {
  it('enlaza con cada sección de administración', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(AdminSectionsPage);
    f.detectChanges();
    const links = [...(f.nativeElement as HTMLElement).querySelectorAll('a')];
    expect(links.map((a) => [a.querySelector('.name')?.textContent, a.getAttribute('href')])).toEqual(
      [
        ['Usuarios', '/admin/usuarios'],
        ['Localizaciones', '/admin/localizaciones'],
        ['Artículos', '/admin/articulos'],
        ['Tipos', '/admin/tipos'],
        ['Avisos', '/admin/avisos'],
      ],
    );
  });
});

import { routes } from './app.routes';

describe('routes', () => {
  const shell = routes.find((r) => r.path === '' && r.children);
  const title = (path: string) =>
    shell?.children?.find((r) => r.path === path)?.data?.['title'] as string | undefined;

  it('cada pantalla con franja superior tiene su título', () => {
    expect(title('')).toBe('Selecciona una localización');
    expect(title('localizaciones/:id')).toBe('Localización');
    expect(title('stock')).toBe('Stock global');
    expect(title('historial')).toBe('Historial');
    expect(title('perfil')).toBe('Perfil');
    expect(title('admin')).toBe('Administración');
  });

  it('Administración abre la pantalla de selección, sin redirigir a ninguna sección', () => {
    const admin = shell?.children?.find((r) => r.path === 'admin');
    const index = admin?.children?.find((r) => r.path === '');
    expect(index?.loadComponent).toBeDefined();
    expect(index?.redirectTo).toBeUndefined();
  });

  it('cada sección de administración vuelve a la pantalla de selección', () => {
    const admin = shell?.children?.find((r) => r.path === 'admin');
    const headers = admin?.children
      ?.filter((r) => r.path)
      .map((r) => [r.path, r.data?.['title'], r.data?.['backTo']]);
    expect(headers).toEqual([
      ['usuarios', 'Usuarios', '/admin'],
      ['localizaciones', 'Localizaciones', '/admin'],
      ['articulos', 'Artículos', '/admin'],
      ['tipos', 'Tipos', '/admin'],
      ['avisos', 'Avisos', '/admin'],
    ]);
  });
});

import { buildAccessUrl } from './access-link';

describe('buildAccessUrl', () => {
  it('codifica el token en la query', () => {
    expect(buildAccessUrl('https://a.b', 'x/y+z')).toBe('https://a.b/acceso?t=x%2Fy%2Bz');
  });
});

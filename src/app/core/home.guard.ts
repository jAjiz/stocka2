import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CatalogService } from '../data/catalog.service';
import { AuthService } from './auth.service';

/** Quien solo puede usar una localización activa entra directamente en ella. */
export const homeGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const catalog = inject(CatalogService);
  const router = inject(Router);
  await auth.ready;
  try {
    const usable = (await catalog.locations()).filter((l) => auth.canOperate(l.id));
    return usable.length === 1 ? router.createUrlTree(['/localizaciones', usable[0].id]) : true;
  } catch {
    // Inicio vuelve a intentarlo y muestra el error.
    return true;
  }
};

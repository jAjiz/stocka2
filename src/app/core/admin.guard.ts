import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Solo administradores; el resto vuelve a Inicio. Va dentro del shell (ya hay sesión). */
export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.isAdmin() ? true : router.createUrlTree(['/']);
};

import { MatDialogConfig } from '@angular/material/dialog';

/** Tamaño de los diálogos de administración: pantalla completa en móvil. */
export function dialogSize(handset: boolean): MatDialogConfig {
  return handset
    ? { width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh' }
    : { width: '480px', maxWidth: '95vw' };
}

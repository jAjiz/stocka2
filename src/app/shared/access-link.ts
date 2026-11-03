/**
 * Enlace de acceso de la propia aplicación. La página /acceso canjea el token con verifyOtp
 * solo cuando el usuario pulsa "Continuar", así que abrir el enlace sin JavaScript (vista
 * previa de WhatsApp) no lo gasta.
 */
export function buildAccessUrl(origin: string, tokenHash: string): string {
  return `${origin}/acceso?t=${encodeURIComponent(tokenHash)}`;
}

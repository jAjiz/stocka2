// Prueba de humo de la Edge Function admin-users contra Supabase local.
// Requiere `npm run db:reset` antes (usa los usuarios del seed). Sale con 1 si algo falla.
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const raw = execSync('npx supabase status -o json', { encoding: 'utf8' });
const status = JSON.parse(raw.slice(raw.indexOf('{')));
const URL = status.API_URL;
const ANON = status.ANON_KEY;
const DEV_PASSWORD = 'stocka2-dev';

let failures = 0;
function check(name, cond, extra) {
  console.log(`${cond ? 'ok   ' : 'FALLO'} ${name}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`);
  if (!cond) failures++;
}

const newClient = () =>
  createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(email, password = DEV_PASSWORD) {
  const c = newClient();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}

/** Llama a la función y devuelve { data } o { code } con el código de error del cuerpo. */
async function call(client, body) {
  const { data, error } = await client.functions.invoke('admin-users', { body });
  if (!error) return { data };
  try {
    return { code: (await error.context.json()).error, status: error.context.status };
  } catch {
    return { code: `sin cuerpo: ${error.message}` };
  }
}

const admin = await signedIn('admin@stocka2.test');
const furgo1 = await signedIn('furgo1@stocka2.test');
const { data: locs } = await admin.from('locations').select('id, name');
const f1 = locs.find((l) => l.name === 'Furgoneta 1').id;
const email = `smoke-${Date.now()}@stocka2.test`;

// 1. Un usuario normal no puede invitar
const r1 = await call(furgo1, {
  action: 'invite', email: 'x@stocka2.test', displayName: 'X', role: 'user', locationIds: [],
});
check('usuario normal → forbidden (403)', r1.code === 'forbidden' && r1.status === 403, r1);

// 2. Invitación
const r2 = await call(admin, {
  action: 'invite', email: `  ${email} `, displayName: 'Smoke', role: 'user', locationIds: [f1],
});
const ttl = r2.data ? new Date(r2.data.expiresAt).getTime() - Date.now() : NaN;
check('invite devuelve tokenHash y userId', !!r2.data?.tokenHash && !!r2.data?.userId, r2);
check('expiresAt ≈ 24 h', Math.abs(ttl - 86_400_000) < 60_000, r2.data?.expiresAt);
check('invite no devuelve action_link', r2.data && !('actionLink' in r2.data) && !('action_link' in r2.data));
const { data: listed } = await admin.rpc('admin_list_users');
const invited = listed?.find((u) => u.id === r2.data?.userId);
check('perfil activo con nombre y permiso',
  invited?.active === true && invited.display_name === 'Smoke' && invited.location_ids.join() === f1, invited);

// 3. Correo repetido
const r3 = await call(admin, {
  action: 'invite', email: email.toUpperCase(), displayName: 'Otra', role: 'user', locationIds: [],
});
check('correo repetido → email_exists', r3.code === 'email_exists', r3);

// 3b. Datos no válidos
const r3b = await call(admin, {
  action: 'invite', email: 'no-es-correo', displayName: 'X', role: 'user', locationIds: [],
});
check('correo no válido → invalid_input', r3b.code === 'invalid_input', r3b);

// 4. Canjear el enlace y crear contraseña
const guest = newClient();
const v1 = await guest.auth.verifyOtp({ token_hash: r2.data.tokenHash, type: 'recovery' });
check('verifyOtp crea sesión', !v1.error && !!v1.data.session, v1.error?.message);
const up = await guest.auth.updateUser({ password: 'smoke-pass-123' });
check('updateUser(password)', !up.error, up.error?.message);
const loginOk = await newClient().auth.signInWithPassword({ email, password: 'smoke-pass-123' });
check('entra con la nueva contraseña', !loginOk.error, loginOk.error?.message);

// 5. Un solo uso
const v2 = await newClient().auth.verifyOtp({ token_hash: r2.data.tokenHash, type: 'recovery' });
check('el mismo enlace no vale dos veces', !!v2.error);

// 5b. Regenerar enlace (recuperación)
const r5 = await call(admin, { action: 'link', userId: r2.data.userId });
check('link devuelve un tokenHash nuevo', !!r5.data?.tokenHash && r5.data.tokenHash !== r2.data.tokenHash, r5);

// 6. Desactivar: el JWT antiguo deja de leer y no puede volver a entrar
const before = await guest.from('locations').select('id');
check('activo: ve localizaciones', (before.data?.length ?? 0) > 0, before.error);
const r6 = await call(admin, { action: 'set-active', userId: r2.data.userId, active: false });
check('set-active false', !!r6.data, r6);
const after = await guest.from('locations').select('id');
check('desactivado con JWT antiguo: 0 filas', !after.error && after.data.length === 0, after);
const banned = await newClient().auth.signInWithPassword({ email, password: 'smoke-pass-123' });
check('desactivado: no puede entrar', !!banned.error);
const r6b = await call(admin, { action: 'link', userId: r2.data.userId });
check('link a desactivado → inactive_user', r6b.code === 'inactive_user', r6b);

// 7. Reactivar
const r7 = await call(admin, { action: 'set-active', userId: r2.data.userId, active: true });
check('set-active true', !!r7.data, r7);
const back = await newClient().auth.signInWithPassword({ email, password: 'smoke-pass-123' });
check('reactivado: vuelve a entrar', !back.error, back.error?.message);

// 8. Último administrador
const { data: me } = await admin.auth.getUser();
const r8 = await call(admin, { action: 'set-active', userId: me.user.id, active: false });
check('desactivar al único admin → last_admin', r8.code === 'last_admin', r8);

// 9. Usuario inexistente
const r9 = await call(admin, { action: 'link', userId: '00000000-0000-0000-0000-000000000000' });
check('link a inexistente → not_found', r9.code === 'not_found', r9);

console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo correcto');
process.exit(failures ? 1 : 0);

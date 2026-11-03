// Prueba de humo de la Edge Function send-push contra Supabase local, con un servicio de push
// falso en el host. Requiere `pnpm db:reset` antes (usa los usuarios, la regla y el secreto de
// Vault del seed). Sale con 1 si algo falla.
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';

const raw = execSync('pnpm exec supabase status -o json', { encoding: 'utf8' });
const status = JSON.parse(raw.slice(raw.indexOf('{')));
const URL = status.API_URL;
const ANON = status.ANON_KEY;
const SERVICE = status.SERVICE_ROLE_KEY;
const DEV_PASSWORD = 'stocka2-dev';
const PORT = 54399;
// Desde los contenedores (edge runtime) el host es host.docker.internal.
const PUSH_HOST = `http://host.docker.internal:${PORT}`;
const F1 = '00000000-0000-4000-8000-000000000102';
const TALLER = '00000000-0000-4000-8000-000000000101';
const ITEM = '00000000-0000-4000-8000-000000000303'; // Grifo monomando

let failures = 0;
function check(name, cond, extra) {
  console.log(
    `${cond ? 'ok   ' : 'FALLO'} ${name}${!cond && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ''}`,
  );
  if (!cond) failures++;
}

// --- Servicio de push falso: /ok responde 201 y /gone 410 -------------------------------------
const received = { '/ok': [], '/gone': [] };
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const list = received[req.url];
    if (!list) {
      res.writeHead(404).end();
      return;
    }
    list.push({ headers: req.headers, body: Buffer.concat(chunks) });
    res.writeHead(req.url === '/ok' ? 201 : 410).end();
  });
});
await new Promise((resolve) => server.listen(PORT, '0.0.0.0', resolve));

// --- Claves de cliente (lo que generaría el navegador) -----------------------------------------
const b64url = (buf) => Buffer.from(buf).toString('base64url');

function clientKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]);
  const auth = crypto.randomBytes(16);
  return { privateKey, raw, auth, p256dh: b64url(raw), authB64: b64url(auth) };
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** Descifra un cuerpo aes128gcm (RFC 8188 + RFC 8291) con las claves del cliente. */
function decrypt(keys, body) {
  const salt = body.subarray(0, 16);
  const idLen = body[20];
  const asPublic = body.subarray(21, 21 + idLen);
  const ciphertext = body.subarray(21 + idLen);
  const asKey = crypto.createPublicKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      x: b64url(asPublic.subarray(1, 33)),
      y: b64url(asPublic.subarray(33, 65)),
    },
    format: 'jwk',
  });
  const ecdh = crypto.diffieHellman({ privateKey: keys.privateKey, publicKey: asKey });
  const prkKey = hmac(keys.auth, ecdh);
  const ikm = hmac(
    prkKey,
    Buffer.concat([Buffer.from('WebPush: info\0'), keys.raw, asPublic, Buffer.from([1])]),
  );
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const decipher = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plain = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  const end = plain.lastIndexOf(2); // delimitador del último registro; después, relleno
  return JSON.parse(plain.subarray(0, end).toString('utf8'));
}

// --- Supabase -----------------------------------------------------------------------------------
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
async function signedIn(email) {
  const c = createClient(URL, ANON, opts);
  const { error } = await c.auth.signInWithPassword({ email, password: DEV_PASSWORD });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return c;
}
const service = createClient(URL, SERVICE, opts);
const admin = await signedIn('admin@stocka2.test');
const furgo1 = await signedIn('furgo1@stocka2.test');

async function operate(client, kind, quantity, extra = {}) {
  const { data, error } = await client.rpc('perform_operation', {
    p_kind: kind,
    p_location_id: F1,
    p_lines: [{ item_id: ITEM, quantity }],
    ...extra,
  });
  if (error) throw new Error(`${kind}: ${error.message}`);
  return data;
}

async function stockF1() {
  const { data, error } = await service
    .from('stock')
    .select('quantity')
    .eq('item_id', ITEM)
    .eq('location_id', F1)
    .maybeSingle();
  if (error) throw new Error(`stock: ${error.message}`);
  return data?.quantity ?? 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms) {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await sleep(200);
}

try {
  // 1. Suscripciones: furgo1 → /ok, admin → /gone
  const furgoKeys = clientKeys();
  const adminKeys = clientKeys();
  const s1 = await furgo1.rpc('save_push_subscription', {
    p_endpoint: `${PUSH_HOST}/ok`,
    p_p256dh: furgoKeys.p256dh,
    p_auth: furgoKeys.authB64,
    p_user_agent: 'smoke-push',
  });
  const s2 = await admin.rpc('save_push_subscription', {
    p_endpoint: `${PUSH_HOST}/gone`,
    p_p256dh: adminKeys.p256dh,
    p_auth: adminKeys.authB64,
    p_user_agent: 'smoke-push',
  });
  check('save_push_subscription (furgo1 y admin)', !s1.error && !s2.error, s1.error ?? s2.error);

  // Stock en Furgoneta 1 (el seed no tiene): el admin lo mueve desde Taller, que no tiene regla.
  await operate(admin, 'move', 3, { p_origin_id: TALLER });
  await sleep(2000);
  check(
    'mover a Furgoneta 1 (sube el stock) no envía nada',
    received['/ok'].length === 0 && received['/gone'].length === 0,
  );

  // 2. Consumo que deja el artículo en 1 (grave según la regla del seed)
  const opId = await operate(furgo1, 'consume', (await stockF1()) - 1);
  await waitFor(() => received['/ok'].length >= 1 && received['/gone'].length >= 1, 10_000);
  check(
    'consumo a nivel grave → 1 petición en /ok',
    received['/ok'].length === 1,
    received['/ok'].length,
  );
  check('… y 1 en /gone', received['/gone'].length === 1, received['/gone'].length);
  const first = received['/ok'][0];
  check('cabecera TTL: 86400', first?.headers.ttl === '86400', first?.headers.ttl);
  check('cabecera Urgency: high', first?.headers.urgency === 'high', first?.headers.urgency);
  check(
    'Content-Encoding: aes128gcm',
    first?.headers['content-encoding'] === 'aes128gcm',
    first?.headers['content-encoding'],
  );
  let payload;
  try {
    payload = first && decrypt(furgoKeys, first.body);
  } catch (e) {
    payload = { error: String(e) };
  }
  const n = payload?.notification;
  check(
    'payload en el formato del service worker de Angular',
    n?.title === 'Stock crítico en Furgoneta 1' &&
      n.body === 'Grifo monomando: quedan 1 (umbral 1)' &&
      n.icon === '/icons/icon-192x192.png' &&
      n.data?.onActionClick?.default?.operation === 'navigateLastFocusedOrOpen' &&
      n.data.onActionClick.default.url === `/localizaciones/${F1}`,
    payload,
  );

  // 3. La suscripción que respondió 410 se ha borrado
  const { data: gone, error: goneError } = await service
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', `${PUSH_HOST}/gone`);
  check('suscripción de /gone borrada', !goneError && gone.length === 0, goneError ?? gone);

  // 4. Un add no envía nada
  const okBefore = received['/ok'].length;
  const goneBefore = received['/gone'].length;
  await operate(furgo1, 'add', 2);
  await sleep(5000);
  check(
    'add en Furgoneta 1 → ninguna petición nueva',
    received['/ok'].length === okBefore && received['/gone'].length === goneBefore,
    { ok: received['/ok'].length, gone: received['/gone'].length },
  );

  // 5. Una fila pendiente en el outbox se envía con el siguiente aviso
  const { error: insError } = await service.from('push_outbox').insert({
    operation_id: opId,
    user_id: '00000000-0000-4000-8000-000000000002',
    title: 'Pendiente',
    body: 'Fila pendiente de la prueba',
    url: `/localizaciones/${F1}`,
  });
  check('insertar fila pendiente en push_outbox', !insError, insError);
  await operate(furgo1, 'consume', await stockF1());
  await waitFor(() => received['/ok'].length >= okBefore + 2, 10_000);
  await sleep(1000); // por si llegara alguna de más
  check(
    'consumo a 0 → /ok recibe 2 peticiones nuevas (la pendiente y la nueva)',
    received['/ok'].length === okBefore + 2,
    received['/ok'].length - okBefore,
  );
  const { count: pending } = await service
    .from('push_outbox')
    .select('id', { count: 'exact', head: true })
    .is('sent_at', null);
  check('outbox sin filas pendientes', pending === 0, pending);
} catch (e) {
  check('sin errores inesperados', false, String(e));
} finally {
  server.close();
}

console.log(failures ? `\n${failures} comprobaciones fallidas` : '\nTodo correcto');
process.exit(failures ? 1 : 0);

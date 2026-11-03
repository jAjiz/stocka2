// Edge Function send-push: vacía push_outbox y envía cada aviso por Web Push a todos los
// dispositivos del destinatario. La llama perform_operation con pg_net (sin JWT, cuerpo `{}`)
// cuando encola avisos graves. No necesita autenticación: claim_push_outbox marca las filas como
// enviadas antes de enviarlas, así que una llamada de más no inventa ni duplica avisos.
// No se reintenta nada: mejor perder un aviso que repetirlo.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const BATCH = 100; // límite por defecto de claim_push_outbox

interface OutboxRow {
  id: number;
  user_id: string;
  title: string;
  body: string;
  url: string;
}

interface Subscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Result {
  sent: number;
  failed: number;
  removed: number;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Formato que entiende el service worker de Angular (ngsw). */
function payload(row: OutboxRow): string {
  return JSON.stringify({
    notification: {
      title: row.title,
      body: row.body,
      icon: '/icons/icon-192x192.png',
      data: {
        onActionClick: {
          default: { operation: 'navigateLastFocusedOrOpen', url: row.url },
        },
      },
    },
  });
}

/** Suscripciones de los usuarios indicados cuyo perfil sigue activo, agrupadas por usuario. */
async function subscriptionsByUser(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, Subscription[]>> {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, profiles!inner(active)')
    .in('user_id', userIds)
    .eq('profiles.active', true);
  if (error) throw error;
  const map = new Map<string, Subscription[]>();
  for (const s of data as Subscription[]) {
    map.set(s.user_id, [...(map.get(s.user_id) ?? []), s]);
  }
  return map;
}

/**
 * Cifra y firma con web-push (como sendNotification) pero envía con fetch: sendNotification usa
 * siempre https.request, que en el runtime de Deno no admite endpoints http (el servicio de push
 * falso de scripts/smoke-push.mjs). Devuelve el código HTTP del servicio de push.
 */
async function send(sub: Subscription, body: string): Promise<number> {
  const request = webpush.generateRequestDetails(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    body,
    { TTL: 86400, urgency: 'high' },
  );
  const res = await fetch(request.endpoint, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: AbortSignal.timeout(15_000), // un servicio de push colgado no bloquea el resto
  });
  await res.body?.cancel();
  return res.status;
}

async function sendBatch(admin: SupabaseClient, rows: OutboxRow[], result: Result) {
  const subs = await subscriptionsByUser(admin, [...new Set(rows.map((r) => r.user_id))]);
  const removed = new Set<string>();

  await Promise.all(
    rows.flatMap((row) =>
      (subs.get(row.user_id) ?? []).map(async (sub) => {
        try {
          const statusCode = await send(sub, payload(row));
          if (statusCode >= 200 && statusCode < 300) {
            result.sent++;
          } else if (statusCode === 404 || statusCode === 410) {
            // El navegador ya no tiene esta suscripción: se borra.
            if (removed.has(sub.id)) return;
            removed.add(sub.id);
            const { error } = await admin.from('push_subscriptions').delete().eq('id', sub.id);
            if (error) console.error('delete subscription', error);
            result.removed++;
          } else {
            console.error('push', sub.endpoint, statusCode);
            result.failed++;
          }
        } catch (e) {
          console.error('push', sub.endpoint, e);
          result.failed++;
        }
      }),
    ),
  );
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'invalid_input' });

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT')!,
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const result: Result = { sent: 0, failed: 0, removed: 0 };
  try {
    for (;;) {
      const { data, error } = await admin.rpc('claim_push_outbox', { p_limit: BATCH });
      if (error) throw error;
      const rows = (data ?? []) as OutboxRow[];
      if (rows.length > 0) await sendBatch(admin, rows, result);
      if (rows.length < BATCH) break;
    }
    return json(200, result);
  } catch (e) {
    console.error(e);
    return json(500, { error: 'unexpected', ...result });
  }
});

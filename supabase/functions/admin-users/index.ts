// Edge Function admin-users: lo que necesita la clave de servicio en la administración de
// usuarios (crear usuarios de Auth, generar enlaces de acceso, banear). Las reglas de negocio
// (solo admins, último admin, permisos) las aplican las RPC, llamadas con el JWT de quien
// llama. Nunca devuelve action_link: ese enlace lo consumiría la vista previa de WhatsApp;
// la app construye su propio enlace con el token_hash y lo canjea con verifyOtp.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = '876000h';
const RPC_CODES = new Set(['forbidden', 'invalid_input', 'not_found', 'last_admin']);

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** Error de RPC → HttpError con su código (P0001) o `unexpected`. */
function rpcError(error: { message?: string }): HttpError {
  const code = error.message ?? '';
  if (RPC_CODES.has(code)) return new HttpError(code === 'forbidden' ? 403 : 400, code);
  console.error('rpc', error);
  return new HttpError(500, 'unexpected');
}

function linkTtlSeconds(): number {
  const n = Number(Deno.env.get('STOCKA2_LINK_TTL_SECONDS') ?? '86400');
  return Number.isFinite(n) && n > 0 ? n : 86400;
}

async function generateLink(admin: SupabaseClient, userId: string) {
  const { data: profile, error } = await admin
    .from('profiles')
    .select('active')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw rpcError(error);
  if (!profile) throw new HttpError(400, 'not_found');
  if (!profile.active) throw new HttpError(400, 'inactive_user');

  const { data: user, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !user.user?.email) throw new HttpError(400, 'not_found');

  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: user.user.email,
  });
  if (linkError || !data.properties?.hashed_token) {
    console.error('generateLink', linkError);
    throw new HttpError(500, 'unexpected');
  }
  return {
    tokenHash: data.properties.hashed_token,
    expiresAt: new Date(Date.now() + linkTtlSeconds() * 1000).toISOString(),
  };
}

async function invite(admin: SupabaseClient, caller: SupabaseClient, body: Record<string, unknown>) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const role = body.role;
  const locationIds = body.locationIds;
  if (
    !EMAIL.test(email) ||
    !displayName ||
    (role !== 'admin' && role !== 'user') ||
    !Array.isArray(locationIds) ||
    !locationIds.every((id) => typeof id === 'string' && UUID.test(id))
  ) {
    throw new HttpError(400, 'invalid_input');
  }

  // Sin contraseña: la crea el invitado al abrir el enlace. La marca stocka2_invited
  // distingue a los invitados de altas por otras vías (trigger on_auth_user_created).
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { stocka2_invited: true },
    user_metadata: { display_name: displayName },
  });
  if (createError || !created.user) {
    if ((createError as { code?: string } | null)?.code === 'email_exists') {
      throw new HttpError(400, 'email_exists');
    }
    console.error('createUser', createError);
    throw new HttpError(500, 'unexpected');
  }
  const userId = created.user.id;

  // GoTrue inserta el usuario y aplica app_metadata después, así que el trigger puede crear
  // el perfil inactivo: se activa explícitamente.
  let { error: updateError } = await caller.rpc('admin_update_user', {
    p_user_id: userId,
    p_display_name: displayName,
    p_role: role,
    p_location_ids: locationIds,
  });
  if (!updateError) {
    ({ error: updateError } = await caller.rpc('admin_set_user_active', {
      p_user_id: userId,
      p_active: true,
    }));
  }
  if (updateError) {
    // Deshacer: sin perfil ni usuario, se puede volver a invitar el mismo correo.
    await admin.from('location_permissions').delete().eq('user_id', userId);
    await admin.from('profiles').delete().eq('id', userId);
    await admin.auth.admin.deleteUser(userId);
    throw rpcError(updateError);
  }

  return { userId, ...(await generateLink(admin, userId)) };
}

async function setActive(admin: SupabaseClient, caller: SupabaseClient, body: Record<string, unknown>) {
  const { userId, active } = body;
  if (typeof userId !== 'string' || !UUID.test(userId) || typeof active !== 'boolean') {
    throw new HttpError(400, 'invalid_input');
  }
  const { error } = await caller.rpc('admin_set_user_active', { p_user_id: userId, p_active: active });
  if (error) throw rpcError(error);

  // El perfil ya está desactivado (RLS le corta las lecturas); el baneo impide además
  // entrar y refrescar el token.
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? 'none' : BAN_FOREVER,
  });
  if (banError) {
    console.error('ban', banError);
    throw new HttpError(500, 'unexpected');
  }
  return {};
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'invalid_input' });

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: 'forbidden' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: isAdmin, error } = await caller.rpc('is_admin');
    if (error || isAdmin !== true) throw new HttpError(403, 'forbidden');

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid_input');

    switch (body.action) {
      case 'invite':
        return json(200, await invite(admin, caller, body));
      case 'link': {
        if (typeof body.userId !== 'string' || !UUID.test(body.userId)) {
          throw new HttpError(400, 'invalid_input');
        }
        return json(200, await generateLink(admin, body.userId));
      }
      case 'set-active':
        return json(200, await setActive(admin, caller, body));
      default:
        throw new HttpError(400, 'invalid_input');
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code });
    console.error(e);
    return json(500, { error: 'unexpected' });
  }
});

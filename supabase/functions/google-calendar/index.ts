import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

type AdminRow = { id: string; email: string; role: string; active?: boolean | null };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string {
  const v = Deno.env.get(name)?.trim() ?? '';
  if (!v) throw new Error(`Secret ${name} ausente`);
  return v;
}

function redirectUri(): string {
  return (
    Deno.env.get('GOOGLE_REDIRECT_URI')?.trim() ||
    `${Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '')}/functions/v1/google-calendar/oauth_callback`
  );
}

function painelBaseUrl(): string {
  return (Deno.env.get('PAINEL_PUBLIC_URL') ?? 'http://localhost:8081').replace(/\/$/, '');
}

/** URL pública do Expo Router. Grupos como `(tabs)` não fazem parte do endereço. */
function painelAgendamentosUrl(query: string): string {
  return `${painelBaseUrl()}/agendamentos?${query}`;
}

async function requireAdmin(
  req: Request,
): Promise<{ admin: AdminRow; supabaseAdmin: ReturnType<typeof createClient>; userJwt: string }> {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw Object.assign(new Error('Não autenticado'), { status: 401 });

  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = env('SUPABASE_ANON_KEY');
  const userJwt = auth.slice(7);

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData.user?.email) {
    throw Object.assign(new Error('Sessão inválida'), { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const email = userData.user.email.trim().toLowerCase();
  const { data: admin, error: adminErr } = await supabaseAdmin
    .from('admin_users')
    .select('id,email,role,active')
    .ilike('email', email)
    .maybeSingle();

  if (adminErr) throw adminErr;
  if (!admin || admin.active === false) {
    throw Object.assign(new Error('Admin inativo ou não encontrado'), { status: 403 });
  }

  return { admin: admin as AdminRow, supabaseAdmin, userJwt };
}

async function getConexao(supabaseAdmin: ReturnType<typeof createClient>) {
  const { data, error } = await supabaseAdmin
    .from('admin_google_calendar_conexao')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data as Record<string, unknown> | null;
}

async function upsertConexao(
  supabaseAdmin: ReturnType<typeof createClient>,
  patch: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin
    .from('admin_google_calendar_conexao')
    .upsert({ id: 1, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function refreshAccessToken(
  supabaseAdmin: ReturnType<typeof createClient>,
  conexao: Record<string, unknown>,
): Promise<string> {
  const refresh = `${conexao.refresh_token ?? ''}`;
  if (!refresh) throw new Error('Agenda Google não conectada.');

  const expiresAt = conexao.expires_at ? Date.parse(`${conexao.expires_at}`) : 0;
  const access = `${conexao.access_token ?? ''}`;
  if (access && Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
    return access;
  }

  const body = new URLSearchParams({
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Falha ao renovar token Google');
  }

  const novoAccess = `${data.access_token}`;
  const expiresIn = Number(data.expires_in ?? 3600);
  await upsertConexao(supabaseAdmin, {
    access_token: novoAccess,
    expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refresh_token: refresh,
    google_account_email: conexao.google_account_email,
    calendar_id: conexao.calendar_id,
    calendar_summary: conexao.calendar_summary,
    connected_by_admin: conexao.connected_by_admin,
    connected_at: conexao.connected_at,
  });
  return novoAccess;
}

async function googleFetch(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `${(data.error as { message?: string } | undefined)?.message || data.error || text || res.statusText}`,
    );
  }
  return data;
}

function extractEmailsFromText(...parts: Array<string | null | undefined>): string[] {
  const joined = parts.filter(Boolean).join(' ');
  const found = joined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))];
}

function mapGoogleEvent(ev: Record<string, unknown>, calendarId: string) {
  const startObj = (ev.start ?? {}) as Record<string, string>;
  const endObj = (ev.end ?? {}) as Record<string, string>;
  const allDay = Boolean(startObj.date && !startObj.dateTime);
  const inicio = startObj.dateTime || (startObj.date ? `${startObj.date}T00:00:00-03:00` : null);
  const fim = endObj.dateTime || (endObj.date ? `${endObj.date}T23:59:59-03:00` : inicio);
  const attendees = Array.isArray(ev.attendees)
    ? (ev.attendees as Array<Record<string, unknown>>).map((a) => ({
        email: `${a.email ?? ''}`.toLowerCase(),
        displayName: a.displayName ?? null,
        responseStatus: a.responseStatus ?? null,
      }))
    : [];

  return {
    google_event_id: `${ev.id}`,
    calendar_id: calendarId,
    titulo: `${ev.summary ?? '(Sem título)'}`,
    descricao: ev.description != null ? `${ev.description}` : null,
    inicio,
    fim: fim ?? inicio,
    all_day: allDay,
    participantes: attendees,
    html_link: ev.htmlLink != null ? `${ev.htmlLink}` : null,
    status: ev.status != null ? `${ev.status}` : null,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function matchClienteId(
  supabaseAdmin: ReturnType<typeof createClient>,
  row: ReturnType<typeof mapGoogleEvent>,
  emailToCliente: Map<string, string>,
): Promise<{ cliente_id: string | null; match_tipo: 'email_auto' | 'nenhum' }> {
  const emails = new Set<string>();
  for (const p of row.participantes as Array<{ email?: string }>) {
    if (p.email) emails.add(p.email.toLowerCase());
  }
  for (const e of extractEmailsFromText(row.titulo, row.descricao)) emails.add(e);

  const hits = [...emails]
    .map((e) => emailToCliente.get(e))
    .filter((id): id is string => Boolean(id));
  const unique = [...new Set(hits)];
  if (unique.length === 1) return { cliente_id: unique[0], match_tipo: 'email_auto' };
  return { cliente_id: null, match_tipo: 'nenhum' };
}

async function loadEmailMap(supabaseAdmin: ReturnType<typeof createClient>) {
  const map = new Map<string, string>();
  const { data, error } = await supabaseAdmin.from('clientes_azoup').select('id,email').not('email', 'is', null);
  if (error) throw error;
  for (const row of data ?? []) {
    const email = `${(row as { email?: string }).email ?? ''}`.trim().toLowerCase();
    if (email) map.set(email, (row as { id: string }).id);
  }
  return map;
}

async function syncEvents(
  supabaseAdmin: ReturnType<typeof createClient>,
  accessToken: string,
  calendarId: string,
  timeMin = new Date(Date.now() - 30 * 86_400_000).toISOString(),
  timeMax = new Date(Date.now() + 90 * 86_400_000).toISOString(),
) {
  const emailMap = await loadEmailMap(supabaseAdmin);

  let pageToken: string | undefined;
  let total = 0;
  const seenIds: string[] = [];

  do {
    const qs = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin,
      timeMax,
      maxResults: '250',
    });
    if (pageToken) qs.set('pageToken', pageToken);

    const data = await googleFetch(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${qs}`,
    );
    const items = (data.items as Record<string, unknown>[] | undefined) ?? [];

    for (const ev of items) {
      if (`${ev.status}` === 'cancelled') continue;
      const mapped = mapGoogleEvent(ev, calendarId);
      if (!mapped.inicio || !mapped.fim) continue;
      seenIds.push(mapped.google_event_id);

      const { data: existing } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .select('id,cliente_id,match_tipo')
        .eq('google_event_id', mapped.google_event_id)
        .maybeSingle();

      const existingRow = existing as { cliente_id?: string | null; match_tipo?: string } | null;
      let cliente_id = existingRow?.cliente_id ?? null;
      let match_tipo = existingRow?.match_tipo ?? 'nenhum';

      if (match_tipo !== 'manual') {
        const matched = await matchClienteId(supabaseAdmin, mapped, emailMap);
        cliente_id = matched.cliente_id;
        match_tipo = matched.match_tipo;
      }

      const { error } = await supabaseAdmin.from('admin_google_agendamentos').upsert(
        {
          ...mapped,
          cliente_id,
          match_tipo,
        },
        { onConflict: 'google_event_id' },
      );
      if (error) throw error;
      total += 1;
    }

    pageToken = data.nextPageToken as string | undefined;
  } while (pageToken);

  return { synced: total };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // .../functions/v1/google-calendar[/oauth_callback]
  const tail = pathParts[pathParts.length - 1];

  try {
    // OAuth callback (GET) — sem JWT do painel
    if (req.method === 'GET' && (tail === 'oauth_callback' || url.searchParams.has('code'))) {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const err = url.searchParams.get('error');
      if (err) {
        return Response.redirect(painelAgendamentosUrl(`gcal_error=${encodeURIComponent(err)}`), 302);
      }
      if (!code) throw new Error('Código OAuth ausente');

      let adminEmail = '';
      try {
        const parsed = JSON.parse(atob(state ?? '')) as { email?: string };
        adminEmail = `${parsed.email ?? ''}`;
      } catch {
        adminEmail = '';
      }

      const tokenBody = new URLSearchParams({
        code,
        client_id: env('GOOGLE_CLIENT_ID'),
        client_secret: env('GOOGLE_CLIENT_SECRET'),
        redirect_uri: redirectUri(),
        grant_type: 'authorization_code',
      });
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      });
      const tokens = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error(tokens.error_description || tokens.error || 'Falha no OAuth Google');
      }

      const accessToken = `${tokens.access_token}`;
      const refreshToken = `${tokens.refresh_token ?? ''}`;
      const expiresIn = Number(tokens.expires_in ?? 3600);

      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const profile = await profileRes.json();
      const googleEmail = `${profile.email ?? ''}`;

      const list = await googleFetch(accessToken, '/users/me/calendarList');
      const items = (list.items as Array<Record<string, unknown>> | undefined) ?? [];
      const primary =
        items.find((c) => c.primary) ||
        items.find((c) => `${c.id}` === googleEmail) ||
        items[0];

      const supabaseAdmin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
      const atual = await getConexao(supabaseAdmin);

      await upsertConexao(supabaseAdmin, {
        google_account_email: googleEmail,
        refresh_token: refreshToken || atual?.refresh_token || null,
        access_token: accessToken,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        calendar_id: primary ? `${primary.id}` : googleEmail,
        calendar_summary: primary ? `${primary.summary ?? primary.id}` : 'Primary',
        connected_by_admin: adminEmail || null,
        connected_at: new Date().toISOString(),
      });

      return Response.redirect(painelAgendamentosUrl('gcal=connected'), 302);
    }

    if (req.method !== 'POST') {
      return json({ error: 'Método não suportado' }, 405);
    }

    const body = (await req.json()) as { op?: string; payload?: Record<string, unknown> };
    const op = `${body.op ?? ''}`.trim();
    const p = body.payload ?? {};

    const { admin, supabaseAdmin } = await requireAdmin(req);

    if (op === 'status_conexao') {
      const conexao = await getConexao(supabaseAdmin);
      return json({
        connected: Boolean(conexao?.refresh_token),
        google_account_email: conexao?.google_account_email ?? null,
        calendar_id: conexao?.calendar_id ?? null,
        calendar_summary: conexao?.calendar_summary ?? null,
        connected_by_admin: conexao?.connected_by_admin ?? null,
        connected_at: conexao?.connected_at ?? null,
      });
    }

    if (op === 'oauth_start') {
      if (`${admin.role}` !== 'owner') return json({ error: 'Somente owner pode conectar a agenda' }, 403);
      const state = btoa(JSON.stringify({ email: admin.email, t: Date.now() }));
      const params = new URLSearchParams({
        client_id: env('GOOGLE_CLIENT_ID'),
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }

    if (op === 'desconectar') {
      if (`${admin.role}` !== 'owner') return json({ error: 'Somente owner pode desconectar' }, 403);
      await upsertConexao(supabaseAdmin, {
        refresh_token: null,
        access_token: null,
        expires_at: null,
        google_account_email: null,
        calendar_id: null,
        calendar_summary: null,
        connected_by_admin: null,
        connected_at: null,
      });
      return json({ ok: true });
    }

    const conexao = await getConexao(supabaseAdmin);
    if (!conexao?.refresh_token) {
      return json({ error: 'Conecte a agenda Google primeiro (owner).' }, 400);
    }

    const accessToken = await refreshAccessToken(supabaseAdmin, conexao);
    const calendarId = `${p.calendar_id ?? conexao.calendar_id ?? ''}`.trim();
    if (!calendarId && op !== 'listar_calendarios') {
      return json({ error: 'Nenhuma agenda selecionada.' }, 400);
    }

    if (op === 'listar_calendarios') {
      const data = await googleFetch(accessToken, '/users/me/calendarList');
      const items = ((data.items as Array<Record<string, unknown>>) ?? []).map((c) => ({
        id: c.id,
        summary: c.summary,
        primary: Boolean(c.primary),
        accessRole: c.accessRole,
      }));
      return json({ calendars: items, selected: conexao.calendar_id ?? null });
    }

    if (op === 'definir_calendario') {
      if (`${admin.role}` !== 'owner') return json({ error: 'Somente owner pode trocar a agenda' }, 403);
      const id = `${p.calendar_id ?? ''}`.trim();
      if (!id) throw new Error('calendar_id obrigatório');
      const data = await googleFetch(accessToken, '/users/me/calendarList');
      const found = ((data.items as Array<Record<string, unknown>>) ?? []).find((c) => `${c.id}` === id);
      await upsertConexao(supabaseAdmin, {
        ...conexao,
        calendar_id: id,
        calendar_summary: found ? `${found.summary ?? id}` : id,
      });
      return json({ ok: true, calendar_id: id });
    }

    if (op === 'sincronizar') {
      const result = await syncEvents(supabaseAdmin, accessToken, calendarId);
      return json({ ok: true, ...result });
    }

    if (op === 'listar_eventos') {
      const inicio = `${p.inicio ?? ''}`.trim();
      const fim = `${p.fim ?? ''}`.trim();
      if (inicio && fim) {
        await syncEvents(supabaseAdmin, accessToken, calendarId, inicio, fim);
      }
      let q = supabaseAdmin
        .from('admin_google_agendamentos')
        .select('*, cliente:clientes_azoup(id,nome,email)')
        .eq('calendar_id', calendarId)
        .order('inicio', { ascending: true });
      if (inicio) q = q.gte('inicio', inicio);
      if (fim) q = q.lte('inicio', fim);
      const { data, error } = await q;
      if (error) throw error;
      return json({ eventos: data ?? [] });
    }

    if (op === 'criar_evento') {
      const titulo = `${p.titulo ?? ''}`.trim();
      if (!titulo) throw new Error('Informe o título');
      const inicioIso = `${p.inicio ?? ''}`.trim();
      const fimIso = `${p.fim ?? ''}`.trim();
      if (!inicioIso || !fimIso) throw new Error('Informe início e fim');
      const descricao = `${p.descricao ?? ''}`.trim() || undefined;
      const emails = Array.isArray(p.participantes)
        ? (p.participantes as unknown[]).map((e) => `${e}`.trim().toLowerCase()).filter(Boolean)
        : [];

      const bodyEvent: Record<string, unknown> = {
        summary: titulo,
        description: descricao,
        start: { dateTime: inicioIso, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: fimIso, timeZone: 'America/Sao_Paulo' },
      };
      if (emails.length) {
        bodyEvent.attendees = emails.map((email) => ({ email }));
      }

      const created = await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
        { method: 'POST', body: JSON.stringify(bodyEvent) },
      );

      const mapped = mapGoogleEvent(created, calendarId);
      const emailMap = await loadEmailMap(supabaseAdmin);
      let cliente_id = `${p.cliente_id ?? ''}`.trim() || null;
      let match_tipo: 'email_auto' | 'manual' | 'nenhum' = cliente_id ? 'manual' : 'nenhum';
      if (!cliente_id) {
        const matched = await matchClienteId(supabaseAdmin, mapped, emailMap);
        cliente_id = matched.cliente_id;
        match_tipo = matched.match_tipo;
      }

      const { data: row, error } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .upsert({ ...mapped, cliente_id, match_tipo }, { onConflict: 'google_event_id' })
        .select('*, cliente:clientes_azoup(id,nome,email)')
        .single();
      if (error) throw error;
      return json({ evento: row });
    }

    if (op === 'atualizar_evento') {
      const googleEventId = `${p.google_event_id ?? ''}`.trim();
      if (!googleEventId) throw new Error('google_event_id obrigatório');
      const titulo = `${p.titulo ?? ''}`.trim();
      const inicioIso = `${p.inicio ?? ''}`.trim();
      const fimIso = `${p.fim ?? ''}`.trim();
      if (!titulo || !inicioIso || !fimIso) throw new Error('Título, início e fim são obrigatórios');

      const emails = Array.isArray(p.participantes)
        ? (p.participantes as unknown[]).map((e) => `${e}`.trim().toLowerCase()).filter(Boolean)
        : [];

      const bodyEvent: Record<string, unknown> = {
        summary: titulo,
        description: `${p.descricao ?? ''}`.trim() || null,
        start: { dateTime: inicioIso, timeZone: 'America/Sao_Paulo' },
        end: { dateTime: fimIso, timeZone: 'America/Sao_Paulo' },
        attendees: emails.map((email) => ({ email })),
      };

      const updated = await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
        { method: 'PUT', body: JSON.stringify(bodyEvent) },
      );

      const mapped = mapGoogleEvent(updated, calendarId);
      const { data: existing } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .select('cliente_id,match_tipo')
        .eq('google_event_id', googleEventId)
        .maybeSingle();

      let cliente_id = (existing as { cliente_id?: string | null } | null)?.cliente_id ?? null;
      let match_tipo = (existing as { match_tipo?: string } | null)?.match_tipo ?? 'nenhum';
      if (p.cliente_id !== undefined) {
        const cid = `${p.cliente_id ?? ''}`.trim();
        cliente_id = cid || null;
        match_tipo = cliente_id ? 'manual' : 'nenhum';
      } else if (match_tipo !== 'manual') {
        const emailMap = await loadEmailMap(supabaseAdmin);
        const matched = await matchClienteId(supabaseAdmin, mapped, emailMap);
        cliente_id = matched.cliente_id;
        match_tipo = matched.match_tipo;
      }

      const { data: row, error } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .upsert({ ...mapped, cliente_id, match_tipo }, { onConflict: 'google_event_id' })
        .select('*, cliente:clientes_azoup(id,nome,email)')
        .single();
      if (error) throw error;
      return json({ evento: row });
    }

    if (op === 'excluir_evento') {
      const googleEventId = `${p.google_event_id ?? ''}`.trim();
      if (!googleEventId) throw new Error('google_event_id obrigatório');
      await googleFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}?sendUpdates=all`,
        { method: 'DELETE' },
      );
      const { error } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .delete()
        .eq('google_event_id', googleEventId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (op === 'vincular_cliente') {
      const id = `${p.id ?? ''}`.trim();
      const clienteId = `${p.cliente_id ?? ''}`.trim();
      if (!id || !clienteId) throw new Error('id e cliente_id obrigatórios');
      const { data, error } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .update({ cliente_id: clienteId, match_tipo: 'manual', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, cliente:clientes_azoup(id,nome,email)')
        .single();
      if (error) throw error;
      return json({ evento: data });
    }

    if (op === 'desvincular_cliente') {
      const id = `${p.id ?? ''}`.trim();
      if (!id) throw new Error('id obrigatório');
      const { data, error } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .update({ cliente_id: null, match_tipo: 'nenhum', updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, cliente:clientes_azoup(id,nome,email)')
        .single();
      if (error) throw error;
      return json({ evento: data });
    }

    if (op === 'proximas_por_clientes') {
      const ids = Array.isArray(p.cliente_ids)
        ? (p.cliente_ids as unknown[]).map((x) => `${x}`).filter(Boolean)
        : [];
      if (!ids.length) return json({ proximas: {} });
      const agora = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('admin_google_agendamentos')
        .select('cliente_id,inicio')
        .in('cliente_id', ids)
        .gte('inicio', agora)
        .order('inicio', { ascending: true });
      if (error) throw error;
      const proximas: Record<string, string> = {};
      for (const row of data ?? []) {
        const cid = `${(row as { cliente_id?: string }).cliente_id ?? ''}`;
        const inicio = `${(row as { inicio?: string }).inicio ?? ''}`;
        if (cid && inicio && !proximas[cid]) proximas[cid] = inicio;
      }
      return json({ proximas });
    }

    return json({ error: `Operação desconhecida: ${op}` }, 400);
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500;
    const message = e instanceof Error ? e.message : 'Erro interno';
    console.error('[google-calendar]', message);
    return json({ error: message }, status);
  }
});

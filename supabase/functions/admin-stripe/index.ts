import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_SCREEN_KEYS = ['dashboard', 'clients', 'conversas', 'billing', 'audit', 'admins', 'marketing', 'config_suporte', 'metodo360', 'acompanhamento'] as const;

function normalizarTelasAcesso(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => `${t}`.trim())
    .filter((t) => (ADMIN_SCREEN_KEYS as readonly string[]).includes(t));
}

type AuthApiErrorLike = { message?: string; status?: number; code?: string };

function isAuthEmailAlreadyExists(err: AuthApiErrorLike | null | undefined): boolean {
  if (!err) return false;
  const msg = `${err.message ?? ''}`.toLowerCase();
  if (
    msg.includes('already') ||
    msg.includes('registered') ||
    msg.includes('exists') ||
    msg.includes('cadastrad') ||
    msg.includes('existe')
  ) {
    return true;
  }
  if (err.status === 422) return true;
  if (`${err.code ?? ''}`.toLowerCase() === 'email_exists') return true;
  return false;
}

async function findAuthUserByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
): Promise<{ id: string; email?: string | null } | null> {
  const normalized = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (page <= 50) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const hit = data.users.find((u) => (u.email ?? '').trim().toLowerCase() === normalized);
    if (hit) return { id: hit.id, email: hit.email };

    if (data.users.length < perPage) break;
    page += 1;
  }

  return null;
}

async function ensureAuthUserForAdminLogin(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  password: string,
): Promise<{ authUserId: string; linkedExisting: boolean }> {
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!createErr && created?.user?.id) {
    return { authUserId: created.user.id, linkedExisting: false };
  }

  if (!isAuthEmailAlreadyExists(createErr)) {
    throw createErr ?? new Error('Falha ao criar usuário no Auth');
  }

  const existing = await findAuthUserByEmail(supabaseAdmin, email);
  if (!existing) {
    throw new Error(
      'E-mail já existe no Auth, mas não foi possível localizar o usuário para vincular o acesso administrativo.',
    );
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  });
  if (updateErr) throw updateErr;

  return { authUserId: existing.id, linkedExisting: true };
}

const NF_CHUNK = 80;

async function contarNotasFiscaisGeradasDoCliente(
  supabaseAdmin: ReturnType<typeof createClient>,
  clienteId: string,
): Promise<number> {
  const ids = new Set<string>();

  const { data: direto, error: errDireto } = await supabaseAdmin
    .from('nota_fiscal')
    .select('id')
    .eq('cliente_id_tenant', clienteId)
    .not('numero', 'is', null)
    .is('cancelado_em', null);
  if (errDireto) throw errDireto;
  for (const row of direto ?? []) ids.add(String(row.id));

  const [vendasRes, fatRes, empRes] = await Promise.all([
    supabaseAdmin.from('venda').select('id').eq('cliente_id_tenant', clienteId),
    supabaseAdmin.from('venda_faturamento').select('id').eq('cliente_id_tenant', clienteId),
    supabaseAdmin.from('empresas').select('id').eq('cliente_id', clienteId),
  ]);
  if (vendasRes.error) throw vendasRes.error;
  if (fatRes.error) throw fatRes.error;
  if (empRes.error) throw empRes.error;

  const relacoes: Array<{ campo: 'venda_id' | 'venda_faturamento_id' | 'empresa_id'; ids: (string | number)[] }> = [
    { campo: 'venda_id', ids: (vendasRes.data ?? []).map((v) => v.id as number) },
    { campo: 'venda_faturamento_id', ids: (fatRes.data ?? []).map((f) => f.id as string) },
    { campo: 'empresa_id', ids: (empRes.data ?? []).map((e) => e.id as string) },
  ];

  for (const { campo, ids: foreignIds } of relacoes) {
    for (let i = 0; i < foreignIds.length; i += NF_CHUNK) {
      const chunk = foreignIds.slice(i, i + NF_CHUNK);
      const { data, error } = await supabaseAdmin
        .from('nota_fiscal')
        .select('id')
        .in(campo, chunk)
        .not('numero', 'is', null)
        .is('cancelado_em', null);
      if (error) throw error;
      for (const row of data ?? []) ids.add(String(row.id));
    }
  }

  return ids.size;
}

function reaisParaCentavos(reais: number): number {
  return Math.round(Number(reais) * 100);
}

function centavosParaReais(centavos: number): number {
  return Math.round(Number(centavos)) / 100;
}

function isStatusAssinaturaAtivaLocal(status: string | null | undefined): boolean {
  const s = `${status ?? ''}`.trim().toLowerCase();
  if (!s) return false;
  if (s.includes('cancel') || s.includes('encerr') || s.includes('inativ')) return false;
  if (s.includes('trial') || s.includes('teste')) return false;
  if (s.includes('inadimpl') || s.includes('vencid') || s.includes('atrasad') || s.includes('past_due')) return false;
  return s.includes('ativo') || s.includes('ativa') || s === 'active' || s.includes('active');
}

type MrrAssinaturaValor = {
  liquido_centavos: number;
  bruto_centavos: number;
  desconto_centavos: number;
};

function aplicarDescontoStripe(brutoCentavos: number, discount: Stripe.Discount | null | undefined): MrrAssinaturaValor {
  const bruto = Math.max(0, Math.round(brutoCentavos));
  if (!discount?.coupon || bruto <= 0) {
    return { liquido_centavos: bruto, bruto_centavos: bruto, desconto_centavos: 0 };
  }
  const coupon = discount.coupon;
  let desconto = 0;
  if (coupon.percent_off != null) {
    desconto = Math.round((bruto * Number(coupon.percent_off)) / 100);
  } else if (coupon.amount_off != null) {
    desconto = Math.min(bruto, Math.round(Number(coupon.amount_off)));
  }
  return {
    bruto_centavos: bruto,
    desconto_centavos: desconto,
    liquido_centavos: Math.max(0, bruto - desconto),
  };
}

function mrrDeItensAssinatura(subscription: Stripe.Subscription): MrrAssinaturaValor {
  let bruto = 0;
  for (const item of subscription.items?.data ?? []) {
    const unit = item.price?.unit_amount ?? 0;
    const qty = item.quantity ?? 1;
    if (item.price?.recurring?.interval === 'year') {
      bruto += Math.round((unit * qty) / 12);
    } else {
      bruto += unit * qty;
    }
  }
  return aplicarDescontoStripe(bruto, subscription.discount);
}

async function mrrDeAssinaturaStripe(stripe: Stripe, subscriptionId: string): Promise<MrrAssinaturaValor> {
  try {
    const upcoming = await stripe.invoices.retrieveUpcoming({ subscription: subscriptionId });
    const liquido = Math.max(0, Math.round(Number(upcoming.total ?? 0)));
    const descontoLista = upcoming.total_discount_amounts ?? [];
    const desconto = Math.max(
      0,
      descontoLista.reduce((acc, d) => acc + Math.round(Number(d.amount ?? 0)), 0),
    );
    const bruto = Math.max(liquido + desconto, Math.round(Number(upcoming.subtotal ?? liquido + desconto)));
    return {
      liquido_centavos: liquido,
      bruto_centavos: bruto,
      desconto_centavos: Math.min(desconto, bruto),
    };
  } catch {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['discount', 'items.data.price'],
    });
    return mrrDeItensAssinatura(subscription);
  }
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const partial = await Promise.all(chunk.map(fn));
    out.push(...partial);
  }
  return out;
}

function parseNumeroPositivo(raw: unknown, campo: string, obrigatorio = true): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    if (!obrigatorio && (raw == null || `${raw}`.trim() === '')) return 0;
    throw new Error(`${campo} inválido`);
  }
  if (n < 0) throw new Error(`${campo} não pode ser negativo`);
  return n;
}

async function criarPrecoMensalStripe(
  stripe: Stripe,
  productId: string,
  valorReais: number,
  metadata: Record<string, string>,
) {
  if (valorReais <= 0) return null;
  return stripe.prices.create({
    product: productId,
    unit_amount: reaisParaCentavos(valorReais),
    currency: 'brl',
    recurring: { interval: 'month' },
    metadata,
  });
}

function contarPorCampo(
  rows: Array<Record<string, unknown>> | null | undefined,
  campo: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const key = `${row[campo] ?? ''}`.trim();
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

function pickBestAssinatura(
  rows: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  if (!rows.length) return null;
  const score = (status: unknown) => {
    const s = `${status ?? ''}`.trim().toLowerCase();
    if (s.includes('cancel') || s.includes('encerr') || s.includes('inativ')) return 10;
    if (s.includes('trial') || s.includes('teste')) return 90;
    if (s.includes('inadimpl') || s.includes('past_due')) return 70;
    if (s.includes('ativo') || s.includes('ativa') || s.includes('active')) return 100;
    return 50;
  };
  return [...rows].sort((a, b) => {
    const diff = score(b.status) - score(a.status);
    if (diff !== 0) return diff;
    const da = `${b.atualizado_em ?? b.data_inicio ?? b.criado_em ?? ''}`;
    const db = `${a.atualizado_em ?? a.data_inicio ?? a.criado_em ?? ''}`;
    return da.localeCompare(db);
  })[0] ?? null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!stripeSecret || !supabaseUrl || !serviceRole || !anonKey) {
      throw new Error('Variáveis de ambiente Stripe/Supabase ausentes na função.');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace('Bearer ', '').trim();
    const supabaseAdmin = createClient(supabaseUrl, serviceRole);

    let user = null;
    let userErr: { message?: string } | null = null;

    if (anonKey) {
      const supabaseAuth = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const authResult = await supabaseAuth.auth.getUser(jwt);
      user = authResult.data.user;
      userErr = authResult.error;
    }

    if (!user) {
      const adminAuthResult = await supabaseAdmin.auth.getUser(jwt);
      user = adminAuthResult.data.user;
      userErr = adminAuthResult.error ?? userErr;
    }

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminRow, error: adminErr } = await supabaseAdmin
      .from('admin_users')
      .select('id,role,active,email,telas_acesso')
      .ilike('email', `${user.email ?? ''}`.trim())
      .eq('active', true)
      .maybeSingle();

    if (adminErr || !adminRow) {
      return new Response(JSON.stringify({ error: 'Permissão negada' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as { op?: string; payload?: Record<string, unknown> };

    if (body.op === 'get_admin_profile') {
      return new Response(JSON.stringify({ admin_profile: adminRow }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'register_audit_log') {
      const p = body.payload ?? {};
      const action = `${p.acao ?? p.action ?? ''}`.trim();
      if (!action) throw new Error('acao/action obrigatório');

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('admin_audit_logs')
        .insert({
          action,
          target_type: p.entidade ?? p.target_type ?? null,
          target_id: p.entidade_id != null ? String(p.entidade_id) : p.target_id != null ? String(p.target_id) : null,
          admin_email: user.email ?? null,
          payload: {
            valores_anteriores: p.valores_anteriores ?? p.old_values ?? null,
            valores_novos: p.valores_novos ?? p.new_values ?? null,
          },
        } as never)
        .select('id')
        .single();

      if (insErr) throw insErr;

      return new Response(JSON.stringify({ ok: true, id: inserted?.id ?? null }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'get_cliente_metricas') {
      const clienteId = `${body.payload?.cliente_id ?? ''}`.trim();
      if (!clienteId) throw new Error('cliente_id obrigatório');

      const [empresasRes, produtosRes, vendasRes, opsRes, usuariosRes, vendaAt, prodAt, opAt] = await Promise.all([
        supabaseAdmin.from('empresas').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId),
        supabaseAdmin.from('produtos').select('id', { count: 'exact', head: true }).eq('cliente_id', clienteId),
        supabaseAdmin.from('venda').select('id', { count: 'exact', head: true }).eq('cliente_id_tenant', clienteId),
        supabaseAdmin.from('producao_op').select('id', { count: 'exact', head: true }).eq('cliente_id_tenant', clienteId),
        supabaseAdmin.from('usuarios').select('auth_id').eq('cliente_id', clienteId).not('auth_id', 'is', null),
        supabaseAdmin
          .from('venda')
          .select('updated_at,created_at')
          .eq('cliente_id_tenant', clienteId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('produtos')
          .select('updated_at,created_at')
          .eq('cliente_id', clienteId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('producao_op')
          .select('updated_at,created_at')
          .eq('cliente_id_tenant', clienteId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (empresasRes.error) throw empresasRes.error;
      if (produtosRes.error) throw produtosRes.error;
      if (vendasRes.error) throw vendasRes.error;
      if (opsRes.error) throw opsRes.error;
      if (usuariosRes.error) throw usuariosRes.error;

      const notasFiscaisEmitidas = await contarNotasFiscaisGeradasDoCliente(supabaseAdmin, clienteId);

      const authIds = [...new Set((usuariosRes.data ?? []).map((u) => u.auth_id).filter(Boolean))] as string[];

      let ultimoLoginAuth: string | null = null;
      for (const authId of authIds) {
        const { data: authData, error: authUserErr } = await supabaseAdmin.auth.admin.getUserById(authId);
        if (authUserErr) continue;
        const at = authData?.user?.last_sign_in_at ?? null;
        if (at && (!ultimoLoginAuth || at > ultimoLoginAuth)) ultimoLoginAuth = at;
      }

      let ultimaAtividade: string | null = null;
      for (const row of [vendaAt.data, prodAt.data, opAt.data]) {
        const rec = row as { updated_at?: string | null; created_at?: string | null } | null;
        const at = rec?.updated_at ?? rec?.created_at ?? null;
        if (at && (!ultimaAtividade || at > ultimaAtividade)) ultimaAtividade = at;
      }

      const ultimoAcesso =
        ultimoLoginAuth && ultimaAtividade
          ? ultimoLoginAuth >= ultimaAtividade
            ? ultimoLoginAuth
            : ultimaAtividade
          : ultimoLoginAuth ?? ultimaAtividade;

      const ultimoAcessoFonte: 'auth' | 'atividade' | null = !ultimoAcesso
        ? null
        : ultimoLoginAuth && (!ultimaAtividade || ultimoLoginAuth >= ultimaAtividade)
          ? 'auth'
          : 'atividade';

      return new Response(
        JSON.stringify({
          metricas: {
            empresas_cadastradas: empresasRes.count ?? 0,
            produtos_cadastrados: produtosRes.count ?? 0,
            vendas: vendasRes.count ?? 0,
            ordens_producao: opsRes.count ?? 0,
            notas_fiscais_emitidas: notasFiscaisEmitidas,
            ultimo_acesso: ultimoAcesso,
            ultimo_acesso_fonte: ultimoAcessoFonte,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (body.op === 'list_acompanhamento') {
      const { data: clientes, error: cliErr } = await supabaseAdmin
        .from('clientes_azoup')
        .select('id,nome,nome_fantasia,razao_social,email,telefone,celular,created_at')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (cliErr) throw cliErr;

      const rows = clientes ?? [];
      const ids = rows.map((c) => c.id as string);
      if (!ids.length) {
        return new Response(JSON.stringify({ clientes: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const [
        assinaturasRes,
        empresasRes,
        produtosRes,
        vendasRes,
        opsRes,
        clientesCadRes,
        fornecedoresRes,
        planosRes,
      ] = await Promise.all([
        supabaseAdmin
          .from('assinaturas_clientes')
          .select(
            'id,cliente_id,plano_id,status,trial_fim,data_inicio,data_proxima_cobranca,periodo_fim,criado_em,atualizado_em,valor_mensal_atual',
          )
          .in('cliente_id', ids)
          .limit(10000),
        supabaseAdmin
          .from('empresas')
          .select('cliente_id,razao_social,nome_fantasia,cnpj')
          .in('cliente_id', ids)
          .eq('empresa_matriz', true),
        supabaseAdmin.from('produtos').select('cliente_id').in('cliente_id', ids).limit(50000),
        supabaseAdmin.from('venda').select('cliente_id_tenant').in('cliente_id_tenant', ids).limit(50000),
        supabaseAdmin.from('producao_op').select('cliente_id_tenant').in('cliente_id_tenant', ids).limit(50000),
        supabaseAdmin.from('clientes_cadastros').select('cliente_id').in('cliente_id', ids).limit(50000),
        supabaseAdmin.from('fornecedores_cadastros').select('cliente_id').in('cliente_id', ids).limit(50000),
        supabaseAdmin.from('planos_assinatura').select('id,nome'),
      ]);

      if (assinaturasRes.error) throw assinaturasRes.error;
      if (empresasRes.error) throw empresasRes.error;
      if (produtosRes.error) throw produtosRes.error;
      if (vendasRes.error) throw vendasRes.error;
      if (opsRes.error) throw opsRes.error;
      // cadastros podem falhar por RLS/tabela ausente — degradar para 0
      if (clientesCadRes.error) {
        console.warn('[list_acompanhamento] clientes_cadastros:', clientesCadRes.error.message);
      }
      if (fornecedoresRes.error) {
        console.warn('[list_acompanhamento] fornecedores_cadastros:', fornecedoresRes.error.message);
      }

      const planosMap = new Map<string, string>();
      for (const p of planosRes.data ?? []) {
        planosMap.set(String(p.id), `${p.nome ?? p.id}`);
      }

      const assinPorCliente = new Map<string, Record<string, unknown>[]>();
      for (const a of (assinaturasRes.data ?? []) as Record<string, unknown>[]) {
        const cid = `${a.cliente_id}`;
        const arr = assinPorCliente.get(cid) ?? [];
        arr.push(a);
        assinPorCliente.set(cid, arr);
      }

      const empresaPorCliente = new Map<string, Record<string, unknown>>();
      for (const e of (empresasRes.data ?? []) as Record<string, unknown>[]) {
        empresaPorCliente.set(`${e.cliente_id}`, e);
      }

      const produtosCount = contarPorCampo(produtosRes.data as Array<Record<string, unknown>>, 'cliente_id');
      const vendasCount = contarPorCampo(
        vendasRes.data as Array<Record<string, unknown>>,
        'cliente_id_tenant',
      );
      const opsCount = contarPorCampo(
        opsRes.data as Array<Record<string, unknown>>,
        'cliente_id_tenant',
      );
      const clientesCadCount = clientesCadRes.error
        ? new Map<string, number>()
        : contarPorCampo(clientesCadRes.data as Array<Record<string, unknown>>, 'cliente_id');
      const fornecedoresCount = fornecedoresRes.error
        ? new Map<string, number>()
        : contarPorCampo(fornecedoresRes.data as Array<Record<string, unknown>>, 'cliente_id');

      const payload = rows.map((c) => {
        const id = c.id as string;
        const assinatura = pickBestAssinatura(assinPorCliente.get(id) ?? []);
        const empresa = empresaPorCliente.get(id) ?? null;
        const planoId = assinatura?.plano_id != null ? String(assinatura.plano_id) : null;
        return {
          id,
          nome: c.nome_fantasia ?? c.nome ?? c.razao_social ?? c.email ?? `Cliente ${id.slice(0, 8)}`,
          email: c.email ?? null,
          telefone: c.telefone ?? null,
          celular: c.celular ?? null,
          created_at: c.created_at ?? null,
          empresa_nome: empresa
            ? `${empresa.nome_fantasia ?? ''}`.trim() || `${empresa.razao_social ?? ''}`.trim() || null
            : null,
          empresa_cnpj: empresa?.cnpj ?? null,
          produtos: produtosCount.get(id) ?? 0,
          vendas: vendasCount.get(id) ?? 0,
          ordens_producao: opsCount.get(id) ?? 0,
          clientes_cadastrados: clientesCadCount.get(id) ?? 0,
          fornecedores_cadastrados: fornecedoresCount.get(id) ?? 0,
          plano_id: planoId,
          plano_nome: planoId ? planosMap.get(planoId) ?? null : null,
          assinatura_status: assinatura?.status ?? null,
          trial_fim: assinatura?.trial_fim ?? null,
          data_inicio: assinatura?.data_inicio ?? null,
          data_renovacao: assinatura?.data_proxima_cobranca ?? assinatura?.periodo_fim ?? null,
          valor_mensal_atual: assinatura?.valor_mensal_atual ?? null,
        };
      });

      return new Response(JSON.stringify({ clientes: payload }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'list_admin_users') {
      if (`${adminRow.role}` !== 'owner') {
        return new Response(JSON.stringify({ error: 'Permissão negada' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: admins, error: listErr } = await supabaseAdmin
        .from('admin_users')
        .select('id,email,role,active,telas_acesso,created_at,updated_at')
        .order('created_at', { ascending: false });
      if (listErr) throw listErr;
      return new Response(JSON.stringify({ admins: admins ?? [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'create_admin_login') {
      if (`${adminRow.role}` !== 'owner') {
        return new Response(JSON.stringify({ error: 'Permissão negada' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const p = body.payload ?? {};
      const email = `${p.email ?? ''}`.trim().toLowerCase();
      const role = `${p.role ?? 'viewer'}` as 'owner' | 'manager' | 'viewer';
      const active = Boolean(p.active ?? true);
      const password = `${p.password ?? ''}`;

      if (!email) throw new Error('email obrigatório');
      if (!['owner', 'manager', 'viewer'].includes(role)) throw new Error('role inválido');
      if (password.length < 6) throw new Error('password deve ter ao menos 6 caracteres');

      const telas_acesso = normalizarTelasAcesso(p.telas_acesso);
      if (telas_acesso.length === 0) throw new Error('Selecione ao menos uma tela');
      if (telas_acesso.includes('admins') && role !== 'owner') {
        throw new Error('A tela Acessos só pode ser liberada para perfil owner');
      }

      const { authUserId, linkedExisting } = await ensureAuthUserForAdminLogin(
        supabaseAdmin,
        email,
        password,
      );

      const { data: adminUpsert, error: adminUpsertErr } = await supabaseAdmin
        .from('admin_users')
        .upsert(
          {
            email,
            role,
            active,
            telas_acesso,
            created_by_admin: user.email ?? null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: 'email' },
        )
        .select('id,email,role,active,telas_acesso,created_at,updated_at')
        .single();

      if (adminUpsertErr) throw adminUpsertErr;

      return new Response(JSON.stringify({
        admin: adminUpsert,
        auth_user_id: authUserId,
        linked_existing_auth: linkedExisting,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'update_admin_user') {
      if (`${adminRow.role}` !== 'owner') {
        return new Response(JSON.stringify({ error: 'Permissão negada' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const p = body.payload ?? {};
      const id = `${p.id ?? ''}`.trim();
      const role = `${p.role ?? ''}`.trim() as 'owner' | 'manager' | 'viewer';
      const active = Boolean(p.active ?? true);

      if (!id) throw new Error('id obrigatório');
      if (!['owner', 'manager', 'viewer'].includes(role)) throw new Error('role inválido');

      const telas_acesso = normalizarTelasAcesso(p.telas_acesso);
      if (telas_acesso.length === 0) throw new Error('Selecione ao menos uma tela');
      if (telas_acesso.includes('admins') && role !== 'owner') {
        throw new Error('A tela Acessos só pode ser liberada para perfil owner');
      }

      const { data: alvo, error: alvoErr } = await supabaseAdmin
        .from('admin_users')
        .select('id,email,role')
        .eq('id', id)
        .maybeSingle();

      if (alvoErr) throw alvoErr;
      if (!alvo) throw new Error('Admin não encontrado');

      const { data: atualizado, error: updErr } = await supabaseAdmin
        .from('admin_users')
        .update({
          role,
          active,
          telas_acesso,
          updated_at: new Date().toISOString(),
        } as never)
        .eq('id', id)
        .select('id,email,role,active,telas_acesso,created_at,updated_at')
        .single();

      if (updErr) throw updErr;

      return new Response(JSON.stringify({ admin: atualizado }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['owner', 'manager'].includes(`${adminRow.role}`)) {
      return new Response(JSON.stringify({ error: 'Permissão negada' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

    if (body.op === 'get_subscription') {
      const subId = body.payload?.stripe_subscription_id as string | undefined;
      if (!subId) throw new Error('stripe_subscription_id obrigatório');
      const subscription = await stripe.subscriptions.retrieve(subId, {
        expand: ['latest_invoice', 'customer'],
      });
      return new Response(JSON.stringify({ subscription }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'compute_mrr') {
      const { data: assinaturas, error: assErr } = await supabaseAdmin
        .from('assinaturas_clientes')
        .select('id,cliente_id,status,stripe_subscription_id,valor_mensal_atual')
        .not('stripe_subscription_id', 'is', null)
        .limit(5000);

      if (assErr) throw assErr;

      const ativas = (assinaturas ?? []).filter((a) => {
        const sid = `${a.stripe_subscription_id ?? ''}`.trim();
        return sid.length > 0 && isStatusAssinaturaAtivaLocal(a.status as string | null);
      });

      // Uma assinatura por cliente (prioriza a primeira ativa encontrada)
      const porCliente = new Map<string, (typeof ativas)[number]>();
      for (const a of ativas) {
        const cid = `${a.cliente_id}`;
        if (!porCliente.has(cid)) porCliente.set(cid, a);
      }
      const unicas = [...porCliente.values()];

      type ItemResult = {
        id: number | string;
        ok: boolean;
        liquido_centavos: number;
        bruto_centavos: number;
        desconto_centavos: number;
        erro?: string;
      };

      const resultados = await mapInBatches(unicas, 8, async (a): Promise<ItemResult> => {
        const subId = `${a.stripe_subscription_id}`.trim();
        try {
          const valores = await mrrDeAssinaturaStripe(stripe, subId);
          const valorReais = centavosParaReais(valores.liquido_centavos);
          await supabaseAdmin
            .from('assinaturas_clientes')
            .update({
              valor_mensal_atual: valorReais,
              atualizado_em: new Date().toISOString(),
            } as never)
            .eq('id', a.id);

          return {
            id: a.id as number | string,
            ok: true,
            liquido_centavos: valores.liquido_centavos,
            bruto_centavos: valores.bruto_centavos,
            desconto_centavos: valores.desconto_centavos,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Falha ao consultar Stripe';
          // Fallback: valor já gravado no banco
          const fallbackCentavos =
            a.valor_mensal_atual != null ? Math.round(Number(a.valor_mensal_atual) * 100) : 0;
          return {
            id: a.id as number | string,
            ok: false,
            liquido_centavos: fallbackCentavos,
            bruto_centavos: fallbackCentavos,
            desconto_centavos: 0,
            erro: msg,
          };
        }
      });

      let mrr_centavos = 0;
      let mrr_bruto_centavos = 0;
      let desconto_centavos = 0;
      let assinaturas_com_desconto = 0;
      let assinaturas_consultadas = 0;
      let assinaturas_com_erro = 0;

      for (const r of resultados) {
        assinaturas_consultadas += 1;
        if (!r.ok) assinaturas_com_erro += 1;
        mrr_centavos += r.liquido_centavos;
        mrr_bruto_centavos += r.bruto_centavos;
        desconto_centavos += r.desconto_centavos;
        if (r.desconto_centavos > 0) assinaturas_com_desconto += 1;
      }

      return new Response(
        JSON.stringify({
          mrr_centavos,
          mrr_bruto_centavos,
          desconto_centavos,
          assinaturas_com_desconto,
          assinaturas_consultadas,
          assinaturas_com_erro,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (body.op === 'create_coupon') {
      const p = body.payload ?? {};
      const codigo = `${p.codigo ?? ''}`.trim();
      if (!codigo) throw new Error('Código promocional obrigatório');

      const duration = p.duration as 'once' | 'repeating' | 'forever';
      const couponParams: Stripe.CouponCreateParams = {
        name: (p.nome as string | undefined) ?? codigo,
        duration,
        ...(duration === 'repeating'
          ? { duration_in_months: Number(p.duration_in_months ?? 3) }
          : {}),
      };

      if (p.percent_off != null) {
        couponParams.percent_off = Number(p.percent_off);
      } else if (p.amount_off_centavos != null) {
        couponParams.amount_off = Number(p.amount_off_centavos);
        couponParams.currency = ((p.currency as string | undefined) ?? 'brl').toLowerCase();
      } else {
        throw new Error('Informe percent_off ou amount_off_centavos');
      }

      if (p.max_redemptions != null) couponParams.max_redemptions = Number(p.max_redemptions);
      if (p.redeem_by) {
        const raw = `${p.redeem_by}`.trim();
        const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
        // Interpreta AAAA-MM-DD como fim do dia em America/Sao_Paulo (23:59:59).
        const redeemAt = ymd
          ? new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T23:59:59-03:00`)
          : new Date(raw);
        const redeemByUnix = Math.floor(redeemAt.getTime() / 1000);
        const agoraUnix = Math.floor(Date.now() / 1000);
        if (!Number.isFinite(redeemByUnix) || Number.isNaN(redeemAt.getTime())) {
          throw new Error('Data "Válido até" inválida. Use o formato AAAA-MM-DD.');
        }
        if (redeemByUnix <= agoraUnix) {
          throw new Error(
            'A data "Válido até" precisa ser hoje ou uma data futura (AAAA-MM-DD).',
          );
        }
        couponParams.redeem_by = redeemByUnix;
      }

      const productIds = new Set<string>(
        ((p.aplicavel_product_ids as string[] | undefined) ?? []).filter(Boolean),
      );

      const priceIds = ((p.aplicavel_price_ids as string[] | undefined) ?? []).filter(Boolean);
      for (const priceId of priceIds) {
        const price = await stripe.prices.retrieve(priceId);
        const prod = price.product;
        const prodId = typeof prod === 'string' ? prod : prod?.id;
        if (prodId) productIds.add(prodId);
      }

      if (productIds.size) {
        couponParams.applies_to = { products: [...productIds] };
      }

      const coupon = await stripe.coupons.create(couponParams);

      const promotion_code = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code: codigo,
        max_redemptions: p.max_redemptions != null ? Number(p.max_redemptions) : undefined,
        restrictions: { first_time_transaction: Boolean(p.apenas_novas_assinaturas) },
      });

      return new Response(JSON.stringify({ coupon, promotion_code }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'create_plano') {
      const p = body.payload ?? {};
      const nome = `${p.nome ?? ''}`.trim();
      if (!nome) throw new Error('Nome do plano é obrigatório');

      const isEnterprise = Boolean(p.is_enterprise);
      const temUpgrades = Boolean(p.tem_upgrades);
      const exibirParaClientes = Boolean(p.exibir_para_clientes);
      const requerClienteLogado = Boolean(p.requer_cliente_logado);
      const precoBase = parseNumeroPositivo(p.preco_base_reais, 'Preço mensal', !isEnterprise);
      const usuariosInclusos = parseNumeroPositivo(p.usuarios_inclusos, 'Usuários inclusos');
      const empresasIncluidas = parseNumeroPositivo(p.empresas_incluidas ?? 1, 'Empresas inclusas');
      const armazenamentoGb = parseNumeroPositivo(p.armazenamento_gb, 'Armazenamento (GB)');
      const creditoIa = parseNumeroPositivo(p.credito_ia_mensal ?? 0, 'Crédito IA mensal', false);
      const precoUsuarioAdicional = parseNumeroPositivo(p.preco_usuario_adicional ?? 0, 'Preço usuário adicional', false);
      const precoEmpresaAdicional = parseNumeroPositivo(p.preco_cnpj_adicional ?? 0, 'Preço empresa adicional', false);

      let limiteNfe: number | null = null;
      if (p.limite_nfe_mensal != null && `${p.limite_nfe_mensal}`.trim() !== '') {
        limiteNfe = parseNumeroPositivo(p.limite_nfe_mensal, 'Limite NF-e mensal');
      }

      const limiteEmpresasEnterprise =
        p.limite_empresas_enterprise != null && `${p.limite_empresas_enterprise}`.trim() !== ''
          ? parseNumeroPositivo(p.limite_empresas_enterprise, 'Limite empresas enterprise')
          : 10;

      if (!isEnterprise && precoBase <= 0) {
        throw new Error('Informe um preço mensal maior que zero (ou marque como Enterprise).');
      }

      const descricao = `${p.descricao ?? ''}`.trim() || null;

      let stripeProductId: string | null = null;
      let stripePriceBaseId: string | null = null;
      let stripePriceUsuarioId: string | null = null;
      let stripePriceEmpresaId: string | null = null;

      if (!isEnterprise) {
        const product = await stripe.products.create({
          name: nome,
          description: descricao ?? undefined,
          metadata: { origem: 'painel_adm_azoup' },
        });
        stripeProductId = product.id;

        try {
          const priceBase = await criarPrecoMensalStripe(stripe, product.id, precoBase, {
            tipo: 'base',
          });
          stripePriceBaseId = priceBase?.id ?? null;
          if (!stripePriceBaseId) throw new Error('Falha ao criar preço base no Stripe.');

          if (precoUsuarioAdicional > 0) {
            const priceUsuario = await criarPrecoMensalStripe(stripe, product.id, precoUsuarioAdicional, {
              tipo: 'usuario_adicional',
            });
            stripePriceUsuarioId = priceUsuario?.id ?? null;
          }

          if (temUpgrades && precoEmpresaAdicional > 0) {
            const priceEmpresa = await criarPrecoMensalStripe(stripe, product.id, precoEmpresaAdicional, {
              tipo: 'empresa_adicional',
            });
            stripePriceEmpresaId = priceEmpresa?.id ?? null;
          }
        } catch (stripeErr) {
          await stripe.products.update(product.id, { active: false }).catch(() => undefined);
          throw stripeErr;
        }
      }

      const agora = new Date().toISOString();
      const { data: plano, error: insertErr } = await supabaseAdmin
        .from('planos_assinatura')
        .insert({
          nome,
          descricao,
          preco_base: precoBase,
          usuarios_inclusos: usuariosInclusos,
          empresas_incluidas: empresasIncluidas,
          limite_nfe_mensal: limiteNfe,
          limite_empresas_enterprise: limiteEmpresasEnterprise,
          armazenamento_gb: armazenamentoGb,
          preco_usuario_adicional: precoUsuarioAdicional,
          preco_cnpj_adicional: precoEmpresaAdicional,
          credito_ia_mensal: creditoIa,
          tem_upgrades: temUpgrades,
          is_enterprise: isEnterprise,
          ativo: true,
          exibir_para_clientes: exibirParaClientes,
          requer_cliente_logado: requerClienteLogado,
          stripe_product_id: stripeProductId,
          stripe_price_id_base: stripePriceBaseId,
          stripe_price_id_usuario_adicional: stripePriceUsuarioId,
          stripe_price_id_empresa_adicional: stripePriceEmpresaId,
          criado_em: agora,
          atualizado_em: agora,
        } as never)
        .select('*')
        .single();

      if (insertErr) {
        if (stripeProductId) {
          await stripe.products.update(stripeProductId, { active: false }).catch(() => undefined);
        }
        throw insertErr;
      }

      if (stripeProductId && plano?.id != null) {
        await stripe.products
          .update(stripeProductId, {
            metadata: { origem: 'painel_adm_azoup', plano_id: String(plano.id) },
          })
          .catch(() => undefined);
      }

      return new Response(JSON.stringify({ plano }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (body.op === 'update_plano_exibicao' || body.op === 'update_plano_opcoes') {
      const planoId = Number(body.payload?.plano_id);
      if (!Number.isFinite(planoId) || planoId <= 0) throw new Error('plano_id inválido');

      const p = body.payload ?? {};
      const patch: Record<string, boolean> = {};
      const flagKeys = [
        'exibir_para_clientes',
        'tem_upgrades',
        'is_enterprise',
        'requer_cliente_logado',
      ] as const;

      for (const key of flagKeys) {
        if (p[key] !== undefined) patch[key] = Boolean(p[key]);
      }

      if (!Object.keys(patch).length) {
        throw new Error('Informe ao menos uma opção do plano para atualizar.');
      }

      const { data: plano, error: updErr } = await supabaseAdmin
        .from('planos_assinatura')
        .update({
          ...patch,
          atualizado_em: new Date().toISOString(),
        } as never)
        .eq('id', planoId)
        .select('*')
        .single();

      if (updErr) throw updErr;

      return new Response(JSON.stringify({ plano }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Operação desconhecida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro interno';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

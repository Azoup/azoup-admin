import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_SCREEN_KEYS = ['dashboard', 'clients', 'conversas', 'billing', 'audit', 'admins'] as const;

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

    const jwt = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRole);

    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser(jwt);

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
      if (p.redeem_by) couponParams.redeem_by = Math.floor(new Date(`${p.redeem_by}`).getTime() / 1000);

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

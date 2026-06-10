import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      .select('id,role,active,email')
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
        .select('id,email,role,active,created_at,updated_at')
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

      const { error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (authErr && !authErr.message.toLowerCase().includes('already')) {
        throw authErr;
      }

      const { data: adminUpsert, error: adminUpsertErr } = await supabaseAdmin
        .from('admin_users')
        .upsert(
          {
            email,
            role,
            active,
            created_by_admin: user.email ?? null,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: 'email' },
        )
        .select('id,email,role,active,created_at,updated_at')
        .single();

      if (adminUpsertErr) throw adminUpsertErr;

      return new Response(JSON.stringify({ admin: adminUpsert }), {
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

      const priceIds = (p.aplicavel_price_ids as string[] | undefined)?.filter(Boolean);
      if (priceIds?.length) {
        couponParams.applies_to = { prices: priceIds };
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

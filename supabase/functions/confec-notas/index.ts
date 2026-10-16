import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SECOES = ['Vendas', 'Produção', 'Financeiro', 'Cadastros', 'Estoque', 'Agenda', 'Outros'] as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function adminAtivo(supabaseAdmin: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await supabaseAdmin
    .from('admin_users')
    .select('id,email,role,active')
    .ilike('email', email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw error;
  if (!data || data.active === false) throw new Error('Sem permissão de painel.');
  return data;
}

async function estruturarNota(params: {
  titulo: string;
  problema: string;
  solucao: string;
  secao: string;
  tela: string;
  telaNova: boolean;
}): Promise<{ linha: string; detalhe: string }> {
  const chave = Deno.env.get('OPENAI_API_KEY')?.trim() ?? '';
  if (!chave) throw new Error('Secret OPENAI_API_KEY ausente no Supabase.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.25,
      messages: [
        {
          role: 'system',
          content:
            'Você escreve notas de atualização do sistema Confec para o cliente final. Responda só JSON com as chaves linha e detalhe. ' +
            'linha: uma frase curta em português, sem jargão técnico, descrevendo o que melhorou. ' +
            'detalhe: 2 a 5 bullets começando com "• ", um por linha: o que mudou, em qual tela, para quem ajuda. ' +
            'Não invente funcionalidades. Não cite tickets, emails internos nem nomes de desenvolvedores.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            titulo: params.titulo,
            secao: params.secao,
            tela: params.tela,
            tela_nova: params.telaNova,
            problema_ou_erro: params.problema,
            solucao_ou_ajuste: params.solucao,
          }),
        },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const mensagem = `${(data.error as { message?: string } | undefined)?.message ?? 'Falha ao gerar a nota'}`;
    throw new Error(mensagem);
  }

  const conteudo = `${(data.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content ?? ''}`;
  let parsed: { linha?: unknown; detalhe?: unknown } = {};
  try {
    parsed = JSON.parse(conteudo);
  } catch {
    throw new Error('A nota da IA não veio em JSON.');
  }

  const linha = `${parsed.linha ?? ''}`.replace(/\s+/g, ' ').trim();
  const detalhe = `${parsed.detalhe ?? ''}`.trim();
  if (!linha) throw new Error('A IA não gerou a linha da nota.');
  if (!detalhe) throw new Error('A IA não gerou o detalhe da nota.');
  return { linha, detalhe };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    if (!supabaseUrl || !serviceKey || !anonKey) throw new Error('Secrets do Supabase ausentes.');

    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData.user?.email) return json({ error: 'Sessão inválida' }, 401);
    await adminAtivo(supabaseAdmin, userData.user.email);

    const body = (await req.json()) as { op?: string; payload?: Record<string, unknown> };
    const op = `${body.op ?? ''}`.trim();
    const p = body.payload ?? {};

    if (op === 'estruturar_nota') {
      const titulo = `${p.titulo ?? ''}`.trim();
      const problema = `${p.problema ?? ''}`.trim();
      const solucao = `${p.solucao ?? ''}`.trim();
      const secao = `${p.secao ?? ''}`.trim();
      const tela = `${p.tela ?? ''}`.trim();
      const telaNova = Boolean(p.tela_nova);
      if (!titulo) throw new Error('Informe o título.');
      if (!SECOES.includes(secao as (typeof SECOES)[number])) throw new Error('Seção inválida.');
      if (!tela) throw new Error('Informe a tela.');
      const nota = await estruturarNota({ titulo, problema, solucao, secao, tela, telaNova });
      return json({ ok: true, ...nota });
    }

    if (op === 'gerar_e_salvar') {
      const cardId = `${p.card_id ?? ''}`.trim();
      if (!cardId) throw new Error('card_id obrigatório');
      const { data: card, error } = await supabaseAdmin
        .from('confec_kanban_cards')
        .select('id,title,description,dev_notes,secao,tela,tela_nova')
        .eq('id', cardId)
        .maybeSingle();
      if (error) throw error;
      if (!card) throw new Error('Ticket não encontrado.');

      const secao = `${(p.secao ?? card.secao) ?? ''}`.trim();
      const tela = `${(p.tela ?? card.tela) ?? ''}`.trim();
      const telaNova = p.tela_nova != null ? Boolean(p.tela_nova) : Boolean(card.tela_nova);
      if (!SECOES.includes(secao as (typeof SECOES)[number])) throw new Error('Seção inválida.');
      if (!tela) throw new Error('Informe a tela do sistema.');

      const nota = await estruturarNota({
        titulo: `${card.title ?? ''}`,
        problema: `${card.description ?? ''}`,
        solucao: `${card.dev_notes ?? ''}`,
        secao,
        tela,
        telaNova,
      });

      const agora = new Date().toISOString();
      const { error: updErr } = await supabaseAdmin
        .from('confec_kanban_cards')
        .update({
          secao,
          tela,
          tela_nova: telaNova,
          nota_linha: nota.linha,
          nota_detalhe: nota.detalhe,
          nota_gerada_em: agora,
          updated_at: agora,
        } as never)
        .eq('id', cardId);
      if (updErr) throw updErr;

      return json({
        ok: true,
        linha: nota.linha,
        detalhe: nota.detalhe,
        nota_gerada_em: agora,
      });
    }

    return json({ error: `Operação inválida: ${op}` }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Erro interno';
    return json({ error: message }, 400);
  }
});

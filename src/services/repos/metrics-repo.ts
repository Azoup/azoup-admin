import { supabase } from '@/src/lib/supabase';
import type { AssinaturaClienteRow, ClienteAzoupRow, HistoricoFaturaRow } from '@/src/types/azoup';
import {
  classificarStatusAssinatura,
  isAssinaturaAtiva,
  isAssinaturaCancelada,
  isAssinaturaInadimplente,
  isAssinaturaTrial,
  prioridadeAssinatura,
} from '@/src/utils/assinatura-status';

export type DashboardMetricas = {
  total_clientes: number;
  clientes_assinatura_ativa: number;
  clientes_trial: number;
  clientes_inadimplentes: number;
  clientes_cancelados: number;
  mrr_centavos: number;
  planos_ranking: { plano_id: string; nome: string; quantidade: number }[];
  tokens_medio_mes?: number | null;
  armazenamento_medio_gb?: number | null;
};

function pickAssinaturaPorCliente(assinaturas: AssinaturaClienteRow[]): Map<string, AssinaturaClienteRow> {
  const porCliente = new Map<string, AssinaturaClienteRow[]>();
  for (const a of assinaturas) {
    const arr = porCliente.get(a.cliente_id) ?? [];
    arr.push(a);
    porCliente.set(a.cliente_id, arr);
  }

  const out = new Map<string, AssinaturaClienteRow>();
  for (const [clienteId, rows] of porCliente) {
    const best = [...rows].sort((a, b) => {
      const pa = prioridadeAssinatura(a);
      const pb = prioridadeAssinatura(b);
      if (pb !== pa) return pb - pa;
      const da = b.atualizado_em ?? b.data_inicio ?? b.criado_em ?? '';
      const db = a.atualizado_em ?? a.data_inicio ?? a.criado_em ?? '';
      return `${da}`.localeCompare(`${db}`);
    })[0];
    if (best) out.set(clienteId, best);
  }
  return out;
}

export async function carregarMetricasDashboard(): Promise<DashboardMetricas> {
  const { count: total_clientes, error: errCount } = await supabase
    .from('clientes_azoup')
    .select('*', { count: 'exact', head: true });

  if (errCount) throw new Error(errCount.message);

  const [assinaturasRaw, planosRaw] = await Promise.all([
    supabase.from('assinaturas_clientes').select('*').limit(5000),
    supabase.from('planos_assinatura').select('id,nome'),
  ]);

  if (assinaturasRaw.error) throw new Error(assinaturasRaw.error.message);

  const assinaturas = (assinaturasRaw.data ?? []) as AssinaturaClienteRow[];
  const planosMap = new Map<string, string>();
  (planosRaw.data ?? []).forEach((p: { id: string | number; nome?: string }) =>
    planosMap.set(String(p.id), p.nome ?? String(p.id)),
  );

  const porCliente = pickAssinaturaPorCliente(assinaturas);

  let clientes_trial = 0;
  let clientes_assinatura_ativa = 0;
  let clientes_inadimplentes = 0;
  let clientes_cancelados = 0;
  let mrr_centavos = 0;

  const ranking = new Map<string, number>();

  porCliente.forEach((a) => {
    if (isAssinaturaTrial(a)) clientes_trial += 1;
    if (isAssinaturaAtiva(a)) clientes_assinatura_ativa += 1;
    if (isAssinaturaInadimplente(a)) clientes_inadimplentes += 1;
    if (isAssinaturaCancelada(a)) clientes_cancelados += 1;

    const centavosMrr =
      a.valor_atual_centavos != null
        ? Number(a.valor_atual_centavos)
        : a.valor_mensal_atual != null
          ? Math.round(Number(a.valor_mensal_atual) * 100)
          : 0;

    if (centavosMrr > 0 && isAssinaturaAtiva(a)) {
      mrr_centavos += centavosMrr;
    }

    if (a.plano_id != null && `${a.plano_id}` !== '' && classificarStatusAssinatura(a) !== 'cancelada') {
      const pid = String(a.plano_id);
      ranking.set(pid, (ranking.get(pid) ?? 0) + 1);
    }
  });

  const planos_ranking = [...ranking.entries()]
    .map(([plano_id, quantidade]) => ({
      plano_id,
      nome: planosMap.get(plano_id) ?? plano_id,
      quantidade,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 8);

  const { data: uso } = await supabase.from('credito_ia_gasto').select('*').limit(1000);

  let tokens_medio_mes: number | null = null;
  if (uso?.length) {
    const sample = uso[0] as Record<string, unknown>;
    const tokenKey = Object.keys(sample).find((k) => k.toLowerCase().includes('token'));
    if (tokenKey) {
      const total = uso.reduce((acc, row) => acc + Number((row as Record<string, unknown>)[tokenKey] ?? 0), 0);
      tokens_medio_mes = Math.round(total / uso.length);
    }
  }

  return {
    total_clientes: total_clientes ?? 0,
    clientes_assinatura_ativa,
    clientes_trial,
    clientes_inadimplentes,
    clientes_cancelados,
    mrr_centavos,
    planos_ranking,
    tokens_medio_mes,
    armazenamento_medio_gb: null,
  };
}

export async function listarInadimplentesRecentes(limite = 50): Promise<ClienteAzoupRow[]> {
  const { data: fat, error } = await supabase
    .from('historico_faturas')
    .select('cliente_id')
    .eq('status', 'falhou')
    .limit(200);

  if (error) throw new Error(error.message);
  const ids = [...new Set((fat as HistoricoFaturaRow[]).map((f) => f.cliente_id).filter(Boolean))] as string[];
  if (!ids.length) return [];

  const { data: cli, error: e2 } = await supabase.from('clientes_azoup').select('*').in('id', ids.slice(0, limite));
  if (e2) throw new Error(e2.message);
  return (cli ?? []) as ClienteAzoupRow[];
}

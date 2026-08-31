import { obterAcompanhamentoViaFunction } from '@/src/services/stripe-admin-api';
import { listarKanbanAcompanhamento } from '@/src/services/repos/kanban-acompanhamento-repo';
import {
  enriquecerAcompanhamentoCliente,
  type AcompanhamentoCliente,
  type AcompanhamentoColuna,
  ACOMPANHAMENTO_COLUNAS,
} from '@/src/utils/acompanhamento';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';

export type AcompanhamentoAgrupado = Record<AcompanhamentoColuna, AcompanhamentoCliente[]>;

/** Só ativos e trial vigente. */
function isClienteAtivoParaAcompanhamento(row: {
  assinatura_status?: string | null;
  trial_fim?: string | null;
}): boolean {
  const grupo = classificarStatusAssinatura({
    status: row.assinatura_status,
    trial_fim: row.trial_fim,
  });
  return grupo === 'ativa' || grupo === 'trial';
}

function agrupamentoVazio(): AcompanhamentoAgrupado {
  return {
    fila_espera: [],
    urgentes: [],
    precisa_ajuda: [],
    pode_esperar: [],
    esta_usando: [],
  };
}

export async function carregarAcompanhamentoClientes(): Promise<{
  clientes: AcompanhamentoCliente[];
  porEtiqueta: AcompanhamentoAgrupado;
  porColuna: AcompanhamentoAgrupado;
}> {
  const res = await obterAcompanhamentoViaFunction();
  const baseRows = (res.clientes ?? []).filter(isClienteAtivoParaAcompanhamento);
  const ids = baseRows.map((r) => r.id);

  let kanban = new Map<string, { coluna: string; ordem?: number | null }>();
  try {
    kanban = await listarKanbanAcompanhamento(ids);
  } catch (e) {
    console.warn(
      '[admin_acompanhamento_kanban] Leitura ignorada:',
      e instanceof Error ? e.message : e,
      '— execute supabase/sql/admin_acompanhamento_kanban.sql no Supabase.',
    );
  }

  const clientes = baseRows.map((row) => {
    const kb = kanban.get(row.id);
    return enriquecerAcompanhamentoCliente({
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      celular: row.celular,
      created_at: row.created_at,
      empresa_nome: row.empresa_nome,
      empresa_cnpj: row.empresa_cnpj,
      produtos: Number(row.produtos) || 0,
      vendas: Number(row.vendas) || 0,
      ordens_producao: Number(row.ordens_producao) || 0,
      clientes_cadastrados: Number(row.clientes_cadastrados) || 0,
      fornecedores_cadastrados: Number(row.fornecedores_cadastrados) || 0,
      plano_id: row.plano_id,
      plano_nome: row.plano_nome,
      assinatura_status: row.assinatura_status,
      trial_fim: row.trial_fim,
      data_inicio: row.data_inicio,
      data_renovacao: row.data_renovacao,
      valor_mensal_atual: row.valor_mensal_atual != null ? Number(row.valor_mensal_atual) : null,
      coluna: (kb?.coluna as AcompanhamentoColuna | undefined) ?? 'fila_espera',
    });
  });

  // Ordena por ordem do kanban (quando houver), depois nome
  clientes.sort((a, b) => {
    const oa = kanban.get(a.id)?.ordem ?? 0;
    const ob = kanban.get(b.id)?.ordem ?? 0;
    if (oa !== ob) return Number(oa) - Number(ob);
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  const porColuna = agrupamentoVazio();
  for (const c of clientes) {
    const key = c.coluna;
    if (porColuna[key]) porColuna[key].push(c);
    else porColuna.fila_espera.push(c);
  }

  // Garante chaves mesmo se ACOMPANHAMENTO_COLUNAS mudar
  for (const col of ACOMPANHAMENTO_COLUNAS) {
    if (!porColuna[col.key]) porColuna[col.key] = [];
  }

  return { clientes, porEtiqueta: porColuna, porColuna };
}

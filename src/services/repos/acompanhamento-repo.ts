import { obterAcompanhamentoViaFunction } from '@/src/services/stripe-admin-api';
import { listarKanbanAcompanhamento } from '@/src/services/repos/kanban-acompanhamento-repo';
import type { AdminAcompanhamentoKanbanRow } from '@/src/types/azoup';
import {
  agrupamentoAcompanhamentoVazio,
  enriquecerAcompanhamentoCliente,
  type AcompanhamentoCliente,
  type AcompanhamentoColuna,
  ACOMPANHAMENTO_COLUNAS,
} from '@/src/utils/acompanhamento';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';

/** Movimentos anteriores a esta revisão não valem: todo mundo volta para a fila. */
const REVISAO_FILA_ESPERA_EM = Date.parse('2026-09-23T13:35:00.000Z');

function colunaKanban(kb?: AdminAcompanhamentoKanbanRow): AcompanhamentoColuna | undefined {
  if (!kb?.coluna) return undefined;
  const atualizado = Date.parse(`${kb.updated_at ?? ''}`);
  if (!Number.isFinite(atualizado) || atualizado < REVISAO_FILA_ESPERA_EM) return 'fila_espera';
  return kb.coluna as AcompanhamentoColuna;
}

export type AcompanhamentoAgrupado = Record<AcompanhamentoColuna, AcompanhamentoCliente[]>;

/** Trial vigente ou cliente em algum plano. */
function isClienteNoAcompanhamento(row: {
  assinatura_status?: string | null;
  trial_fim?: string | null;
  plano_id?: string | null;
  plano_nome?: string | null;
}): boolean {
  const grupo = classificarStatusAssinatura({
    status: row.assinatura_status,
    trial_fim: row.trial_fim,
  });
  if (grupo === 'ativa' || grupo === 'trial' || grupo === 'inadimplente') return true;
  if (grupo === 'outro' && (`${row.plano_id ?? ''}`.trim() || `${row.plano_nome ?? ''}`.trim())) return true;
  return false;
}

export async function carregarAcompanhamentoClientes(): Promise<{
  clientes: AcompanhamentoCliente[];
  porEtiqueta: AcompanhamentoAgrupado;
  porColuna: AcompanhamentoAgrupado;
}> {
  const res = await obterAcompanhamentoViaFunction();
  const baseRows = (res.clientes ?? []).filter(isClienteNoAcompanhamento);
  const ids = baseRows.map((r) => r.id);

  let kanban = new Map<string, AdminAcompanhamentoKanbanRow>();
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
      coluna: colunaKanban(kb) ?? 'fila_espera',
      ultima_reuniao: kb?.ultima_reuniao ?? null,
      proxima_reuniao: kb?.proxima_reuniao ?? null,
      pendencias_abertas: kb?.pendencias_abertas ?? 0,
      ultima_dificuldade: kb?.ultima_dificuldade ?? null,
      proxima_acao: kb?.proxima_acao ?? null,
    });
  });

  // Ordena por ordem do kanban (quando houver), depois nome
  clientes.sort((a, b) => {
    const oa = kanban.get(a.id)?.ordem ?? 0;
    const ob = kanban.get(b.id)?.ordem ?? 0;
    if (oa !== ob) return Number(oa) - Number(ob);
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  const porColuna = agrupamentoAcompanhamentoVazio();
  for (const c of clientes) {
    const key = c.coluna;
    if (porColuna[key]) porColuna[key].push(c);
    else porColuna.fila_espera.push(c);
  }

  porColuna.fila_espera.sort((a, b) => {
    const ta = Date.parse(a.created_at ?? '');
    const tb = Date.parse(b.created_at ?? '');
    const oa = Number.isFinite(ta) ? ta : Number.MAX_SAFE_INTEGER;
    const ob = Number.isFinite(tb) ? tb : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  // Garante chaves mesmo se ACOMPANHAMENTO_COLUNAS mudar
  for (const col of ACOMPANHAMENTO_COLUNAS) {
    if (!porColuna[col.key]) porColuna[col.key] = [];
  }

  return { clientes, porEtiqueta: porColuna, porColuna };
}

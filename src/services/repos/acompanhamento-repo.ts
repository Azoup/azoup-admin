import { obterAcompanhamentoViaFunction } from '@/src/services/stripe-admin-api';
import {
  enriquecerAcompanhamentoCliente,
  type AcompanhamentoCliente,
  type AcompanhamentoEtiqueta,
} from '@/src/utils/acompanhamento';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';

export type AcompanhamentoAgrupado = Record<AcompanhamentoEtiqueta, AcompanhamentoCliente[]>;

/** Só ativos e trial vigente — alinhado ao filtro "Inativo" da lista de clientes. */
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

export async function carregarAcompanhamentoClientes(): Promise<{
  clientes: AcompanhamentoCliente[];
  porEtiqueta: AcompanhamentoAgrupado;
}> {
  const res = await obterAcompanhamentoViaFunction();
  const clientes = (res.clientes ?? [])
    .filter(isClienteAtivoParaAcompanhamento)
    .map((row) =>
      enriquecerAcompanhamentoCliente({
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
      }),
    );

  const porEtiqueta: AcompanhamentoAgrupado = {
    urgentes: [],
    precisa_ajuda: [],
    pode_esperar: [],
    esta_usando: [],
  };

  for (const c of clientes) {
    porEtiqueta[c.etiqueta].push(c);
  }

  return { clientes, porEtiqueta };
}

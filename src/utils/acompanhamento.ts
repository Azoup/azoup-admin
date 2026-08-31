import { dataHojeBrasil } from '@/src/utils/format';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';

export type AcompanhamentoEtiqueta = 'urgentes' | 'precisa_ajuda' | 'pode_esperar' | 'esta_usando';

export type AcompanhamentoCliente = {
  id: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
  celular?: string | null;
  created_at?: string | null;
  empresa_nome?: string | null;
  empresa_cnpj?: string | null;
  produtos: number;
  vendas: number;
  ordens_producao: number;
  clientes_cadastrados: number;
  fornecedores_cadastrados: number;
  plano_id?: string | null;
  plano_nome?: string | null;
  assinatura_status?: string | null;
  trial_fim?: string | null;
  data_inicio?: string | null;
  data_renovacao?: string | null;
  valor_mensal_atual?: number | null;
  etiqueta: AcompanhamentoEtiqueta;
  dias_trial_restantes: number | null;
  dias_usando: number;
};

export const ACOMPANHAMENTO_ETIQUETAS: {
  key: AcompanhamentoEtiqueta;
  label: string;
  descricao: string;
}[] = [
  {
    key: 'urgentes',
    label: 'Urgentes',
    descricao: 'Sem produto/venda/OP, ou trial acabando com pouco uso',
  },
  {
    key: 'precisa_ajuda',
    label: 'Precisa de ajuda',
    descricao: 'Menos de 10 produtos, vendas ou OPs',
  },
  {
    key: 'pode_esperar',
    label: 'Pode esperar',
    descricao: 'Menos de 20 produtos, vendas ou OPs',
  },
  {
    key: 'esta_usando',
    label: 'Está usando',
    descricao: 'Uso consolidado, ou 0 vendas com mais de 10 OPs',
  },
];

function diasEntreYmd(inicio: string, fim: string): number {
  const a = Date.parse(`${inicio}T12:00:00`);
  const b = Date.parse(`${fim}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

export function diasTrialRestantes(trialFim?: string | null, status?: string | null): number | null {
  const grupo = classificarStatusAssinatura({ status, trial_fim: trialFim });
  if (grupo !== 'trial') return null;
  const ymd = `${trialFim ?? ''}`.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return diasEntreYmd(dataHojeBrasil(), ymd);
}

export function diasUsandoSistema(createdAt?: string | null, dataInicio?: string | null): number {
  const base = `${dataInicio ?? createdAt ?? ''}`.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    if (!createdAt) return 0;
    try {
      const d = new Date(createdAt);
      if (Number.isNaN(d.getTime())) return 0;
      return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
    } catch {
      return 0;
    }
  }
  return Math.max(0, diasEntreYmd(base, dataHojeBrasil()));
}

/**
 * Urgente: zero em produto OU (venda e OP sem uso forte) OU OP;
 * ou trial com < 7 dias restantes e (produtos < 5 OU vendas < 5 OU OPs < 5).
 * Exceção: 0 vendas com mais de 10 OPs → está usando (produção ativa sem PDV).
 * Precisa de ajuda: não urgente e (produtos < 10 OU vendas < 10 OU OPs < 10).
 * Pode esperar: não precisa de ajuda e (produtos < 20 OU vendas < 20 OU OPs < 20).
 * Está usando: demais.
 */
export function classificarAcompanhamento(input: {
  produtos: number;
  vendas: number;
  ordens_producao: number;
  trial_fim?: string | null;
  assinatura_status?: string | null;
}): AcompanhamentoEtiqueta {
  const produtos = Number(input.produtos) || 0;
  const vendas = Number(input.vendas) || 0;
  const ops = Number(input.ordens_producao) || 0;
  const diasTrial = diasTrialRestantes(input.trial_fim, input.assinatura_status);

  // Produção consolidada sem vendas: considera em uso (não urgente).
  if (vendas === 0 && ops > 10) return 'esta_usando';

  const semUsoBasico = produtos === 0 || vendas === 0 || ops === 0;
  const trialCritico =
    diasTrial != null && diasTrial >= 0 && diasTrial < 7 && (produtos < 5 || vendas < 5 || ops < 5);

  if (semUsoBasico || trialCritico) return 'urgentes';
  if (produtos < 10 || vendas < 10 || ops < 10) return 'precisa_ajuda';
  if (produtos < 20 || vendas < 20 || ops < 20) return 'pode_esperar';
  return 'esta_usando';
}

export function enriquecerAcompanhamentoCliente(
  raw: Omit<AcompanhamentoCliente, 'etiqueta' | 'dias_trial_restantes' | 'dias_usando'>,
): AcompanhamentoCliente {
  return {
    ...raw,
    etiqueta: classificarAcompanhamento(raw),
    dias_trial_restantes: diasTrialRestantes(raw.trial_fim, raw.assinatura_status),
    dias_usando: diasUsandoSistema(raw.created_at, raw.data_inicio),
  };
}

import { dataHojeBrasil } from '@/src/utils/format';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';

/** Colunas do Kanban de acompanhamento (manual). */
export type AcompanhamentoColuna =
  | 'fila_espera'
  | 'urgentes'
  | 'precisa_ajuda'
  | 'pode_esperar'
  | 'esta_usando';

/** @deprecated use AcompanhamentoColuna — mantido para compat. */
export type AcompanhamentoEtiqueta = AcompanhamentoColuna;

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
  /** Coluna atual no Kanban (padrão: fila_espera). */
  etiqueta: AcompanhamentoColuna;
  coluna: AcompanhamentoColuna;
  dias_trial_restantes: number | null;
  dias_usando: number;
};

export const ACOMPANHAMENTO_COLUNAS: {
  key: AcompanhamentoColuna;
  label: string;
  descricao: string;
}[] = [
  {
    key: 'fila_espera',
    label: 'Fila de espera',
    descricao: 'Clientes ativos/trial ainda não triados',
  },
  {
    key: 'urgentes',
    label: 'Urgentes',
    descricao: 'Prioridade alta de contato',
  },
  {
    key: 'precisa_ajuda',
    label: 'Precisa de ajuda',
    descricao: 'Em onboarding / com dificuldade',
  },
  {
    key: 'pode_esperar',
    label: 'Pode esperar',
    descricao: 'Acompanhar depois',
  },
  {
    key: 'esta_usando',
    label: 'Está usando',
    descricao: 'Uso consolidado',
  },
];

/** Alias legado. */
export const ACOMPANHAMENTO_ETIQUETAS = ACOMPANHAMENTO_COLUNAS;

export function isAcompanhamentoColuna(value: unknown): value is AcompanhamentoColuna {
  return ACOMPANHAMENTO_COLUNAS.some((c) => c.key === value);
}

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

export function enriquecerAcompanhamentoCliente(
  raw: Omit<AcompanhamentoCliente, 'etiqueta' | 'coluna' | 'dias_trial_restantes' | 'dias_usando'> & {
    coluna?: AcompanhamentoColuna | null;
  },
): AcompanhamentoCliente {
  const coluna: AcompanhamentoColuna =
    raw.coluna && isAcompanhamentoColuna(raw.coluna) ? raw.coluna : 'fila_espera';
  return {
    ...raw,
    coluna,
    etiqueta: coluna,
    dias_trial_restantes: diasTrialRestantes(raw.trial_fim, raw.assinatura_status),
    dias_usando: diasUsandoSistema(raw.created_at, raw.data_inicio),
  };
}

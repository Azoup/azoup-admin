import { dataHojeBrasil } from '@/src/utils/format';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';

/** Colunas do Kanban de acompanhamento (manual). */
export type AcompanhamentoColuna =
  | 'fila_espera'
  | 'primeiro_contato'
  | 'treinamento_acompanhamento'
  | 'sistema_em_uso'
  | 'treinamento_finalizado'
  | 'acompanhamento_finalizado';

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
  ultima_reuniao?: string | null;
  proxima_reuniao?: string | null;
  pendencias_abertas: number;
  ultima_dificuldade?: string | null;
  proxima_acao?: string | null;
};

export const ACOMPANHAMENTO_COLUNAS: {
  key: AcompanhamentoColuna;
  label: string;
  cor: string;
}[] = [
  { key: 'fila_espera', label: 'Fila de espera', cor: '#94A3B8' },
  { key: 'primeiro_contato', label: 'Primeiro Contato', cor: '#F07167' },
  { key: 'treinamento_acompanhamento', label: 'Em treinamento/Acompanhamento', cor: '#F5C542' },
  { key: 'sistema_em_uso', label: 'Sistema em uso', cor: '#4C9AFF' },
  { key: 'treinamento_finalizado', label: 'Treinamento finalizado', cor: '#3DDC97' },
  { key: 'acompanhamento_finalizado', label: 'Acompanhamento finalizado', cor: '#22C55E' },
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

/** Idade do cadastro em `clientes_azoup.created_at`. */
export function rotuloTempoCadastro(createdAt?: string | null): string {
  if (!`${createdAt ?? ''}`.trim()) return 'Cadastro sem data';
  const dias = diasUsandoSistema(createdAt, null);
  if (dias <= 0) return 'Cadastro hoje';
  if (dias === 1) return 'Cadastro há 1 dia';
  return `Cadastro há ${dias} dias`;
}

export function agrupamentoAcompanhamentoVazio(): Record<AcompanhamentoColuna, AcompanhamentoCliente[]> {
  return {
    fila_espera: [],
    primeiro_contato: [],
    treinamento_acompanhamento: [],
    sistema_em_uso: [],
    treinamento_finalizado: [],
    acompanhamento_finalizado: [],
  };
}

export function iniciaisNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 0);
  if (partes.length === 0) return '•';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

export function badgeAcompanhamento(item: {
  produtos: number;
  vendas: number;
  ordens_producao: number;
  dias_trial_restantes: number | null;
}): { label: string; bg: string; color: string } {
  if (item.produtos > 0 || item.vendas > 0 || item.ordens_producao > 0) {
    return { label: 'ESTÁ USANDO', bg: '#22C55E', color: '#FFFFFF' };
  }
  if (item.dias_trial_restantes != null) {
    return { label: 'TRIAL', bg: '#F5C542', color: '#1A1408' };
  }
  return { label: 'PLANO', bg: '#3B82F6', color: '#FFFFFF' };
}

export function enriquecerAcompanhamentoCliente(
  raw: Omit<
    AcompanhamentoCliente,
    'etiqueta' | 'coluna' | 'dias_trial_restantes' | 'dias_usando' | 'pendencias_abertas'
  > & {
    coluna?: AcompanhamentoColuna | null;
    pendencias_abertas?: number | null;
  },
): AcompanhamentoCliente {
  const coluna: AcompanhamentoColuna =
    raw.coluna && isAcompanhamentoColuna(raw.coluna) ? raw.coluna : 'fila_espera';
  const pendencias = Number(raw.pendencias_abertas);
  return {
    ...raw,
    coluna,
    etiqueta: coluna,
    pendencias_abertas: Number.isFinite(pendencias) && pendencias > 0 ? Math.floor(pendencias) : 0,
    dias_trial_restantes: diasTrialRestantes(raw.trial_fim, raw.assinatura_status),
    dias_usando: diasUsandoSistema(raw.created_at, raw.data_inicio),
  };
}

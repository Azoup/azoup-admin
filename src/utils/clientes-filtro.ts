import type { ClienteAzoupAdminView } from '@/src/types/azoup';
import { clientePrecisaChamar } from '@/src/services/repos/congelamento-repo';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';
import { dataCalendarioBrasil, dataHojeBrasil, somarDiasYmd } from '@/src/utils/format';
import { digitsOnlyPhone } from '@/src/utils/whatsapp';

export type ClienteStatusFiltro =
  | 'todos'
  | 'ativo'
  | 'trial'
  | 'inativo'
  | 'cancelado'
  | 'congelado'
  | 'chamar';

export type PeriodoFiltroPreset =
  | 'todos'
  | 'hoje'
  | '7d'
  | '30d'
  | 'mes_atual'
  | 'mes_passado'
  | 'personalizado';

export type ClientesFiltroState = {
  busca: string;
  status: ClienteStatusFiltro;
  periodoPreset: PeriodoFiltroPreset;
  dataInicio: string | null;
  dataFim: string | null;
};

export const CLIENTES_FILTRO_INICIAL: ClientesFiltroState = {
  busca: '',
  status: 'todos',
  periodoPreset: 'todos',
  dataInicio: null,
  dataFim: null,
};

export type IntervaloYmd = { inicio: string; fim: string };

function normalizarYmd(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const ymd = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : dataCalendarioBrasil(value);
}

/** Data de cadastro usada nos filtros (mesma lógica da coluna "Cliente desde"). */
export function dataCadastroClienteYmd(item: ClienteAzoupAdminView): string | null {
  return (
    dataCalendarioBrasil(item.created_at) ??
    dataCalendarioBrasil(item.assinatura?.data_inicio) ??
    dataCalendarioBrasil(item.assinatura?.criado_em) ??
    null
  );
}

function primeiroDiaMes(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function ultimoDiaMes(ymd: string): string {
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ymd.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/** Intervalo inclusivo em YYYY-MM-DD (America/Sao_Paulo para presets relativos). */
export function resolverIntervaloPeriodo(filtro: ClientesFiltroState): IntervaloYmd | null {
  const hoje = dataHojeBrasil();

  switch (filtro.periodoPreset) {
    case 'todos':
      return null;
    case 'hoje':
      return { inicio: hoje, fim: hoje };
    case '7d':
      // Cadastro há 7 dias ou menos (hoje e os 7 dias anteriores).
      return { inicio: somarDiasYmd(hoje, -7), fim: hoje };
    case '30d':
      return { inicio: somarDiasYmd(hoje, -30), fim: hoje };
    case 'mes_atual':
      return { inicio: primeiroDiaMes(hoje), fim: ultimoDiaMes(hoje) };
    case 'mes_passado': {
      const ref = somarDiasYmd(primeiroDiaMes(hoje), -1);
      return { inicio: primeiroDiaMes(ref), fim: ultimoDiaMes(ref) };
    }
    case 'personalizado': {
      const a = normalizarYmd(filtro.dataInicio);
      const b = normalizarYmd(filtro.dataFim);
      if (!a && !b) return null;
      const inicio = a ?? b!;
      const fim = b ?? a!;
      return inicio <= fim ? { inicio, fim } : { inicio: fim, fim: inicio };
    }
    default:
      return null;
  }
}

function clienteNomeBusca(item: ClienteAzoupAdminView): string {
  return [item.nome_fantasia, item.nome, item.razao_social, item.email, item.empresa_matriz_nome]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchBusca(item: ClienteAzoupAdminView, busca: string): boolean {
  const q = busca.trim().toLowerCase();
  if (!q) return true;

  const qDigits = digitsOnlyPhone(q);
  const nome = clienteNomeBusca(item);
  const email = `${item.email ?? ''}`.toLowerCase();
  const tel = digitsOnlyPhone(`${item.telefone ?? ''}${item.celular ?? ''}`);
  const cnpj = digitsOnlyPhone(`${item.empresa_matriz_cnpj ?? ''}${item.documento ?? ''}${item.cpf ?? ''}`);

  if (nome.includes(q) || email.includes(q)) return true;
  if (qDigits.length >= 3 && (tel.includes(qDigits) || cnpj.includes(qDigits))) return true;
  return false;
}

function matchStatus(item: ClienteAzoupAdminView, status: ClienteStatusFiltro): boolean {
  if (status === 'todos') return true;

  if (status === 'congelado') return Boolean(item.congelamento?.congelado);
  if (status === 'chamar') return clientePrecisaChamar(item.congelamento);

  const grupo = classificarStatusAssinatura(item.assinatura);

  if (status === 'ativo') return grupo === 'ativa';
  if (status === 'trial') return grupo === 'trial';
  if (status === 'cancelado') return grupo === 'cancelada';
  if (status === 'inativo') {
    return (
      grupo === 'inadimplente' ||
      grupo === 'trial_expirado' ||
      grupo === 'outro' ||
      !item.assinatura?.status
    );
  }

  return true;
}

function matchPeriodo(item: ClienteAzoupAdminView, intervalo: IntervaloYmd | null): boolean {
  if (!intervalo) return true;
  const cadastro = dataCadastroClienteYmd(item);
  if (!cadastro) return false;
  return cadastro >= intervalo.inicio && cadastro <= intervalo.fim;
}

export function filtrarClientes(
  items: ClienteAzoupAdminView[],
  filtro: ClientesFiltroState,
): ClienteAzoupAdminView[] {
  const intervalo = resolverIntervaloPeriodo(filtro);

  return items.filter(
    (item) => matchBusca(item, filtro.busca) && matchStatus(item, filtro.status) && matchPeriodo(item, intervalo),
  );
}

export function temFiltroAtivo(filtro: ClientesFiltroState): boolean {
  return (
    filtro.busca.trim().length > 0 ||
    filtro.status !== 'todos' ||
    filtro.periodoPreset !== 'todos' ||
    Boolean(filtro.dataInicio) ||
    Boolean(filtro.dataFim)
  );
}

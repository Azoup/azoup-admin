import {
    endOfDay,
    endOfMonth,
    isWithinInterval,
    parseISO,
    startOfDay,
    startOfMonth,
    subDays,
    subMonths,
} from 'date-fns';

import type { ClienteAzoupAdminView } from '@/src/types/azoup';
import { clientePrecisaChamar } from '@/src/services/repos/congelamento-repo';
import { classificarStatusAssinatura } from '@/src/utils/assinatura-status';
import { digitsOnlyPhone } from '@/src/utils/whatsapp';

export type ClienteStatusFiltro = 'todos' | 'ativo' | 'trial' | 'inativo' | 'congelado' | 'chamar';

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

function parseYmd(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  try {
    const d = parseISO(value.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function parseClienteCreatedAt(item: ClienteAzoupAdminView): Date | null {
  const raw = item.created_at;
  if (!raw) return null;
  try {
    const d = parseISO(String(raw));
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function resolverIntervaloPeriodo(filtro: ClientesFiltroState): { inicio: Date; fim: Date } | null {
  const hoje = new Date();

  switch (filtro.periodoPreset) {
    case 'todos':
      return null;
    case 'hoje':
      return { inicio: startOfDay(hoje), fim: endOfDay(hoje) };
    case '7d':
      return { inicio: startOfDay(subDays(hoje, 6)), fim: endOfDay(hoje) };
    case '30d':
      return { inicio: startOfDay(subDays(hoje, 29)), fim: endOfDay(hoje) };
    case 'mes_atual':
      return { inicio: startOfMonth(hoje), fim: endOfMonth(hoje) };
    case 'mes_passado': {
      const ref = subMonths(hoje, 1);
      return { inicio: startOfMonth(ref), fim: endOfMonth(ref) };
    }
    case 'personalizado': {
      const inicio = parseYmd(filtro.dataInicio);
      const fim = parseYmd(filtro.dataFim);
      if (!inicio && !fim) return null;
      return {
        inicio: startOfDay(inicio ?? fim!),
        fim: endOfDay(fim ?? inicio!),
      };
    }
    default:
      return null;
  }
}

function clienteNomeBusca(item: ClienteAzoupAdminView): string {
  return [item.nome_fantasia, item.nome, item.razao_social, item.email]
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

  if (nome.includes(q) || email.includes(q)) return true;
  if (qDigits.length >= 3 && tel.includes(qDigits)) return true;
  return false;
}

function matchStatus(item: ClienteAzoupAdminView, status: ClienteStatusFiltro): boolean {
  if (status === 'todos') return true;

  if (status === 'congelado') return Boolean(item.congelamento?.congelado);
  if (status === 'chamar') return clientePrecisaChamar(item.congelamento);

  const grupo = classificarStatusAssinatura(item.assinatura);

  if (status === 'ativo') return grupo === 'ativa';
  if (status === 'trial') return grupo === 'trial';
  if (status === 'inativo') {
    return (
      grupo === 'cancelada' ||
      grupo === 'inadimplente' ||
      grupo === 'outro' ||
      !item.assinatura?.status
    );
  }

  return true;
}

function matchPeriodo(item: ClienteAzoupAdminView, intervalo: { inicio: Date; fim: Date } | null): boolean {
  if (!intervalo) return true;
  const created = parseClienteCreatedAt(item);
  if (!created) return false;
  return isWithinInterval(created, intervalo);
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

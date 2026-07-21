/**
 * Status de assinatura — fonte: `status` + `trial_fim` em `assinaturas_clientes`.
 * Valores tipicos no Azoup: Ativo, Trial, Cancelado, Inadimplente, etc.
 */

import { dataHojeBrasil } from '@/src/utils/format';

export type AssinaturaStatusGrupo =
  | 'ativa'
  | 'trial'
  | 'trial_expirado'
  | 'inadimplente'
  | 'cancelada'
  | 'outro';

export type AssinaturaComStatus = {
  status?: string | null;
  trial_fim?: string | null;
};

function normStatus(status?: string | null): string {
  return `${status ?? ''}`.trim().toLowerCase();
}

function trialFimExpirado(trialFim?: string | null): boolean {
  const ymd = `${trialFim ?? ''}`.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return ymd < dataHojeBrasil();
}

function isStatusTrial(statusNorm: string): boolean {
  return statusNorm.includes('trial') || statusNorm.includes('teste');
}

export function classificarStatusAssinatura(row?: AssinaturaComStatus | null): AssinaturaStatusGrupo {
  const s = normStatus(row?.status);
  if (!s) return 'outro';

  // Antes de "ativo": "inativo" contem a substring "ativo"
  if (s.includes('cancel') || s.includes('encerr') || s.includes('inativ')) return 'cancelada';

  if (isStatusTrial(s)) {
    return trialFimExpirado(row?.trial_fim) ? 'trial_expirado' : 'trial';
  }

  if (s.includes('inadimpl') || s.includes('vencid') || s.includes('atrasad') || s.includes('past_due')) {
    return 'inadimplente';
  }
  if (s.includes('ativo') || s.includes('ativa') || s === 'active' || s.includes('active')) {
    return 'ativa';
  }

  return 'outro';
}

export function isAssinaturaAtiva(row?: AssinaturaComStatus | null): boolean {
  return classificarStatusAssinatura(row) === 'ativa';
}

export function isAssinaturaTrial(row?: AssinaturaComStatus | null): boolean {
  return classificarStatusAssinatura(row) === 'trial';
}

export function isAssinaturaTrialExpirado(row?: AssinaturaComStatus | null): boolean {
  return classificarStatusAssinatura(row) === 'trial_expirado';
}

export function isAssinaturaInadimplente(row?: AssinaturaComStatus | null): boolean {
  return classificarStatusAssinatura(row) === 'inadimplente';
}

export function isAssinaturaCancelada(row?: AssinaturaComStatus | null): boolean {
  return classificarStatusAssinatura(row) === 'cancelada';
}

/** Rotulo amigavel para UI (trial vencido = "Inativo no trial"). */
export function rotuloStatusAssinatura(row?: AssinaturaComStatus | null): string {
  if (!row?.status) return '—';
  if (classificarStatusAssinatura(row) === 'trial_expirado') return 'Inativo no trial';
  return row.status;
}

/** Prioriza ativo → trial → inadimplente → trial expirado → outro → cancelado. */
export function prioridadeAssinatura(row: AssinaturaComStatus): number {
  const g = classificarStatusAssinatura(row);
  if (g === 'ativa') return 100;
  if (g === 'trial') return 90;
  if (g === 'inadimplente') return 70;
  if (g === 'trial_expirado') return 55;
  if (g === 'outro') return 50;
  return 10;
}

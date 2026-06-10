/**
 * Status de assinatura — fonte única: coluna `status` em `assinaturas_clientes`.
 * Valores típicos no Azoup: Ativo, Trial, Cancelado, Inadimplente, etc.
 */

export type AssinaturaStatusGrupo = 'ativa' | 'trial' | 'inadimplente' | 'cancelada' | 'outro';

export type AssinaturaComStatus = { status?: string | null };

function normStatus(status?: string | null): string {
  return `${status ?? ''}`.trim().toLowerCase();
}

export function classificarStatusAssinatura(row?: AssinaturaComStatus | null): AssinaturaStatusGrupo {
  const s = normStatus(row?.status);
  if (!s) return 'outro';

  // Antes de "ativo": "inativo" contém a substring "ativo"
  if (s.includes('cancel') || s.includes('encerr') || s.includes('inativ')) return 'cancelada';
  if (s.includes('trial') || s.includes('teste')) return 'trial';
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

export function isAssinaturaInadimplente(row?: AssinaturaComStatus | null): boolean {
  return classificarStatusAssinatura(row) === 'inadimplente';
}

export function isAssinaturaCancelada(row?: AssinaturaComStatus | null): boolean {
  return classificarStatusAssinatura(row) === 'cancelada';
}

/** Exibe o valor gravado em `assinaturas_clientes.status`. */
export function rotuloStatusAssinatura(row?: AssinaturaComStatus | null): string {
  if (!row?.status) return '—';
  return row.status;
}

/** Prioriza ativo → trial → inadimplente → outro → cancelado ao escolher a assinatura “atual”. */
export function prioridadeAssinatura(row: AssinaturaComStatus): number {
  const g = classificarStatusAssinatura(row);
  if (g === 'ativa') return 100;
  if (g === 'trial') return 90;
  if (g === 'inadimplente') return 70;
  if (g === 'outro') return 50;
  return 10;
}

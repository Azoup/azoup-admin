export function formatBRLFromCentavos(centavos?: number | null) {
  if (centavos == null || Number.isNaN(Number(centavos))) return '—';
  const v = Number(centavos) / 100;
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Valor em reais (ex.: `valor_mensal_atual` numeric em `assinaturas_clientes`). */
export function formatBRLFromReais(reais?: number | null) {
  if (reais == null || Number.isNaN(Number(reais))) return '—';
  return Number(reais).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateBR(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

/** Data de calendário no fuso America/Sao_Paulo (YYYY-MM-DD). */
export function dataHojeBrasil(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

export function formatHoraBR(raw?: string | null) {
  if (!raw) return '';
  const m = `${raw}`.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return `${raw}`;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Data da conversa + horário opcional (ex.: 20/05/2026 às 14:30). */
export function formatConversaQuando(data?: string | null, hora?: string | null) {
  const d = formatDateBR(data);
  const h = formatHoraBR(hora);
  if (d === '—') return '—';
  return h ? `${d} às ${h}` : d;
}

export function formatDateTimeBR(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function rotuloValidadeCupom(redeemBy?: string | null) {
  if (!redeemBy) return 'Sem data limite para resgate';
  return `Válido para resgate até ${formatDateBR(redeemBy)}`;
}

export function rotuloDuracaoCupom(duration?: string | null, durationInMonths?: number | null) {
  if (duration === 'once') return 'Aplicabilidade: uma vez (primeira cobrança)';
  if (duration === 'forever') return 'Aplicabilidade: repete em todas as cobranças';
  if (duration === 'repeating') {
    const meses = Number(durationInMonths);
    if (Number.isFinite(meses) && meses > 0) {
      return `Aplicabilidade: repete por ${meses} ${meses === 1 ? 'mês' : 'meses'}`;
    }
    return 'Aplicabilidade: repete por período limitado';
  }
  return duration ? `Aplicabilidade: ${duration}` : 'Aplicabilidade: —';
}

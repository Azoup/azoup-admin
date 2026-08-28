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

/** Formata YYYY-MM-DD sem deslocar fuso (ex.: data_retorno). */
export function formatYmdBR(ymd?: string | null) {
  if (!ymd) return '—';
  const m = `${ymd}`.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return formatDateBR(ymd);
  return `${m[3]}/${m[2]}/${m[1]}`;
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

/**
 * Converte timestamp/ISO/YYYY-MM-DD para data de calendário em America/Sao_Paulo (YYYY-MM-DD).
 * Aceita formatos Postgres (`2024-01-15 12:00:00+00`) e ISO.
 */
export function dataCalendarioBrasil(raw?: string | Date | null): string | null {
  if (raw == null || raw === '') return null;

  if (typeof raw === 'string') {
    const t = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  }

  let d: Date;
  if (raw instanceof Date) {
    d = raw;
  } else {
    let t = `${raw}`.trim();
    // Postgres: "2024-01-15 12:00:00+00" → ISO com T e offset completo
    if (/^\d{4}-\d{2}-\d{2} /.test(t)) t = t.replace(' ', 'T');
    t = t.replace(/([+-]\d{2})$/, '$1:00');
    d = new Date(t);
    if (Number.isNaN(d.getTime())) d = new Date(`${raw}`.trim());
  }

  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

/** Soma/subtrai dias em uma data YYYY-MM-DD (calendário, sem fuso). */
export function somarDiasYmd(ymd: string, dias: number): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + dias * 86_400_000;
  const dt = new Date(utc);
  const y = dt.getUTCFullYear();
  const mo = `${dt.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${dt.getUTCDate()}`.padStart(2, '0');
  return `${y}-${mo}-${d}`;
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

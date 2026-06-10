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

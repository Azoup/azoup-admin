export const RESUMO_SECOES = [
  'cadastros',
  'vendas',
  'producao',
  'financeiro',
  'estoque',
  'pdv',
] as const;

export type ResumoSecaoId = (typeof RESUMO_SECOES)[number];

export const RESUMO_SECAO_LABEL: Record<ResumoSecaoId, string> = {
  cadastros: 'Cadastros',
  vendas: 'Vendas',
  producao: 'Produção',
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  pdv: 'PDV',
};

/** Mapeia seção do Resumo → valor de `confec_kanban_cards.secao`. */
export const RESUMO_SECAO_CONFEC: Record<ResumoSecaoId, string> = {
  cadastros: 'Cadastros',
  vendas: 'Vendas',
  producao: 'Produção',
  financeiro: 'Financeiro',
  estoque: 'Estoque',
  pdv: 'PDV',
};

export const TREINOU_STATUS = ['nao_treinou', 'em_treinamento', 'finalizado'] as const;
export type TreinouStatus = (typeof TREINOU_STATUS)[number];

export const TREINOU_LABEL: Record<TreinouStatus, string> = {
  nao_treinou: 'Sem treinamento',
  em_treinamento: 'Em treinamento',
  finalizado: 'Finalizado',
};

export type MetricaUsoCampo = {
  quantidade: number | null;
  ultima_data: string | null;
};

export type ResumoUsoCampos = {
  clientes?: MetricaUsoCampo;
  fornecedores?: MetricaUsoCampo;
  produtos?: MetricaUsoCampo;
  tecidos?: MetricaUsoCampo;
  aviamentos?: MetricaUsoCampo;
  vendas?: MetricaUsoCampo;
  notas_fiscais?: MetricaUsoCampo;
  ops?: MetricaUsoCampo;
  contas_receber?: MetricaUsoCampo;
  contas_pagar?: MetricaUsoCampo;
  movimentacoes?: MetricaUsoCampo;
};

export type ResumoSecaoPayload = {
  treinou: TreinouStatus;
  uso: ResumoUsoCampos;
};

export type ResumoPayload = Record<ResumoSecaoId, ResumoSecaoPayload>;

export type CampoUsoDef = {
  key: keyof ResumoUsoCampos;
  label: string;
};

export const CAMPOS_USO_POR_SECAO: Record<ResumoSecaoId, CampoUsoDef[]> = {
  cadastros: [
    { key: 'clientes', label: 'Clientes' },
    { key: 'fornecedores', label: 'Fornecedores' },
    { key: 'produtos', label: 'Produtos' },
    { key: 'tecidos', label: 'Tecidos' },
    { key: 'aviamentos', label: 'Aviamentos' },
  ],
  vendas: [
    { key: 'vendas', label: 'Vendas' },
    { key: 'notas_fiscais', label: 'Notas fiscais' },
  ],
  producao: [{ key: 'ops', label: 'Ops' }],
  financeiro: [
    { key: 'contas_receber', label: 'Contas a receber' },
    { key: 'contas_pagar', label: 'Contas a pagar' },
  ],
  estoque: [{ key: 'movimentacoes', label: 'Movimentações' }],
  pdv: [],
};

export function metricaVazia(): MetricaUsoCampo {
  return { quantidade: null, ultima_data: null };
}

export function secaoPayloadVazia(): ResumoSecaoPayload {
  return { treinou: 'nao_treinou', uso: {} };
}

export function payloadVazio(): ResumoPayload {
  return {
    cadastros: secaoPayloadVazia(),
    vendas: secaoPayloadVazia(),
    producao: secaoPayloadVazia(),
    financeiro: secaoPayloadVazia(),
    estoque: secaoPayloadVazia(),
    pdv: secaoPayloadVazia(),
  };
}

export function ehTreinouStatus(valor: unknown): valor is TreinouStatus {
  return TREINOU_STATUS.includes(valor as TreinouStatus);
}

export function normalizarPayload(raw: unknown): ResumoPayload {
  const base = payloadVazio();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, unknown>;
  for (const secao of RESUMO_SECOES) {
    const item = obj[secao];
    if (!item || typeof item !== 'object') continue;
    const bloco = item as { treinou?: unknown; uso?: unknown };
    const treinou = ehTreinouStatus(bloco.treinou) ? bloco.treinou : 'nao_treinou';
    const uso: ResumoUsoCampos = {};
    const usoRaw = bloco.uso && typeof bloco.uso === 'object' ? (bloco.uso as Record<string, unknown>) : {};
    for (const campo of CAMPOS_USO_POR_SECAO[secao]) {
      const m = usoRaw[campo.key];
      if (!m || typeof m !== 'object') {
        uso[campo.key] = metricaVazia();
        continue;
      }
      const q = (m as { quantidade?: unknown }).quantidade;
      const d = `${(m as { ultima_data?: unknown }).ultima_data ?? ''}`.trim().slice(0, 10);
      uso[campo.key] = {
        quantidade: typeof q === 'number' && Number.isFinite(q) ? q : q == null || q === '' ? null : Number(q),
        ultima_data: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
      };
      if (uso[campo.key]?.quantidade != null && !Number.isFinite(uso[campo.key]!.quantidade as number)) {
        uso[campo.key]!.quantidade = null;
      }
    }
    base[secao] = { treinou, uso };
  }
  return base;
}

export function formatarMetricaUso(m?: MetricaUsoCampo | null): string {
  if (!m) return '—';
  const q = m.quantidade;
  const d = m.ultima_data;
  if (q == null && !d) return '—';
  const qTxt = q == null ? '—' : `${q}`;
  if (!d) return qTxt;
  const [y, mo, day] = d.split('-');
  const dataBr = y && mo && day ? `${day}/${mo}/${y.slice(2)}` : d;
  return `${qTxt} · ${dataBr}`;
}

export function textoUsoSecao(secao: ResumoSecaoId, uso: ResumoUsoCampos): string {
  const campos = CAMPOS_USO_POR_SECAO[secao];
  if (!campos.length) return '—';
  return campos
    .map((campo) => `${campo.label}: ${formatarMetricaUso(uso[campo.key])}`)
    .join('\n');
}

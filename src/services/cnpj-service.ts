/** Consulta pública de CNPJ (BrasilAPI → OpenCNPJ → Minha Receita). Sem IE. */

export type CnpjLookupData = {
  razaoSocial: string;
  nomeFantasia: string;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  telefone: string;
  email: string;
};

function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

function texto(value: unknown): string {
  return String(value ?? '').trim();
}

/** Junta tipo (Rua/Av.) + logradouro, como no Confec. */
function montarLogradouro(...partes: unknown[]): string {
  return partes
    .map((p) => texto(p))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickLogradouro(data: Record<string, unknown>): string {
  const tipo =
    data.descricao_tipo_de_logradouro ??
    data.tipo_logradouro ??
    data.tipoLogradouro ??
    data.tipo;
  const log =
    data.logradouro ??
    data.street ??
    data.rua ??
    data.endereco ??
    data.address;
  return montarLogradouro(tipo, log);
}

function emptyResult(): CnpjLookupData {
  return {
    razaoSocial: '',
    nomeFantasia: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    municipio: '',
    uf: '',
    telefone: '',
    email: '',
  };
}

function fromBrasilApi(data: Record<string, unknown>): CnpjLookupData | null {
  const razao = texto(data.razao_social);
  if (!razao) return null;
  return {
    razaoSocial: razao,
    nomeFantasia: texto(data.nome_fantasia) || razao,
    cep: digitsOnly(texto(data.cep)),
    logradouro: pickLogradouro(data),
    numero: texto(data.numero),
    bairro: texto(data.bairro),
    municipio: texto(data.municipio),
    uf: texto(data.uf).toUpperCase(),
    telefone: digitsOnly(texto(data.ddd_telefone_1)),
    email: texto(data.email),
  };
}

function fromOpenCnpj(data: Record<string, unknown>): CnpjLookupData | null {
  const razao = texto(data.razao_social ?? data.nome);
  if (!razao) return null;
  const nested =
    data.estabelecimento && typeof data.estabelecimento === 'object'
      ? (data.estabelecimento as Record<string, unknown>)
      : null;
  const source = nested ?? data;
  return {
    razaoSocial: razao,
    nomeFantasia: texto(source.nome_fantasia ?? data.nome_fantasia ?? data.fantasia) || razao,
    cep: digitsOnly(texto(source.cep ?? data.cep)),
    logradouro: pickLogradouro(source) || pickLogradouro(data),
    numero: texto(source.numero ?? data.numero),
    bairro: texto(source.bairro ?? data.bairro),
    municipio: texto(
      source.municipio ??
        data.municipio ??
        data.cidade ??
        (source.cidade && typeof source.cidade === 'object'
          ? (source.cidade as Record<string, unknown>).nome
          : null),
    ),
    uf: texto(
      source.uf ??
        data.uf ??
        (source.estado && typeof source.estado === 'object'
          ? (source.estado as Record<string, unknown>).sigla
          : null),
    ).toUpperCase(),
    telefone: digitsOnly(texto(source.ddd_telefone_1 ?? data.ddd_telefone_1 ?? data.telefone)),
    email: texto(source.email ?? data.email),
  };
}

function fromMinhaReceita(data: Record<string, unknown>): CnpjLookupData | null {
  const razao = texto(data.razao_social ?? data.nome);
  if (!razao) return null;
  return {
    razaoSocial: razao,
    nomeFantasia: texto(data.nome_fantasia ?? data.fantasia) || razao,
    cep: digitsOnly(texto(data.cep)),
    logradouro: pickLogradouro(data),
    numero: texto(data.numero),
    bairro: texto(data.bairro),
    municipio: texto(data.municipio),
    uf: texto(data.uf).toUpperCase(),
    telefone: digitsOnly(texto(data.ddd_telefone_1 ?? data.telefone)),
    email: texto(data.email),
  };
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), 10000);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: ctrl?.signal,
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as Record<string, unknown>;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mergePreferindoCompleto(base: CnpjLookupData, extra: CnpjLookupData): CnpjLookupData {
  return {
    razaoSocial: base.razaoSocial || extra.razaoSocial,
    nomeFantasia: base.nomeFantasia || extra.nomeFantasia,
    cep: base.cep || extra.cep,
    logradouro: base.logradouro || extra.logradouro,
    numero: base.numero || extra.numero,
    bairro: base.bairro || extra.bairro,
    municipio: base.municipio || extra.municipio,
    uf: base.uf || extra.uf,
    telefone: base.telefone || extra.telefone,
    email: base.email || extra.email,
  };
}

/**
 * Busca razão social, fantasia e endereço pelo CNPJ.
 * Retorna null se inválido; lança se todas as fontes falharem.
 */
export async function buscarDadosCnpj(cnpj: string): Promise<CnpjLookupData | null> {
  const digits = digitsOnly(cnpj);
  if (digits.length !== 14) return null;

  const providers: Array<() => Promise<CnpjLookupData | null>> = [
    async () => {
      const data = await getJson(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      return data ? fromBrasilApi(data) : null;
    },
    async () => {
      const data = await getJson(`https://api.opencnpj.org/${digits}`);
      return data ? fromOpenCnpj(data) : null;
    },
    async () => {
      const data = await getJson(`https://minhareceita.org/${digits}`);
      return data ? fromMinhaReceita(data) : null;
    },
  ];

  let melhor: CnpjLookupData | null = null;
  for (const run of providers) {
    const result = await run();
    if (!result?.razaoSocial) continue;
    melhor = melhor ? mergePreferindoCompleto(melhor, result) : result;
    if (melhor.logradouro && melhor.cep && melhor.municipio) break;
  }

  if (melhor?.razaoSocial) return melhor;

  throw new Error('Não conseguimos buscar os dados deste CNPJ agora. Preencha manualmente ou tente de novo.');
}

export function cnpjLookupVazio(): CnpjLookupData {
  return emptyResult();
}

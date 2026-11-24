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
  const razao = String(data.razao_social ?? '').trim();
  if (!razao) return null;
  return {
    razaoSocial: razao,
    nomeFantasia: String(data.nome_fantasia ?? data.razao_social ?? '').trim() || razao,
    cep: digitsOnly(String(data.cep ?? '')),
    logradouro: String(data.logradouro ?? '').trim(),
    numero: String(data.numero ?? '').trim(),
    bairro: String(data.bairro ?? '').trim(),
    municipio: String(data.municipio ?? '').trim(),
    uf: String(data.uf ?? '').trim().toUpperCase(),
    telefone: digitsOnly(String(data.ddd_telefone_1 ?? '')),
    email: String(data.email ?? '').trim(),
  };
}

function fromOpenCnpj(data: Record<string, unknown>): CnpjLookupData | null {
  const razao = String(data.razao_social ?? data.nome ?? '').trim();
  if (!razao) return null;
  return {
    razaoSocial: razao,
    nomeFantasia: String(data.nome_fantasia ?? data.fantasia ?? razao).trim() || razao,
    cep: digitsOnly(String(data.cep ?? '')),
    logradouro: String(data.logradouro ?? '').trim(),
    numero: String(data.numero ?? '').trim(),
    bairro: String(data.bairro ?? '').trim(),
    municipio: String(data.municipio ?? data.cidade ?? '').trim(),
    uf: String(data.uf ?? '').trim().toUpperCase(),
    telefone: digitsOnly(String(data.ddd_telefone_1 ?? data.telefone ?? '')),
    email: String(data.email ?? '').trim(),
  };
}

function fromMinhaReceita(data: Record<string, unknown>): CnpjLookupData | null {
  const razao = String(data.razao_social ?? data.nome ?? '').trim();
  if (!razao) return null;
  return {
    razaoSocial: razao,
    nomeFantasia: String(data.nome_fantasia ?? data.fantasia ?? razao).trim() || razao,
    cep: digitsOnly(String(data.cep ?? '')),
    logradouro: String(data.logradouro ?? '').trim(),
    numero: String(data.numero ?? '').trim(),
    bairro: String(data.bairro ?? '').trim(),
    municipio: String(data.municipio ?? '').trim(),
    uf: String(data.uf ?? '').trim().toUpperCase(),
    telefone: digitsOnly(String(data.ddd_telefone_1 ?? data.telefone ?? '')),
    email: String(data.email ?? '').trim(),
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

  for (const run of providers) {
    const result = await run();
    if (result?.razaoSocial) return result;
  }

  throw new Error('Não conseguimos buscar os dados deste CNPJ agora. Preencha manualmente ou tente de novo.');
}

export function cnpjLookupVazio(): CnpjLookupData {
  return emptyResult();
}

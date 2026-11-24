/** Consulta ViaCEP → BrasilAPI para preencher endereço. */

export type CepLookupData = {
  rua: string;
  bairro: string;
  cidade: string;
  estado: string;
};

function digitsOnly(value: string): string {
  return String(value || '').replace(/\D/g, '');
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

function fromViaCep(data: Record<string, unknown>): CepLookupData | null {
  if (data.erro) return null;
  const rua = String(data.logradouro ?? '').trim();
  const cidade = String(data.localidade ?? '').trim();
  const estado = String(data.uf ?? '').trim().toUpperCase();
  if (!cidade && !rua && !estado) return null;
  return {
    rua,
    bairro: String(data.bairro ?? '').trim(),
    cidade,
    estado,
  };
}

function fromBrasilApi(data: Record<string, unknown>): CepLookupData | null {
  const rua = String(data.street ?? data.logradouro ?? '').trim();
  const cidade = String(data.city ?? data.localidade ?? '').trim();
  const estado = String(data.state ?? data.uf ?? '').trim().toUpperCase();
  if (!cidade && !rua && !estado) return null;
  return {
    rua,
    bairro: String(data.neighborhood ?? data.bairro ?? '').trim(),
    cidade,
    estado,
  };
}

/**
 * Busca logradouro, bairro, cidade e UF pelo CEP.
 * Retorna null se CEP incompleto; lança se não encontrar / falhar.
 */
export async function buscarEnderecoPorCep(cep: string): Promise<CepLookupData | null> {
  const digits = digitsOnly(cep);
  if (digits.length !== 8) return null;

  const via = await getJson(`https://viacep.com.br/ws/${digits}/json/`);
  if (via) {
    const mapped = fromViaCep(via);
    if (mapped) return mapped;
  }

  const brasil = await getJson(`https://brasilapi.com.br/api/cep/v2/${digits}`);
  if (brasil) {
    const mapped = fromBrasilApi(brasil);
    if (mapped) return mapped;
  }

  throw new Error('CEP não encontrado. Confira os dígitos ou preencha o endereço manualmente.');
}

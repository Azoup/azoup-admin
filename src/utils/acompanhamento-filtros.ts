export type FiltrosAcompanhamento = {
  busca: string;
  filtroAlerta: boolean;
  filtroSemReuniao: boolean;
  filtroAguardandoRetorno: boolean;
};

const VAZIO: FiltrosAcompanhamento = {
  busca: '',
  filtroAlerta: false,
  filtroSemReuniao: false,
  filtroAguardandoRetorno: false,
};

const CHAVE = 'acompanhamento_filtros';

let memoria: FiltrosAcompanhamento = { ...VAZIO };

function lerSessao(): FiltrosAcompanhamento | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const json = JSON.parse(bruto) as Partial<FiltrosAcompanhamento>;
    return {
      busca: `${json.busca ?? ''}`,
      filtroAlerta: Boolean(json.filtroAlerta),
      filtroSemReuniao: Boolean(json.filtroSemReuniao),
      filtroAguardandoRetorno: Boolean(json.filtroAguardandoRetorno),
    };
  } catch {
    return null;
  }
}

export function lerFiltrosAcompanhamento(): FiltrosAcompanhamento {
  return lerSessao() ?? memoria;
}

export function salvarFiltrosAcompanhamento(filtros: FiltrosAcompanhamento): void {
  memoria = filtros;
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(filtros));
  } catch {
    /* a memória da aba segue valendo nesta sessão */
  }
}

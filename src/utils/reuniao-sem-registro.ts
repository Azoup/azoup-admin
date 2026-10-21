import { dataCalendarioBrasil } from '@/src/utils/format';

export function chaveClienteDia(clienteId?: string | null, instante?: string | Date | null): string | null {
  const id = `${clienteId ?? ''}`.trim();
  const dia = dataCalendarioBrasil(instante);
  if (!id || !dia) return null;
  return `${id}|${dia}`;
}

/** Mesma cobertura da agenda: um registro manual no dia do cliente. */
export function cobertasDeRegistrosManuais(
  registros: Array<{ cliente_id?: string | null; created_at?: string | null }>,
): Set<string> {
  const cobertas = new Set<string>();
  for (const row of registros) {
    const chave = chaveClienteDia(row.cliente_id, row.created_at);
    if (chave) cobertas.add(chave);
  }
  return cobertas;
}

/**
 * Mesma regra do card da agenda: já começou e não tem registro manual no dia.
 * Evento sem cliente conta como sem registro.
 */
export function eventoAgendaSemRegistro(
  ev: { inicio?: string | null; cliente_id?: string | null; status?: string | null },
  cobertas: Set<string>,
  agora = Date.now(),
): boolean {
  if (`${ev.status ?? ''}`.trim() === 'cancelled') return false;
  const inicio = `${ev.inicio ?? ''}`.trim();
  if (!inicio) return false;
  const t = Date.parse(inicio);
  if (!Number.isFinite(t) || t >= agora) return false;
  const clienteId = `${ev.cliente_id ?? ''}`.trim();
  if (!clienteId) return true;
  const chave = chaveClienteDia(clienteId, inicio);
  return Boolean(chave) && !cobertas.has(chave as string);
}

import type { SupabaseClient } from '@supabase/supabase-js';

const CHUNK = 80;

type Db = Pick<SupabaseClient, 'from'>;

function queryNotasGeradas(sb: Db) {
  return sb.from('nota_fiscal').select('id').not('numero', 'is', null).is('cancelado_em', null);
}

async function idsPorRelacao(
  sb: Db,
  campo: 'venda_id' | 'venda_faturamento_id' | 'empresa_id',
  foreignIds: (string | number)[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let i = 0; i < foreignIds.length; i += CHUNK) {
    const chunk = foreignIds.slice(i, i + CHUNK);
    const { data, error } = await queryNotasGeradas(sb).in(campo, chunk);
    if (error) throw error;
    for (const row of data ?? []) ids.add(String(row.id));
  }
  return ids;
}

/** Notas com número atribuído e não canceladas, vinculadas ao tenant por qualquer FK. */
export async function contarNotasFiscaisGeradasDoCliente(sb: Db, clienteId: string): Promise<number> {
  const ids = new Set<string>();

  const { data: direto, error: errDireto } = await queryNotasGeradas(sb).eq('cliente_id_tenant', clienteId);
  if (errDireto) throw errDireto;
  for (const row of direto ?? []) ids.add(String(row.id));

  const [vendasRes, fatRes, empRes] = await Promise.all([
    sb.from('venda').select('id').eq('cliente_id_tenant', clienteId),
    sb.from('venda_faturamento').select('id').eq('cliente_id_tenant', clienteId),
    sb.from('empresas').select('id').eq('cliente_id', clienteId),
  ]);

  if (vendasRes.error) throw vendasRes.error;
  if (fatRes.error) throw fatRes.error;
  if (empRes.error) throw empRes.error;

  const vendaIds = (vendasRes.data ?? []).map((v) => v.id as number);
  const fatIds = (fatRes.data ?? []).map((f) => f.id as string);
  const empIds = (empRes.data ?? []).map((e) => e.id as string);

  if (vendaIds.length) (await idsPorRelacao(sb, 'venda_id', vendaIds)).forEach((id) => ids.add(id));
  if (fatIds.length) (await idsPorRelacao(sb, 'venda_faturamento_id', fatIds)).forEach((id) => ids.add(id));
  if (empIds.length) (await idsPorRelacao(sb, 'empresa_id', empIds)).forEach((id) => ids.add(id));

  return ids.size;
}

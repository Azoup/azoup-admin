import { supabase } from '@/src/lib/supabase';
import { dataCalendarioBrasil } from '@/src/utils/format';

/** Próximo início (YYYY-MM-DD) por cliente a partir do cache Google. */
export async function listarProximasReunioesGoogle(clienteIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!clienteIds.length) return map;

  const agora = new Date().toISOString();
  const CHUNK = 200;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_google_agendamentos')
      .select('cliente_id,inicio')
      .in('cliente_id', chunk)
      .gte('inicio', agora)
      .order('inicio', { ascending: true });

    if (error) {
      if (/admin_google_agendamentos|schema cache|does not exist/i.test(error.message)) {
        return map;
      }
      throw new Error(error.message);
    }

    for (const row of (data ?? []) as { cliente_id?: string | null; inicio?: string | null }[]) {
      const cid = `${row.cliente_id ?? ''}`;
      if (!cid || map.has(cid) || !row.inicio) continue;
      const ymd = dataCalendarioBrasil(row.inicio);
      if (ymd) map.set(cid, ymd);
    }
  }
  return map;
}

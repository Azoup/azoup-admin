import { supabase } from '@/src/lib/supabase';
import type { ClienteMarketingUtmRow } from '@/src/types/azoup';

export async function listarMarketingUtm(): Promise<ClienteMarketingUtmRow[]> {
  const { data, error } = await supabase
    .from('clientes_marketing_utm')
    .select(
      `
      id,
      cliente_id,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      capturado_em,
      atualizado_em,
      clientes_azoup ( nome, email )
    `,
    )
    .order('capturado_em', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ClienteMarketingUtmRow[];
}

import { supabase } from '@/src/lib/supabase';
import type { AdminClienteMensagemDiariaRow } from '@/src/types/azoup';
import { dataHojeBrasil } from '@/src/utils/format';

export async function listarClientesComMensagemHoje(clienteIds: string[]): Promise<Set<string>> {
  const marcados = new Set<string>();
  if (!clienteIds.length) return marcados;

  const hoje = dataHojeBrasil();
  const { data, error } = await supabase
    .from('admin_cliente_mensagem_diaria')
    .select('cliente_id')
    .in('cliente_id', clienteIds)
    .eq('data_marcacao', hoje);

  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    marcados.add((row as { cliente_id: string }).cliente_id);
  }
  return marcados;
}

export async function marcarMensagemEnviadaHoje(params: {
  clienteId: string;
  adminEmail?: string | null;
}): Promise<AdminClienteMensagemDiariaRow> {
  const hoje = dataHojeBrasil();
  const { data, error } = await supabase
    .from('admin_cliente_mensagem_diaria')
    .upsert(
      {
        cliente_id: params.clienteId,
        data_marcacao: hoje,
        admin_email: params.adminEmail ?? null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: 'cliente_id' },
    )
    .select('cliente_id,data_marcacao,admin_email,updated_at')
    .single();

  if (error) throw new Error(error.message);
  return data as AdminClienteMensagemDiariaRow;
}

export async function desmarcarMensagemEnviadaHoje(clienteId: string): Promise<void> {
  const hoje = dataHojeBrasil();
  const { error } = await supabase
    .from('admin_cliente_mensagem_diaria')
    .delete()
    .eq('cliente_id', clienteId)
    .eq('data_marcacao', hoje);

  if (error) throw new Error(error.message);
}

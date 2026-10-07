import { supabase } from '@/src/lib/supabase';

export type DigisacBoasVindasConfig = {
  habilitado: boolean;
  mensagem: string;
};

export type DigisacEnvioCliente = {
  protocolo: string | null;
  status: string;
  erro: string | null;
};

function tabelaAusente(message: string, tabela: string): boolean {
  return new RegExp(`${tabela}|schema cache`, 'i').test(message);
}

export async function lerDigisacBoasVindas(): Promise<DigisacBoasVindasConfig> {
  const { data, error } = await supabase
    .from('admin_digisac_boas_vindas')
    .select('habilitado, mensagem')
    .eq('id', 1)
    .maybeSingle();
  if (error) {
    if (tabelaAusente(error.message, 'admin_digisac_boas_vindas')) {
      return { habilitado: false, mensagem: '' };
    }
    throw new Error(error.message);
  }
  return {
    habilitado: Boolean(data?.habilitado),
    mensagem: `${data?.mensagem ?? ''}`,
  };
}

export async function salvarDigisacBoasVindas(config: DigisacBoasVindasConfig): Promise<DigisacBoasVindasConfig> {
  const { data, error } = await supabase
    .from('admin_digisac_boas_vindas')
    .upsert(
      {
        id: 1,
        habilitado: config.habilitado,
        mensagem: config.mensagem,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )
    .select('habilitado, mensagem')
    .single();
  if (error) {
    if (tabelaAusente(error.message, 'admin_digisac_boas_vindas')) {
      throw new Error('Execute supabase/sql/admin_digisac_boas_vindas.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  return {
    habilitado: Boolean(data?.habilitado),
    mensagem: `${data?.mensagem ?? ''}`,
  };
}

export async function listarMensagensAutomaticasEnviadas(clienteIds: string[]): Promise<Set<string>> {
  const enviados = new Set<string>();
  if (!clienteIds.length) return enviados;
  const CHUNK = 200;
  for (let i = 0; i < clienteIds.length; i += CHUNK) {
    const chunk = clienteIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('admin_digisac_envio')
      .select('cliente_id')
      .in('cliente_id', chunk)
      .eq('status', 'enviado');
    if (error) {
      if (tabelaAusente(error.message, 'admin_digisac_envio')) return enviados;
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      const id = `${(row as { cliente_id?: string }).cliente_id ?? ''}`;
      if (id) enviados.add(id);
    }
  }
  return enviados;
}

export async function buscarEnvioDigisac(clienteId: string): Promise<DigisacEnvioCliente | null> {
  if (!clienteId) return null;
  const { data, error } = await supabase
    .from('admin_digisac_envio')
    .select('protocolo, status, erro')
    .eq('cliente_id', clienteId)
    .maybeSingle();
  if (error) {
    if (tabelaAusente(error.message, 'admin_digisac_envio')) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    protocolo: data.protocolo ? `${data.protocolo}` : null,
    status: `${data.status ?? ''}`,
    erro: data.erro ? `${data.erro}` : null,
  };
}

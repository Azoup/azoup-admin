import { supabase } from '@/src/lib/supabase';
import { digitsOnlyPhone } from '@/src/utils/whatsapp';

export type TelefoneDigisacCliente = {
  id: string;
  telefone: string;
  descricao: string;
};

function tabelaAusente(message: string): boolean {
  return /admin_digisac_telefones|schema cache/i.test(message);
}

function limparDescricao(value: string | null | undefined): string {
  return `${value ?? ''}`.trim().slice(0, 80);
}

export function formatarTelefoneDigisac(digits: string): string {
  const limpo = digits.replace(/\D/g, '');
  const local = limpo.startsWith('55') && limpo.length > 11 ? limpo.slice(2) : limpo;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits.trim() || limpo;
}

export function normalizarTelefoneCliente(value: string): string | null {
  let digits = digitsOnlyPhone(value);
  if (!digits) return null;
  while (digits.startsWith('0')) digits = digits.slice(1);
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (digits.length < 12 || digits.length > 15) return null;
  return digits;
}

export async function listarTelefonesDigisac(clienteId: string): Promise<TelefoneDigisacCliente[]> {
  let { data, error } = await supabase
    .from('admin_digisac_telefones')
    .select('id, telefone, descricao')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: true });
  if (error && /descricao/i.test(error.message)) {
    ({ data, error } = await supabase
      .from('admin_digisac_telefones')
      .select('id, telefone')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: true }));
  }
  if (error) {
    if (tabelaAusente(error.message)) {
      throw new Error('Execute supabase/sql/admin_digisac_chamados.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: `${(row as { id?: string }).id ?? ''}`,
    telefone: `${(row as { telefone?: string }).telefone ?? ''}`,
    descricao: limparDescricao((row as { descricao?: string | null }).descricao),
  })).filter((row) => row.id && row.telefone);
}

export async function adicionarTelefoneDigisac(
  clienteId: string,
  telefone: string,
  descricao?: string,
): Promise<void> {
  const numero = normalizarTelefoneCliente(telefone);
  if (!numero) throw new Error('Informe um telefone com DDD.');
  const nome = limparDescricao(descricao);
  const payload: Record<string, string> = {
    cliente_id: clienteId,
    telefone: numero,
  };
  if (nome) payload.descricao = nome;
  let { error } = await supabase.from('admin_digisac_telefones').insert(payload);
  if (error && nome && /descricao/i.test(error.message)) {
    ({ error } = await supabase.from('admin_digisac_telefones').insert({
      cliente_id: clienteId,
      telefone: numero,
    }));
  }
  if (error) {
    if (tabelaAusente(error.message)) {
      throw new Error('Execute supabase/sql/admin_digisac_chamados.sql no Supabase.');
    }
    if (/duplicate|unique/i.test(error.message)) {
      throw new Error('Este telefone já está neste cliente.');
    }
    throw new Error(error.message);
  }
}

export async function atualizarDescricaoTelefoneDigisac(id: string, descricao: string): Promise<void> {
  const { error } = await supabase
    .from('admin_digisac_telefones')
    .update({ descricao: limparDescricao(descricao) || null })
    .eq('id', id);
  if (error) {
    if (/descricao/i.test(error.message)) {
      throw new Error('Execute supabase/sql/admin_digisac_telefones_descricao.sql no Supabase.');
    }
    throw new Error(error.message);
  }
}

export async function removerTelefoneDigisac(id: string): Promise<void> {
  const { error } = await supabase.from('admin_digisac_telefones').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

import { supabase } from '@/src/lib/supabase';
import { upsertCfopPadraoViaFunction } from '@/src/services/stripe-admin-api';
import type { CfopPadraoRow } from '@/src/types/azoup';

export function parseCfopCodigo(raw: string): string {
  const digits = `${raw ?? ''}`.replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 10) {
    throw new Error('O CFOP precisa ter de 4 a 10 dígitos.');
  }
  return digits;
}

export function parseCfopDescricao(raw: string): string {
  const texto = `${raw ?? ''}`.trim();
  if (!texto) throw new Error('Informe a descrição do CFOP.');
  if (texto.length > 255) throw new Error('A descrição pode ter no máximo 255 caracteres.');
  return texto;
}

export async function listarCfopPadrao(): Promise<CfopPadraoRow[]> {
  const { data, error } = await supabase
    .from('cfop_codigos_padrao')
    .select('codigo,descricao,ativo,updated_by_admin,created_at,updated_at')
    .order('codigo', { ascending: true });
  if (error) {
    if (/cfop_codigos_padrao|schema cache/i.test(error.message)) {
      throw new Error('Tabela de CFOP padrão ausente. Rode supabase/sql/cfop_codigos_padrao.sql no Supabase.');
    }
    throw new Error(error.message);
  }
  return (data ?? []) as CfopPadraoRow[];
}

export async function salvarCfopPadrao(input: {
  codigo: string;
  descricao: string;
  ativo: boolean;
  updatedByAdmin?: string | null;
}): Promise<CfopPadraoRow> {
  const res = await upsertCfopPadraoViaFunction({
    codigo: parseCfopCodigo(input.codigo),
    descricao: parseCfopDescricao(input.descricao),
    ativo: input.ativo,
    updated_by_admin: input.updatedByAdmin?.trim() || null,
  });
  return res.cfop as CfopPadraoRow;
}

import { supabase } from '@/src/lib/supabase';
import type { AdminPreCadastroRow, InserirPreCadastroInput, PreCadastroStatus } from '@/src/types/azoup';

function textoOuNulo(value: string | null | undefined): string | null {
  const t = `${value ?? ''}`.trim();
  return t ? t : null;
}

function intNaoNegativo(value: unknown, fallback = 0): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function money(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function novoToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function montarLinha(input: InserirPreCadastroInput): Omit<AdminPreCadastroRow, 'id' | 'criado_em' | 'atualizado_em'> {
  const email = `${input.email ?? ''}`.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Informe um e-mail válido para o primeiro login.');
  const planoId = Number(input.plano_id);
  if (!Number.isFinite(planoId)) throw new Error('Selecione um plano Confec.');

  const status: PreCadastroStatus = input.status ?? 'link_gerado';

  return {
    token: novoToken(),
    status,
    plano_id: planoId,
    usuarios_adicionais: intNaoNegativo(input.usuarios_adicionais),
    empresas_adicionais: intNaoNegativo(input.empresas_adicionais),
    pdv_assentos: intNaoNegativo(input.pdv_assentos),
    ecommerce_lojas: intNaoNegativo(input.ecommerce_lojas),
    conciliacao_contas: intNaoNegativo(input.conciliacao_contas),
    valor_mensal_calculado: money(input.valor_mensal_calculado),
    valor_mensal_override: input.valor_mensal_override == null ? null : money(input.valor_mensal_override),
    valor_anual_calculado: money(input.valor_anual_calculado),
    valor_anual_override: input.valor_anual_override == null ? null : money(input.valor_anual_override),
    desconto_anual_percent_usado: money(input.desconto_anual_percent_usado),
    nome_dono: textoOuNulo(input.nome_dono),
    cpf: textoOuNulo(input.cpf),
    email,
    telefone: textoOuNulo(input.telefone),
    cep: textoOuNulo(input.cep),
    rua: textoOuNulo(input.rua),
    numero: textoOuNulo(input.numero),
    bairro: textoOuNulo(input.bairro),
    cidade: textoOuNulo(input.cidade),
    estado: textoOuNulo(input.estado),
    pais_codigo: textoOuNulo(input.pais_codigo) ?? '1058',
    cnpj: textoOuNulo(input.cnpj),
    razao_social: textoOuNulo(input.razao_social),
    nome_fantasia: textoOuNulo(input.nome_fantasia),
    ie: textoOuNulo(input.ie),
    cep_empresa: textoOuNulo(input.cep_empresa),
    rua_empresa: textoOuNulo(input.rua_empresa),
    numero_empresa: textoOuNulo(input.numero_empresa),
    bairro_empresa: textoOuNulo(input.bairro_empresa),
    cidade_empresa: textoOuNulo(input.cidade_empresa),
    estado_empresa: textoOuNulo(input.estado_empresa),
    regime_tributario: textoOuNulo(input.regime_tributario),
    apuracao_pis_cofins: textoOuNulo(input.apuracao_pis_cofins),
    criado_por_admin: textoOuNulo(input.criado_por_admin),
  };
}

export async function listarPreCadastros(limit = 50): Promise<AdminPreCadastroRow[]> {
  const { data, error } = await supabase
    .from('admin_pre_cadastros')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPreCadastroRow[];
}

export async function obterPreCadastroPorId(id: string): Promise<AdminPreCadastroRow | null> {
  const { data, error } = await supabase.from('admin_pre_cadastros').select('*').eq('id', id).maybeSingle();
  if (error && error.code !== 'PGRST116') throw new Error(error.message);
  return (data as AdminPreCadastroRow) ?? null;
}

export async function inserirPreCadastro(input: InserirPreCadastroInput): Promise<AdminPreCadastroRow> {
  const row = montarLinha(input);
  const { data, error } = await supabase.from('admin_pre_cadastros').insert(row as never).select('*').single();
  if (error) throw new Error(error.message);
  return data as AdminPreCadastroRow;
}

export async function cancelarPreCadastro(id: string): Promise<AdminPreCadastroRow> {
  const { data, error } = await supabase
    .from('admin_pre_cadastros')
    .update({ status: 'cancelado' } as never)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as AdminPreCadastroRow;
}

export function rotuloStatusPreCadastro(status: string | null | undefined): string {
  switch (`${status ?? ''}`.trim()) {
    case 'rascunho':
      return 'Rascunho';
    case 'link_gerado':
      return 'Link gerado';
    case 'preenchendo':
      return 'Cliente preenchendo';
    case 'aguardando_pagamento':
      return 'Aguardando pagamento';
    case 'pago':
      return 'Pago';
    case 'cancelado':
      return 'Cancelado';
    case 'expirado':
      return 'Expirado';
    default:
      return status || '—';
  }
}

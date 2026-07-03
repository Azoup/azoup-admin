/** Chaves de verificação automática suportadas pelo ERP (metodo360Verification.js). */
export const METODO360_CRITERIOS = [
  { value: '', label: 'Nenhum (manual / só vídeo)' },
  { value: 'clientes_min_1', label: '≥ 1 cliente cadastrado' },
  { value: 'produtos_min_1', label: '≥ 1 produto cadastrado' },
  { value: 'vendas_min_1', label: '≥ 1 venda registrada' },
  { value: 'usuarios_min_1', label: '≥ 1 usuário cadastrado' },
  { value: 'empresas_min_1', label: '≥ 1 empresa cadastrada' },
  { value: 'roteiros_min_1', label: '≥ 1 roteiro de produção' },
  { value: 'producao_op_min_1', label: '≥ 1 ordem de produção' },
  { value: 'contas_pagar_min_1', label: '≥ 1 conta a pagar' },
  { value: 'contas_receber_min_1', label: '≥ 1 conta a receber' },
  { value: 'contas_receber_baixada_min_1', label: '≥ 1 conta a receber baixada' },
  { value: 'estoque_saldo_min_1', label: '≥ 1 item com saldo em estoque' },
  { value: 'whatsapp_ia_vinculado', label: 'WhatsApp IA vinculado' },
] as const;

export const METODO360_CRITERIO_VALUES = METODO360_CRITERIOS.map((c) => c.value).filter(Boolean);

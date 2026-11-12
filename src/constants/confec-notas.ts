export const CONFEC_SECOES = [
  'Vendas',
  'Produção',
  'Financeiro',
  'Cadastros',
  'Estoque',
  'PDV',
  'Agenda',
  'Outros',
] as const;

export type ConfecSecao = (typeof CONFEC_SECOES)[number];

export function ehSecaoConfec(valor: string): valor is ConfecSecao {
  return (CONFEC_SECOES as readonly string[]).includes(valor);
}

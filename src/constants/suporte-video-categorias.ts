export const SUPORTE_VIDEO_CATEGORIAS = [
  'Vendas',
  'Financeiro',
  'Produção',
  'Estoque',
  'Cadastros',
  'Configurações',
  'Método 360',
] as const;

export type SuporteVideoCategoria = (typeof SUPORTE_VIDEO_CATEGORIAS)[number];

export function isSuporteVideoCategoria(value: string): value is SuporteVideoCategoria {
  return (SUPORTE_VIDEO_CATEGORIAS as readonly string[]).includes(value);
}

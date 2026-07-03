export type Metodo360Missao = {
  numero: number;
  titulo: string;
  objetivo: string;
  resultado: string;
  whatsapp: string;
};

/** Textos fixos das 7 missões (espelham metodo360Missions.js do ERP). */
export const METODO360_MISSOES: Metodo360Missao[] = [
  {
    numero: 1,
    titulo: 'Base no Lugar',
    objetivo: 'Centralizar as informações essenciais da confecção no ERP.',
    resultado: 'Cadastros base prontos para operar com consistência.',
    whatsapp: 'Use o WhatsApp para consultar status enquanto organiza os cadastros.',
  },
  {
    numero: 2,
    titulo: 'WhatsApp no Comando',
    objetivo: 'Operar o ERP pelo WhatsApp com o assistente IA.',
    resultado: 'Equipe consultando e registrando informações pelo celular.',
    whatsapp: 'Configure o assistente e teste perguntas do dia a dia.',
  },
  {
    numero: 3,
    titulo: 'Produção à Vista',
    objetivo: 'Ter visibilidade dos pedidos e da produção em andamento.',
    resultado: 'Kanban e roteiros alimentados com dados reais.',
    whatsapp: 'Peça resumos de OPs pelo WhatsApp para validar o fluxo.',
  },
  {
    numero: 4,
    titulo: 'Estoque e Vendas na Mão',
    objetivo: 'Tomar decisões com dados reais de estoque e vendas.',
    resultado: 'Painéis e relatórios refletindo a operação.',
    whatsapp: 'Consulte saldos e vendas recentes antes de fechar pedidos.',
  },
  {
    numero: 5,
    titulo: 'Controle Financeiro',
    objetivo: 'Organizar contas a pagar, receber e fluxo de caixa.',
    resultado: 'Financeiro registrado e acompanhado no sistema.',
    whatsapp: 'Use lembretes de vencimentos nas conversas com a equipe.',
  },
  {
    numero: 6,
    titulo: 'Lucro Protegido',
    objetivo: 'Proteger margem com custos e tabela de preços.',
    resultado: 'Precificação alinhada aos custos reais.',
    whatsapp: 'Revise margens dos produtos mais vendidos.',
  },
  {
    numero: 7,
    titulo: 'Rotina 360',
    objetivo: 'Consolidar a rotina diária de gestão no Azoup.',
    resultado: 'Jornada 360 concluída — operação integrada.',
    whatsapp: 'Mantenha o hábito de checar indicadores toda manhã.',
  },
];

export function metodo360MissaoPorNumero(numero: number): Metodo360Missao | undefined {
  return METODO360_MISSOES.find((m) => m.numero === numero);
}

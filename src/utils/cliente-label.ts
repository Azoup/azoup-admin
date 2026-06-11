import type { ClienteAzoupRow } from '@/src/types/azoup';

export function rotuloCliente(
  cliente: Pick<ClienteAzoupRow, 'id' | 'nome_fantasia' | 'nome' | 'razao_social' | 'email'>,
): string {
  const fantasia = `${cliente.nome_fantasia ?? ''}`.trim();
  if (fantasia) return fantasia;
  const nome = `${cliente.nome ?? ''}`.trim();
  if (nome) return nome;
  const razao = `${cliente.razao_social ?? ''}`.trim();
  if (razao) return razao;
  const email = `${cliente.email ?? ''}`.trim();
  if (email) return email;
  return `Cliente ${cliente.id.slice(0, 8)}`;
}

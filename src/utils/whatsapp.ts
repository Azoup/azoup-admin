/** Remove tudo que não for dígito. */
export function digitsOnlyPhone(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Monta URL wa.me a partir de telefone/celular BR.
 * Prioriza celular; aceita DDD + número com ou sem +55.
 */
export function phoneToWhatsAppUrl(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;

  let digits = digitsOnlyPhone(phone);
  if (!digits) return null;

  while (digits.startsWith('0')) digits = digits.slice(1);

  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }

  if (digits.length < 12 || digits.length > 15) return null;

  return `https://wa.me/${digits}`;
}

export function resolveClienteWhatsAppUrl(
  celular?: string | null,
  telefone?: string | null,
): string | null {
  return phoneToWhatsAppUrl(celular) ?? phoneToWhatsAppUrl(telefone);
}

/**
 * Validador determinístico de CPF (sem chamada externa à Receita Federal).
 *
 * Verifica:
 * 1. 11 dígitos após normalização (remove pontos/traços/espaços).
 * 2. Não-sequencial (00000000000, 11111111111, ...).
 * 3. Dois dígitos verificadores (módulo 11) corretos.
 *
 * **Não valida** se o CPF é "real" (existe na Receita) — apenas se a estrutura
 * é matematicamente válida. Para o nosso caso (anti-fraude no Free), isto é
 * suficiente: gerador online produz CPFs estruturalmente válidos mas a
 * detecção cross-tenant pega reuso em massa.
 */

const SEQUENTIAL_CPFS = new Set([
  "00000000000",
  "11111111111",
  "22222222222",
  "33333333333",
  "44444444444",
  "55555555555",
  "66666666666",
  "77777777777",
  "88888888888",
  "99999999999",
]);

export type CpfValidationResult =
  | { valid: true; canonical: string }
  | { valid: false; reason: "format" | "sequential" | "checksum" };

/** Remove pontos, traços e espaços. Retorna apenas dígitos. */
export function canonicalizeCpf(input: string): string {
  return input.replace(/\D/g, "");
}

export function validateCpf(input: string | null | undefined): CpfValidationResult {
  if (!input) return { valid: false, reason: "format" };
  const cpf = canonicalizeCpf(input);

  if (cpf.length !== 11) return { valid: false, reason: "format" };
  if (SEQUENTIAL_CPFS.has(cpf)) return { valid: false, reason: "sequential" };

  // Primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let remainder = sum % 11;
  const dv1 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(cpf.charAt(9), 10) !== dv1) {
    return { valid: false, reason: "checksum" };
  }

  // Segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  remainder = sum % 11;
  const dv2 = remainder < 2 ? 0 : 11 - remainder;
  if (parseInt(cpf.charAt(10), 10) !== dv2) {
    return { valid: false, reason: "checksum" };
  }

  return { valid: true, canonical: cpf };
}

/** Formata CPF canonicalizado em xxx.xxx.xxx-xx para exibição. */
export function formatCpf(canonical: string): string {
  if (canonical.length !== 11) return canonical;
  return `${canonical.slice(0, 3)}.${canonical.slice(3, 6)}.${canonical.slice(6, 9)}-${canonical.slice(9)}`;
}

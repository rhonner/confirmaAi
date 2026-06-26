/**
 * Validador determinístico de CNPJ (espelha `cpf-validator.ts`).
 *
 * Verifica:
 * 1. 14 dígitos após normalização (remove pontos/barras/traços/espaços).
 * 2. Não-sequencial (00000000000000, 11111111111111, ...).
 * 3. Dois dígitos verificadores (módulo 11, pesos do CNPJ) corretos.
 *
 * **Não valida** se o CNPJ existe na Receita — apenas a estrutura matemática.
 * Suficiente para o mesmo propósito do CPF (anti-fraude no Free + cobrança Asaas,
 * que aceita CPF e CNPJ no campo `cpfCnpj`).
 */

const SEQUENTIAL_CNPJS = new Set(
  Array.from({ length: 10 }, (_, d) => String(d).repeat(14)),
);

// Pesos do módulo 11 do CNPJ (diferentes do CPF).
const CNPJ_W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export type CnpjValidationResult =
  | { valid: true; canonical: string }
  | { valid: false; reason: "format" | "sequential" | "checksum" };

/** Remove pontos, barras, traços e espaços. Retorna apenas dígitos. */
export function canonicalizeCnpj(input: string): string {
  return input.replace(/\D/g, "");
}

function checkDigit(digits: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) {
    sum += parseInt(digits.charAt(i), 10) * weights[i];
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function validateCnpj(input: string | null | undefined): CnpjValidationResult {
  if (!input) return { valid: false, reason: "format" };
  const cnpj = canonicalizeCnpj(input);

  if (cnpj.length !== 14) return { valid: false, reason: "format" };
  if (SEQUENTIAL_CNPJS.has(cnpj)) return { valid: false, reason: "sequential" };

  const dv1 = checkDigit(cnpj.slice(0, 12), CNPJ_W1);
  if (parseInt(cnpj.charAt(12), 10) !== dv1) {
    return { valid: false, reason: "checksum" };
  }

  const dv2 = checkDigit(cnpj.slice(0, 13), CNPJ_W2);
  if (parseInt(cnpj.charAt(13), 10) !== dv2) {
    return { valid: false, reason: "checksum" };
  }

  return { valid: true, canonical: cnpj };
}

/** Formata CNPJ canonicalizado em XX.XXX.XXX/XXXX-XX para exibição. */
export function formatCnpj(canonical: string): string {
  if (canonical.length !== 14) return canonical;
  return `${canonical.slice(0, 2)}.${canonical.slice(2, 5)}.${canonical.slice(5, 8)}/${canonical.slice(8, 12)}-${canonical.slice(12)}`;
}

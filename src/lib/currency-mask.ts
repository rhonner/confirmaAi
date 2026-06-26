/**
 * Máscara monetária **acumuladora de centavos** (preenche da direita p/ esquerda,
 * padrão BR). Lógica pura (sem React) — testável e reusável pelo `CurrencyInput`.
 *
 * Digitar `5` → `0,05`, `57` → `0,57`, `573` → `5,73`, … até **99.999,99**
 * (7 dígitos). Trabalha em centavos inteiros; a UI converte de/para reais.
 */

/** Teto do campo: 7 dígitos = 99.999,99. */
export const MAX_CENTS = 9_999_999;

/** Centavos → "5.731,28" (pt-BR, 2 casas). Vazio quando 0 (deixa o placeholder). */
export function centsToDisplay(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Extrai os dígitos de um texto e interpreta como centavos (cap em 7 dígitos). */
export function rawToCents(raw: string): number {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  return digits ? parseInt(digits, 10) : 0;
}

/** reais → centavos, clampado em [0, MAX_CENTS]. */
export function valueToCents(value: number | undefined): number {
  if (!value || Number.isNaN(value)) return 0;
  return Math.min(MAX_CENTS, Math.max(0, Math.round(value * 100)));
}

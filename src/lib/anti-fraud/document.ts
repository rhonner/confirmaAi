/**
 * Documento fiscal do **dono da conta** (responsável pela assinatura) — aceita
 * **CPF ou CNPJ**. Decide o tipo pelo nº de dígitos (≤11 → CPF, 12-14 → CNPJ) e
 * delega aos validadores específicos.
 *
 * Por que CPF *ou* CNPJ: o pagamento do sistema (assinatura Pix/cartão via Asaas)
 * usa o campo `cpfCnpj`, que aceita os dois. Clínicas costumam ser PJ (CNPJ),
 * então exigir só CPF travava quem queria pagar com o documento da empresa.
 *
 * ⚠️ NÃO confundir com o CPF do **paciente** (identificador de quota em
 * `cpf-validator.ts` + `identifiers.ts`), que continua sendo só CPF.
 */
import { validateCpf, formatCpf } from "./cpf-validator";
import { validateCnpj, formatCnpj } from "./cnpj-validator";

export type DocumentKind = "CPF" | "CNPJ";

export type DocumentValidationResult =
  | { valid: true; canonical: string; kind: DocumentKind }
  | { valid: false; reason: "format" | "sequential" | "checksum" };

/** Remove qualquer não-dígito. Comum a CPF e CNPJ. */
export function canonicalizeDocument(input: string): string {
  return input.replace(/\D/g, "");
}

/** "CPF" se ≤11 dígitos, senão "CNPJ" (decisão por tamanho dos dígitos). */
export function documentKind(input: string): DocumentKind {
  return canonicalizeDocument(input).length <= 11 ? "CPF" : "CNPJ";
}

/**
 * Valida CPF ou CNPJ (auto-detecta pelo tamanho). Retorna o tipo + canônico
 * (só dígitos) quando válido — útil pra namespacing do hash anti-fraude.
 */
export function validateDocument(
  input: string | null | undefined,
): DocumentValidationResult {
  if (!input) return { valid: false, reason: "format" };
  if (documentKind(input) === "CPF") {
    const r = validateCpf(input);
    return r.valid ? { valid: true, canonical: r.canonical, kind: "CPF" } : r;
  }
  const r = validateCnpj(input);
  return r.valid ? { valid: true, canonical: r.canonical, kind: "CNPJ" } : r;
}

/**
 * Máscara progressiva para o input: formata como CPF quando tem 11 dígitos e
 * como CNPJ quando tem 14; entre os dois (ou abaixo de 11) mostra os dígitos
 * crus. Mantém o padrão "formata quando completo" já usado no campo de CPF.
 * Trunca em 14 dígitos (limite do CNPJ).
 */
export function formatDocument(value: string): string {
  const d = canonicalizeDocument(value).slice(0, 14);
  if (d.length <= 11) return d.length === 11 ? formatCpf(d) : d;
  return d.length === 14 ? formatCnpj(d) : d;
}

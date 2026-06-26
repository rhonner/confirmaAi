import { validateDocument } from "@/lib/anti-fraud/document";

/**
 * Resolve qual CPF usar no checkout, cobrindo o caso de contas grandfathered
 * (pré-Sprint 4) que têm `User.cpf = null`.
 *
 * Contexto do bug (go-live 2026-06-12): o Asaas cria o customer sem CPF mas
 * **rejeita a assinatura** com `400 "preencher o CPF ou CNPJ do cliente"`.
 * Como a falha acontece no `createCheckout` (depois do `createCustomer`),
 * ainda sobra um customer órfão no gateway. A correção exige o CPF ANTES de
 * tocar o provider.
 *
 * - `userCpf` presente → usa o que já está no banco (canônico), sem persistir.
 * - `userCpf` ausente + nenhum CPF informado → `required` (a rota responde
 *   `CPF_REQUIRED` e a UI pede o campo).
 * - `userCpf` ausente + CPF informado → valida (DV módulo 11 + sequenciais);
 *   `ok` com `persist: true` para gravar em `User.cpf/cpfHash`.
 *
 * Pura de propósito (sem I/O) — toda a decisão é testável em unidade.
 */
export type CheckoutCpfResult =
  | { status: "ok"; canonical: string; persist: boolean }
  | { status: "required" }
  | { status: "invalid"; message: string };

export function resolveCheckoutCpf(input: {
  userCpf: string | null | undefined;
  providedCpf?: string | null;
}): CheckoutCpfResult {
  if (input.userCpf && input.userCpf.trim()) {
    // Já temos CPF no cadastro — não reprocessa nem re-grava.
    return { status: "ok", canonical: input.userCpf.replace(/\D/g, ""), persist: false };
  }

  if (!input.providedCpf || !input.providedCpf.trim()) {
    return { status: "required" };
  }

  const v = validateDocument(input.providedCpf);
  if (!v.valid) {
    const message =
      v.reason === "checksum"
        ? "CPF/CNPJ inválido (dígito verificador)"
        : v.reason === "sequential"
          ? "CPF/CNPJ inválido (sequência repetida)"
          : "CPF ou CNPJ inválido (formato)";
    return { status: "invalid", message };
  }

  return { status: "ok", canonical: v.canonical, persist: true };
}

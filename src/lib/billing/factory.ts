import { AsaasProvider } from "./asaas";
import { MockProvider } from "./mock";
import type { BillingProviderImpl } from "./provider";

/**
 * Fábrica de provider. Em produção, sempre Asaas (default). Em dev/test,
 * default Mock — `BILLING_PROVIDER=ASAAS` força o real (útil pra debugar
 * integração em sandbox).
 */
let cached: BillingProviderImpl | null = null;

export function getBillingProvider(): BillingProviderImpl {
  if (cached) return cached;
  const target = (process.env.BILLING_PROVIDER ?? "").toUpperCase();
  if (target === "ASAAS") {
    cached = new AsaasProvider();
    return cached;
  }
  if (target === "MOCK") {
    cached = new MockProvider();
    return cached;
  }
  // Default por NODE_ENV
  if (process.env.NODE_ENV === "production") {
    cached = new AsaasProvider();
  } else {
    cached = new MockProvider();
  }
  return cached;
}

/** Apenas para testes — limpa o singleton. */
export function _resetBillingProviderForTesting() {
  cached = null;
}

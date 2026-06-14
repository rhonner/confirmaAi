import { describe, it, expect } from "vitest";
import {
  buildWelcomeEmail,
  buildPaymentConfirmedEmail,
  buildSubscriptionCanceledEmail,
} from "../../src/lib/emails/transactional";

describe("emails transacionais (builders puros)", () => {
  it("boas-vindas: assunto + nome + CTA pro painel", () => {
    const { subject, html } = buildWelcomeEmail({ name: "Dra. Ana" });
    expect(subject).toMatch(/Bem-vindo/i);
    expect(html).toContain("Dra. Ana");
    expect(html).toContain("/dashboard");
  });

  it("pagamento confirmado: plano + próxima cobrança quando há periodEnd", () => {
    const { subject, html } = buildPaymentConfirmedEmail({
      name: "João",
      planLabel: "Pro",
      periodEndLabel: "14/07/2026",
    });
    expect(subject).toMatch(/Pagamento confirmado/i);
    expect(html).toContain("Pro");
    expect(html).toContain("14/07/2026");
    expect(html).toContain("/billing");
  });

  it("pagamento confirmado: sem periodEnd não quebra (omite a linha)", () => {
    const { html } = buildPaymentConfirmedEmail({ name: "João", planLabel: "Premium" });
    expect(html).toContain("Premium");
    expect(html).not.toMatch(/Próxima cobrança/i);
  });

  it("cancelamento: acesso até a data quando informada", () => {
    const { subject, html } = buildSubscriptionCanceledEmail({
      name: "Maria",
      accessUntilLabel: "05/08/2026",
    });
    expect(subject).toMatch(/cancelada/i);
    expect(html).toContain("Maria");
    expect(html).toContain("05/08/2026");
  });

  it("escapa HTML no nome (anti-injeção)", () => {
    const { html } = buildWelcomeEmail({ name: "<script>x</script>" });
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;script&gt;");
  });
});

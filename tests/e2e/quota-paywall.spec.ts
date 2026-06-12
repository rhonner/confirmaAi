import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Sprint 3 — UX de quota.
 *
 * Esses testes validam **renderização e fluxo de UI** do sistema de paywall.
 * O comportamento end-to-end (criar 5 → 6º bloqueia → reuso) é coberto pelo
 * checklist de backend `npm run test:sprints` que hit o DB diretamente.
 * Aqui o foco é: componentes aparecem onde devem, links levam pros lugares
 * certos, paywall abre.
 */
test.describe("Sprint 3 — UX de quota", () => {
  test("UsageBadge aparece no header das páginas autenticadas", async ({ page }) => {
    await login(page);

    // Pode ser badge Free (com contador) ou Pago (sparkles)
    const badge = page
      .getByTestId("usage-badge")
      .or(page.getByTestId("usage-badge-paid"));
    await expect(badge.first()).toBeVisible();
  });

  test("Página /billing renderiza plano atual e cards comparativos", async ({ page }) => {
    await login(page);
    await page.goto("/billing");

    await expect(page.getByRole("heading", { name: /plano e cobrança/i })).toBeVisible();
    await expect(page.getByTestId("plan-card-FREE")).toBeVisible();
    await expect(page.getByTestId("plan-card-PRO")).toBeVisible();
    await expect(page.getByTestId("plan-card-PREMIUM")).toBeVisible();
  });

  test("Página /precos pública renderiza os 3 planos sem login", async ({ page }) => {
    await page.goto("/precos");

    await expect(page.getByRole("heading", { name: /planos simples/i })).toBeVisible();
    await expect(page.getByTestId("plan-card-FREE")).toBeVisible();
    await expect(page.getByTestId("plan-card-PRO")).toBeVisible();
    await expect(page.getByTestId("plan-card-PREMIUM")).toBeVisible();

    // CTA "Começar grátis" leva para /registro
    await expect(
      page.getByRole("link", { name: /começar grátis/i }).first(),
    ).toHaveAttribute("href", "/registro");
  });

  test("Sidebar tem link para /billing (Plano)", async ({ page }) => {
    await login(page);
    const planLink = page.getByRole("link", { name: /^plano$/i });
    await expect(planLink.first()).toBeVisible();
    await planLink.first().click();
    await page.waitForURL("**/billing");
    expect(page.url()).toContain("/billing");
  });
});

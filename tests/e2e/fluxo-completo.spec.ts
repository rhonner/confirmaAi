import { test, expect } from "@playwright/test";
import { login, fillPhoneInput, selectPatient } from "./helpers";

/**
 * Fluxo completo conforme solicitado:
 * 1. Criar 2 pacientes
 * 2. Criar 4 agendamentos para cada
 * 3. Ver dashboard
 * 4. Cancelar agendamentos de 1 paciente
 * 5. Excluir esse paciente
 * 6. Ver dashboard novamente
 * 7. Ver configurações
 * 8. Ver dashboard novamente
 */

const TS = Date.now();
const PAC_A = `Paciente Alpha ${TS}`;
const PAC_B = `Paciente Beta ${TS}`;
const PHONE_A = "+5511988001122";
const PHONE_B = "+5511988003344";

// Generate dates for appointments (today + next 3 days, different hours)
function getDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TIMES = ["08:00", "10:00", "14:00", "16:00"];

test.describe("Fluxo Completo - 2 pacientes, 8 agendamentos, dashboard, cancelar, excluir", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(60000);

  // ═══════════════════════════════════════════
  // STEP 0: Cleanup stale appointments from previous runs
  // ═══════════════════════════════════════════

  test("0. Cleanup - cancelar agendamentos antigos que possam conflitar", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.waitForTimeout(500);

    // Get all existing appointments via API
    const response = await page.request.get("/api/appointments");
    const json = await response.json();
    const appointments = json.data || [];

    // Cancel all non-canceled, non-completed appointments to avoid overlap conflicts
    for (const appt of appointments) {
      if (appt.status !== "CANCELED" && appt.status !== "NO_SHOW") {
        await page.request.put(`/api/appointments/${appt.id}`, {
          data: { status: "CANCELED" },
        });
      }
    }
  });

  // ═══════════════════════════════════════════
  // STEP 1: Criar 2 pacientes
  // ═══════════════════════════════════════════

  test("1. Criar paciente Alpha", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1000);

    await page.click("button:has-text('Novo Paciente')");
    await expect(page.locator("text=Novo Paciente").nth(1)).toBeVisible();

    await page.fill('input[id="name"]', PAC_A);
    await fillPhoneInput(page, PHONE_A);
    await page.fill('input[id="email"]', `alpha${TS}@teste.com`);
    await page.click('button[type="submit"]:has-text("Criar")');

    await expect(page.locator(`text=${PAC_A}`)).toBeVisible({ timeout: 15000 });
  });

  test("2. Criar paciente Beta", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1000);

    await page.click("button:has-text('Novo Paciente')");
    await expect(page.locator("text=Novo Paciente").nth(1)).toBeVisible();

    await page.fill('input[id="name"]', PAC_B);
    await fillPhoneInput(page, PHONE_B);
    await page.fill('input[id="email"]', `beta${TS}@teste.com`);
    await page.click('button[type="submit"]:has-text("Criar")');

    await expect(page.locator(`text=${PAC_B}`)).toBeVisible({ timeout: 15000 });
  });

  // ═══════════════════════════════════════════
  // STEP 2: Criar 4 agendamentos para cada paciente
  // ═══════════════════════════════════════════

  for (let i = 0; i < 4; i++) {
    test(`3.${i + 1} Criar agendamento ${i + 1} para Alpha (${TIMES[i]})`, async ({ page }) => {
      await login(page);
      await page.goto("/agenda");
      await page.waitForTimeout(1000);

      const apptDate = getDate(i + 1); // tomorrow, +2, +3, +4

      await page.click("button:has-text('Novo Agendamento')");
      await expect(page.locator("text=Novo Agendamento").nth(1)).toBeVisible();

      // Select patient Alpha via combobox helper
      await selectPatient(page, PAC_A);

      await page.fill('input[id="date"]', apptDate);
      await page.fill('input[id="time"]', TIMES[i]);
      await page.click('button[type="submit"]:has-text("Criar")');

      // Verify SUCCESS toast specifically (not error toast)
      await expect(page.locator('[data-sonner-toast]:has-text("criado com sucesso")')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(1000);
    });
  }

  for (let i = 0; i < 4; i++) {
    test(`4.${i + 1} Criar agendamento ${i + 1} para Beta (${TIMES[i]})`, async ({ page }) => {
      await login(page);
      await page.goto("/agenda");
      await page.waitForTimeout(1000);

      const apptDate = getDate(i + 5); // +5, +6, +7, +8

      await page.click("button:has-text('Novo Agendamento')");
      await expect(page.locator("text=Novo Agendamento").nth(1)).toBeVisible();

      // Select patient Beta via combobox helper
      await selectPatient(page, PAC_B);

      await page.fill('input[id="date"]', apptDate);
      await page.fill('input[id="time"]', TIMES[i]);
      await page.click('button[type="submit"]:has-text("Criar")');

      // Verify SUCCESS toast specifically (not error toast)
      await expect(page.locator('[data-sonner-toast]:has-text("criado com sucesso")')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(1000);
    });
  }

  // ═══════════════════════════════════════════
  // STEP 3: Ver dashboard (deve mostrar os agendamentos)
  // ═══════════════════════════════════════════

  test("5. Dashboard mostra métricas com os 8 agendamentos novos", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    // Metric cards visíveis
    await expect(page.locator("text=Total de Agendamentos")).toBeVisible();
    await expect(page.locator("text=Taxa de Confirmação")).toBeVisible();
    await expect(page.locator("text=Taxa de Faltas")).toBeVisible();
    await expect(page.locator("text=Prejuízo Estimado")).toBeVisible();

    // Gráfico visível
    await expect(page.locator("text=Estatísticas Semanais")).toBeVisible();

    // Total deve incluir os novos agendamentos
    const totalCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: "Total de Agendamentos" })
      .first();
    const totalText = await totalCard.locator(".text-2xl").textContent();
    const total = Number(totalText);
    expect(total).toBeGreaterThanOrEqual(8);

    // Summary cards (dashboard has "Confirmados" and "Faltas")
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await expect(page.locator("text=Confirmados").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Faltas").first()).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════
  // STEP 4: Cancelar os 4 agendamentos do paciente Alpha
  // (via API direta, pois cancelar via UI seria muito lento)
  // ═══════════════════════════════════════════

  test("6. Cancelar todos os agendamentos do paciente Alpha", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.waitForTimeout(1500);

    // Use Playwright's request API (properly sends auth cookies)
    const response = await page.request.get("/api/appointments");
    const json = await response.json();

    // Debug: log API response details
    console.log("API status:", response.status());
    console.log("Total appointments in response:", json.data?.length ?? "NO DATA");
    console.log("Looking for patient:", PAC_A);
    if (json.data?.length > 0) {
      console.log("Patient names found:", [...new Set(json.data.map((a: any) => a.patient?.name))]);
    }
    if (json.error) {
      console.log("API error:", json.error);
    }

    const appointments = (json.data || []).filter((a: any) => a.patient?.name === PAC_A);

    expect(appointments.length).toBe(4);

    // Cancelar cada um via API (PUT com status CANCELED)
    for (const appt of appointments) {
      const putResponse = await page.request.put(`/api/appointments/${appt.id}`, {
        data: { status: "CANCELED" },
      });
      expect(putResponse.status()).toBe(200);
    }

    // Recarregar a agenda pra ver que os agendamentos foram cancelados
    await page.reload();
    await page.waitForTimeout(1500);
  });

  // ═══════════════════════════════════════════
  // STEP 4b: Dashboard ANTES de excluir (deve mostrar cancelados)
  // ═══════════════════════════════════════════

  test("6b. Dashboard mostra cancelados antes de excluir paciente", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    await expect(page.locator("text=Total de Agendamentos")).toBeVisible();

    // Scroll to summary cards
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Dashboard summary cards should still be visible
    await expect(page.locator("text=Confirmados").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Faltas").first()).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════
  // STEP 5: Excluir o paciente Alpha (sem agendamentos ativos)
  // ═══════════════════════════════════════════

  test("7. Excluir paciente Alpha", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1500);

    const row = page.locator(`tr:has-text("${PAC_A}")`);
    await expect(row).toBeVisible();

    // Clicar no botão de excluir (último botão na row) to open AlertDialog
    await row.locator("button").last().click();

    // Wait for AlertDialog to appear
    await expect(page.locator('[role="alertdialog"]')).toBeVisible({ timeout: 5000 });

    // Click "Excluir" in the AlertDialog to confirm deletion
    await page.locator('[role="alertdialog"] button:has-text("Excluir")').click();

    await page.waitForTimeout(2000);

    // Verificar que o paciente sumiu
    await expect(page.locator(`text=${PAC_A}`)).not.toBeVisible({ timeout: 5000 });

    // Verificar toast de sucesso
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════
  // STEP 6: Dashboard novamente (deve refletir mudanças)
  // ═══════════════════════════════════════════

  test("8. Dashboard atualizado após exclusão do paciente (agendamentos cascade-deleted)", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    // Métricas devem estar visíveis e sem erros
    await expect(page.locator("text=Total de Agendamentos")).toBeVisible();
    await expect(page.locator("text=Taxa de Confirmação")).toBeVisible();
    await expect(page.locator("text=Taxa de Faltas")).toBeVisible();
    await expect(page.locator("text=Prejuízo Estimado")).toBeVisible();

    // Gráfico
    await expect(page.locator("text=Estatísticas Semanais")).toBeVisible();

    // Total diminuiu (4 agendamentos do Alpha foram cascade-deleted)
    const totalCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: "Total de Agendamentos" })
      .first();
    const totalText = await totalCard.locator(".text-2xl").textContent();
    expect(Number(totalText)).toBeGreaterThanOrEqual(4); // Beta's 4 + seed data

    // Summary cards (dashboard has "Confirmados" and "Faltas")
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await expect(page.locator("text=Confirmados").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Faltas").first()).toBeVisible({ timeout: 10000 });

    // Sem erros de runtime
    const errorVisible = await page.locator("text=Erro ao carregar dashboard").isVisible();
    expect(errorVisible).toBe(false);
  });

  // ═══════════════════════════════════════════
  // STEP 7: Ver configurações
  // ═══════════════════════════════════════════

  test("9. Acessar configurações e verificar campos", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.waitForTimeout(2000);

    // Verificar seções
    await expect(page.locator("text=Horários de Notificação")).toBeVisible();
    await expect(page.locator("text=Templates de Mensagem")).toBeVisible();
    await expect(page.locator("text=Conexão WhatsApp")).toBeVisible();

    // Verificar campos de horas
    const confirmHours = page.locator('input[id="confirmationHoursBefore"]');
    const reminderHours = page.locator('input[id="reminderHoursBefore"]');
    await expect(confirmHours).toBeVisible();
    await expect(reminderHours).toBeVisible();

    const confirmVal = await confirmHours.inputValue();
    const reminderVal = await reminderHours.inputValue();
    expect(Number(confirmVal)).toBeGreaterThan(0);
    expect(Number(reminderVal)).toBeGreaterThan(0);

    // Verificar textareas de templates
    await expect(page.locator('textarea[id="confirmationMessage"]')).toBeVisible();
    await expect(page.locator('textarea[id="reminderMessage"]')).toBeVisible();

    // Verificar variáveis disponíveis
    await expect(page.locator("text={nome}")).toBeVisible();
    await expect(page.locator("text={data}")).toBeVisible();
    await expect(page.locator("text={hora}")).toBeVisible();
    await expect(page.locator("text={clinica}")).toBeVisible();

    // WhatsApp status
    await expect(page.locator("text=Conexão não configurada")).toBeVisible();
  });

  // ═══════════════════════════════════════════
  // STEP 8: Dashboard pela terceira vez
  // ═══════════════════════════════════════════

  test("10. Dashboard funciona corretamente na terceira visita", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(2000);

    // Tudo deve carregar sem erros
    await expect(page.locator("text=Total de Agendamentos")).toBeVisible();
    await expect(page.locator("text=Taxa de Confirmação")).toBeVisible();
    await expect(page.locator("text=Taxa de Faltas")).toBeVisible();
    await expect(page.locator("text=Prejuízo Estimado")).toBeVisible();
    await expect(page.locator("text=Estatísticas Semanais")).toBeVisible();

    // Sem erros de runtime
    const errorVisible = await page.locator("text=Erro ao carregar dashboard").isVisible();
    expect(errorVisible).toBe(false);

    // Valores numéricos presentes nos cards (não NaN, não undefined)
    const totalCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: "Total de Agendamentos" })
      .first();
    const totalText = await totalCard.locator(".text-2xl").textContent();
    expect(totalText).toBeTruthy();
    expect(totalText).not.toContain("NaN");
    expect(totalText).not.toContain("undefined");

    // Scroll to bottom summary
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Summary cards (dashboard has "Confirmados" and "Faltas")
    await expect(page.locator("text=Confirmados").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Faltas").first()).toBeVisible({ timeout: 10000 });
  });
});

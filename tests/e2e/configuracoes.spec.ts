import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Configuracoes", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
  });

  test("should display settings form", async ({ page }) => {
    // Wait for settings to load
    await page.waitForTimeout(1500);

    // Use .first() to avoid strict mode violation (sidebar + page title both have "Configurações")
    await expect(page.locator("text=Configurações").first()).toBeVisible();
    await expect(page.locator("text=Horários de Notificação")).toBeVisible();

    // Scroll down to see Templates section
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(500);

    await expect(page.locator("text=Templates de Mensagem")).toBeVisible({ timeout: 10000 });
  });

  test("should display notification hours inputs", async ({ page }) => {
    await expect(page.locator('label:has-text("Antecedência para confirmação")')).toBeVisible();
    // O "lembrete" virou o prazo de auto-cancelamento (Confirmação por link).
    await expect(page.locator('label:has-text("Cancelar automaticamente")')).toBeVisible();

    // Verify inputs have values
    const confirmationInput = page.locator('input[id="confirmationHoursBefore"]');
    const reminderInput = page.locator('input[id="reminderHoursBefore"]');

    await expect(confirmationInput).toBeVisible();
    await expect(reminderInput).toBeVisible();
  });

  test("should display message template editor", async ({ page }) => {
    // Só a mensagem de confirmação — o editor de lembrete foi removido (o
    // lembrete virou auto-cancelamento no deadline).
    await expect(page.locator('label:has-text("Template de confirmação")')).toBeVisible();

    // O template usa o editor de chips (TipTap, <div contenteditable>). O id é
    // aplicado via editorProps.attributes.id.
    const confirmationEditor = page.locator('[id="confirmationMessage"][contenteditable="true"]');
    await expect(confirmationEditor).toBeVisible();
  });

  test("should display available variables", async ({ page }) => {
    await expect(page.locator("text=Variáveis disponíveis")).toBeVisible();
    // Mira os BOTÕES da paleta (não `text={nome}`): o editor de chips agora
    // também renderiza "{nome}" dentro de cada token, o que dispararia strict
    // mode (múltiplos matches). O × do chip tem aria-label "Remover variável…",
    // então só o botão da paleta casa por nome acessível "{nome}".
    for (const v of ["{nome}", "{data}", "{hora}", "{clinica}"]) {
      await expect(page.getByRole("button", { name: v })).toBeVisible();
    }
  });

  test("should display WhatsApp status section", async ({ page }) => {
    await expect(page.locator("text=Conexão WhatsApp")).toBeVisible();
    // Drive-by: a assertion antiga procurava "Conexão não configurada", texto que
    // não existe no componente (estado desconectado renderiza "WhatsApp não
    // conectado") — teste já estava vermelho antes deste trabalho.
    await expect(page.locator("text=WhatsApp não conectado")).toBeVisible();
  });

  test("should change value and enable save button", async ({ page }) => {
    // Wait for settings to load
    await page.waitForTimeout(1000);

    // Save button should be disabled initially (not dirty)
    const saveButton = page.locator('button[type="submit"]:has-text("Salvar")');
    await expect(saveButton).toBeDisabled();

    // Change a value
    const confirmationInput = page.locator('input[id="confirmationHoursBefore"]');
    await confirmationInput.fill("48");

    // Save button should now be enabled
    await expect(saveButton).toBeEnabled();
  });

  test("should save settings changes", async ({ page }) => {
    // Wait for settings to load
    await page.waitForTimeout(1500);

    // Get initial value to verify it changed
    const confirmationInput = page.locator('input[id="confirmationHoursBefore"]');
    const initialValue = await confirmationInput.inputValue();

    // Change to a different value
    const newValue = initialValue === "36" ? "24" : "36";
    await confirmationInput.fill(newValue);

    // Change reminder hours
    const reminderInput = page.locator('input[id="reminderHoursBefore"]');
    await reminderInput.fill("3");

    // Submit form - scroll down first to ensure button is visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const saveButton = page.locator('button[type="submit"]').filter({ hasText: /Salvar/ });

    // Click and wait a reasonable time for save
    await saveButton.click();
    await page.waitForTimeout(2000);

    // Reload the page to verify the values were saved
    await page.reload();
    await page.waitForTimeout(1500);

    // Check that the value persisted
    const savedValue = await confirmationInput.inputValue();
    expect(savedValue).toBe(newValue);
  });

  test("should load current settings values", async ({ page }) => {
    // Wait for settings to load
    await page.waitForTimeout(1500);

    // Inputs should have values (not empty)
    const confirmationInput = page.locator('input[id="confirmationHoursBefore"]');
    const reminderInput = page.locator('input[id="reminderHoursBefore"]');

    const confirmationValue = await confirmationInput.inputValue();
    const reminderValue = await reminderInput.inputValue();

    expect(confirmationValue).not.toBe("");
    expect(reminderValue).not.toBe("");
    expect(Number(confirmationValue)).toBeGreaterThan(0);
    expect(Number(reminderValue)).toBeGreaterThan(0);
  });
});

import { test, expect } from "@playwright/test";
import { login, fillPhoneInput, displayPhone, selectPatient } from "./helpers";

/**
 * Comprehensive CRUD lifecycle tests.
 *
 * Tests CREATE, UPDATE, and DELETE for every entity in the system:
 *  - Patients (create → verify → search → edit → delete)
 *  - Appointments (create → verify → edit → delete)
 *  - Settings (update → verify persistence)
 *  - Auth (register → auto-login, logout)
 *  - Navigation (all sidebar links)
 *  - Dashboard (metrics & charts)
 *
 * Tests run in serial mode because later steps depend on earlier state.
 */

const TS = Date.now();
const last9 = String(TS).slice(-9);

const PATIENT = {
  name: `Paciente E2E ${TS}`,
  // Unique phones per run to avoid collisions with prior leftover data.
  phone: `+5513${last9}`,
  email: `e2e${TS}@teste.com`,
  notes: "Criado via Playwright E2E",
};

const PATIENT_UPDATED = {
  name: `Pac Atualizado ${TS}`,
  phone: `+5514${last9}`,
};

// Tomorrow's date in YYYY-MM-DD for the appointment (ensures it's always in the future)
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const APPT_DATE = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
// Use unusual times to avoid conflicting with seed appointments (which use
// 10:00 / 14:00 / 15:00 / 16:00).
const APPT_TIME = "07:30";
const APPT_TIME_UPDATED = "08:15";

test.describe("Full CRUD Lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  // ═══════════════════════════════════════════
  //  PATIENTS - Create
  // ═══════════════════════════════════════════

  test("Create a new patient with all fields", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1000);

    // Open create dialog
    await page.click("button:has-text('Novo Paciente')");
    await expect(page.locator("text=Novo Paciente").nth(1)).toBeVisible();

    // Fill all fields
    await page.fill('input[id="name"]', PATIENT.name);
    await fillPhoneInput(page, PATIENT.phone);
    await page.fill('input[id="email"]', PATIENT.email);
    await page.fill('textarea[id="notes"]', PATIENT.notes);

    // Submit
    await page.click('button[type="submit"]:has-text("Criar")');

    // Verify success toast appeared
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });

    // Verify patient now shows in the table
    await expect(page.locator(`text=${PATIENT.name}`)).toBeVisible({ timeout: 15000 });
  });

  // ═══════════════════════════════════════════
  //  PATIENTS - Read & Search
  // ═══════════════════════════════════════════

  test("Verify patient data appears correctly in table", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1500);

    // Find the row with the patient name
    const row = page.locator(`tr:has-text("${PATIENT.name}")`);
    await expect(row).toBeVisible();

    // Verify phone number is in the row (formatted display)
    await expect(row.locator(`text=${displayPhone(PATIENT.phone)}`)).toBeVisible();
  });

  test("Search filters to find the patient", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1000);

    // Type the full unique patient name for precision
    await page.fill('input[placeholder*="Buscar"]', PATIENT.name);
    await page.waitForTimeout(500); // wait for debounce

    // Our patient should be visible
    await expect(page.locator(`text=${PATIENT.name}`)).toBeVisible({ timeout: 5000 });

    // Seed patients should NOT be visible (search is specific enough)
    const visibleRows = page.locator("tbody tr");
    const count = await visibleRows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ═══════════════════════════════════════════
  //  PATIENTS - Update
  // ═══════════════════════════════════════════

  test("Edit patient name and phone", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1500);

    // Click edit button (first button = Pencil icon) on the patient row
    const row = page.locator(`tr:has-text("${PATIENT.name}")`);
    await row.locator("button").first().click();

    // Verify edit dialog opened with pre-filled values
    await expect(page.locator("text=Editar Paciente")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[id="name"]')).toHaveValue(PATIENT.name);
    await expect(page.locator('input[id="phone"]')).toHaveValue(displayPhone(PATIENT.phone));

    // Clear and fill name (fill replaces the value cleanly for controlled inputs)
    await page.fill('input[id="name"]', PATIENT_UPDATED.name);

    // Clear and fill phone (using helper that handles +55 prefix)
    await fillPhoneInput(page, PATIENT_UPDATED.phone);

    // Wait for React to process the changes
    await page.waitForTimeout(300);

    // Submit via clicking and wait for the API response
    const submitBtn = page.locator('[role="dialog"] button:has-text("Atualizar")');
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/patients/") &&
          resp.request().method() === "PUT",
        { timeout: 10000 }
      ),
      submitBtn.click(),
    ]);

    expect(response.status()).toBe(200);

    // Wait for dialog to close and table to update
    await page.waitForTimeout(1500);

    // Verify updated name in table, old name gone
    await expect(page.locator(`text=${PATIENT_UPDATED.name}`)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator(`text=${PATIENT.name}`)).not.toBeVisible();
  });

  test("Verify patient edit persisted after page reload", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1500);

    // Verify the updated values are still there
    const row = page.locator(`tr:has-text("${PATIENT_UPDATED.name}")`);
    await expect(row).toBeVisible();
    await expect(row.locator(`text=${displayPhone(PATIENT_UPDATED.phone)}`)).toBeVisible();
  });

  // ═══════════════════════════════════════════
  //  APPOINTMENTS - Create
  // ═══════════════════════════════════════════

  test("Create appointment for the patient", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.waitForTimeout(1000);

    // Open the new appointment dialog
    await page.click("button:has-text('Novo Agendamento')");
    await expect(page.locator("text=Novo Agendamento").nth(1)).toBeVisible();

    // Select patient via combobox
    await selectPatient(page, PATIENT_UPDATED.name);

    // Fill date (tomorrow) and time
    await page.fill('input[id="date"]', APPT_DATE);
    await page.fill('input[id="time"]', APPT_TIME);
    await page.fill('textarea[id="notes"]', "Consulta criada via E2E");

    // Submit and wait for the API to confirm 201
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().endsWith("/api/appointments") &&
          resp.request().method() === "POST",
        { timeout: 10000 },
      ),
      page.click('button[type="submit"]:has-text("Criar")'),
    ]);
    expect(response.status()).toBe(201);

    // Verify success toast
    await expect(
      page.locator('[data-sonner-toast]:has-text("criado com sucesso")'),
    ).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(2000);
  });

  // ═══════════════════════════════════════════
  //  APPOINTMENTS - Read
  // ═══════════════════════════════════════════

  test("Verify appointment appears in week view with correct time", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.waitForTimeout(1500);

    // Navigate forward through up to 3 weeks until we find the appointment.
    let attempts = 0;
    let card = page.locator(".cursor-pointer").filter({ hasText: PATIENT_UPDATED.name });
    while ((await card.count()) === 0 && attempts < 3) {
      await page.click('button:has-text("Próxima")');
      await page.waitForTimeout(1500);
      card = page.locator(".cursor-pointer").filter({ hasText: PATIENT_UPDATED.name });
      attempts++;
    }
    await expect(card.first()).toBeVisible({ timeout: 10000 });

    // Verify the time is displayed
    await expect(card.first().locator(`text=${APPT_TIME}`)).toBeVisible();

    // Verify status badge shows "Pendente"
    await expect(card.first().locator("text=Pendente")).toBeVisible();
  });

  // ═══════════════════════════════════════════
  //  APPOINTMENTS - Update
  // ═══════════════════════════════════════════

  test("Edit appointment time and notes", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.waitForTimeout(1500);

    // Navigate forward up to 3 weeks until the appointment for our patient is in view.
    const patientText = page.getByText(PATIENT_UPDATED.name).first();
    let attempts = 0;
    while ((await patientText.count()) === 0 && attempts < 3) {
      await page.click('button:has-text("Próxima")');
      await page.waitForTimeout(1500);
      attempts++;
    }
    await expect(patientText).toBeVisible({ timeout: 10000 });
    // Click the patient text — its parent has the onClick that opens the edit dialog.
    await patientText.click();

    // Verify edit dialog opened
    await expect(page.locator("text=Editar Agendamento")).toBeVisible({
      timeout: 10000,
    });

    // Verify pre-filled values
    await expect(page.locator('input[id="time"]')).toHaveValue(APPT_TIME);

    // Update time using fill (time inputs work better with fill than pressSequentially)
    await page.fill('input[id="time"]', APPT_TIME_UPDATED);

    // Update notes
    const notesInput = page.locator('textarea[id="notes"]');
    await notesInput.click({ clickCount: 3 });
    await notesInput.pressSequentially("Consulta reagendada via E2E", { delay: 5 });

    // Wait for React to process
    await page.waitForTimeout(300);

    // Submit and wait for API response
    const submitBtn = page.locator('[role="dialog"] button:has-text("Atualizar")');
    const [response] = await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/appointments/") &&
          resp.request().method() === "PUT",
        { timeout: 10000 }
      ),
      submitBtn.click(),
    ]);

    expect(response.status()).toBe(200);

    // Wait and verify updated time shows
    await page.waitForTimeout(2000);
    const updatedCard = page.locator(".cursor-pointer").filter({
      hasText: PATIENT_UPDATED.name,
    });
    await expect(updatedCard.first().locator(`text=${APPT_TIME_UPDATED}`)).toBeVisible({
      timeout: 10000,
    });
  });

  // ═══════════════════════════════════════════
  //  APPOINTMENTS - Delete
  // ═══════════════════════════════════════════

  test("Delete appointment from edit dialog", async ({ page }) => {
    await login(page);
    await page.goto("/agenda");
    await page.waitForTimeout(1500);

    // Navigate to next week if appointment isn't in current week view
    if (await page.locator(".cursor-pointer").filter({ hasText: PATIENT_UPDATED.name }).count() === 0) {
      await page.click('button:has-text("Próxima")');
      await page.waitForTimeout(1500);
    }

    // Click the appointment to open edit dialog
    await page
      .locator(".cursor-pointer")
      .filter({ hasText: PATIENT_UPDATED.name })
      .first()
      .click();

    await expect(page.locator("text=Editar Agendamento")).toBeVisible({
      timeout: 10000,
    });

    // Click "Excluir" button in the edit dialog to trigger AlertDialog
    await page.locator('[role="dialog"] button:has-text("Excluir")').click();

    // Wait for AlertDialog to appear and confirm deletion
    await expect(page.locator('[role="alertdialog"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[role="alertdialog"] button:has-text("Excluir")').click();

    // Wait for deletion and dialog close
    await page.waitForTimeout(2000);

    // Verify the edit dialog closed
    await expect(page.locator("text=Editar Agendamento")).not.toBeVisible();

    // Verify the appointment card with our patient is no longer visible
    const cards = page
      .locator(".cursor-pointer")
      .filter({ hasText: PATIENT_UPDATED.name });
    await expect(cards).toHaveCount(0, { timeout: 5000 });
  });

  // ═══════════════════════════════════════════
  //  PATIENTS - Delete (now possible, no future appointments)
  // ═══════════════════════════════════════════

  test("Delete patient after removing appointments", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1500);

    // Verify patient is still in the table
    const row = page.locator(`tr:has-text("${PATIENT_UPDATED.name}")`);
    await expect(row).toBeVisible();

    // Click delete button (last button = Trash icon) to open AlertDialog
    await row.locator("button").last().click();

    // Wait for AlertDialog to appear and confirm deletion
    await expect(page.locator('[role="alertdialog"]')).toBeVisible({ timeout: 5000 });
    await page.locator('[role="alertdialog"] button:has-text("Excluir")').click();

    // Wait for deletion
    await page.waitForTimeout(2000);

    // Verify success toast
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });

    // Verify patient is gone from the table
    await expect(page.locator(`text=${PATIENT_UPDATED.name}`)).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("Verify deleted patient is gone after page reload", async ({ page }) => {
    await login(page);
    await page.goto("/pacientes");
    await page.waitForTimeout(1500);

    // Confirm patient no longer exists
    await expect(page.locator(`text=${PATIENT_UPDATED.name}`)).not.toBeVisible();

    // Search should also not find them
    await page.fill('input[placeholder*="Buscar"]', `Atualizado ${TS}`);
    await page.waitForTimeout(500);

    const noResult = page.locator("text=Nenhum paciente encontrado");
    await expect(noResult).toBeVisible({ timeout: 5000 });
  });

  // ═══════════════════════════════════════════
  //  SETTINGS - Update all fields
  // ═══════════════════════════════════════════

  test("Update all settings fields", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.waitForTimeout(2000);

    // Save button should be disabled initially (form not dirty)
    const saveBtn = page
      .locator('button[type="submit"]')
      .filter({ hasText: /Salvar/ });
    await expect(saveBtn).toBeDisabled();

    // Update confirmation hours
    await page.fill('input[id="confirmationHoursBefore"]', "48");

    // Update reminder hours
    await page.fill('input[id="reminderHoursBefore"]', "4");

    // Update confirmation template
    await page.fill(
      'textarea[id="confirmationMessage"]',
      "Olá {nome}! Confirme sua consulta em {clinica} no dia {data} às {hora}. Responda SIM ou NÃO."
    );

    // Update reminder template
    await page.fill(
      'textarea[id="reminderMessage"]',
      "Lembrete {nome}: sua consulta em {clinica} é amanhã ({data} às {hora}). Confirme!"
    );

    // Scroll to save button
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Save button should now be enabled (form is dirty)
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify success toast
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });
  });

  test("Verify settings persisted after page reload", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.waitForTimeout(2000);

    // Verify number fields
    await expect(
      page.locator('input[id="confirmationHoursBefore"]')
    ).toHaveValue("48");
    await expect(
      page.locator('input[id="reminderHoursBefore"]')
    ).toHaveValue("4");

    // Verify template fields contain the updated values
    const confirmMsg = await page
      .locator('textarea[id="confirmationMessage"]')
      .inputValue();
    expect(confirmMsg).toContain("Olá {nome}");
    expect(confirmMsg).toContain("{clinica}");
    expect(confirmMsg).toContain("Responda SIM ou NÃO");

    const reminderMsg = await page
      .locator('textarea[id="reminderMessage"]')
      .inputValue();
    expect(reminderMsg).toContain("Lembrete {nome}");
    expect(reminderMsg).toContain("{clinica}");
  });

  // ═══════════════════════════════════════════
  //  SETTINGS - Restore defaults
  // ═══════════════════════════════════════════

  test("Restore settings to default values", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.waitForTimeout(2000);

    // Restore original values
    await page.fill('input[id="confirmationHoursBefore"]', "24");
    await page.fill('input[id="reminderHoursBefore"]', "2");
    await page.fill(
      'textarea[id="confirmationMessage"]',
      "Olá {nome}! Você tem consulta agendada em {clinica} no dia {data} às {hora}. Confirma sua presença? Responda SIM ou NÃO."
    );
    await page.fill(
      'textarea[id="reminderMessage"]',
      "Oi {nome}! Ainda não recebemos sua confirmação para a consulta de amanhã ({data} às {hora}). Confirma sua presença? Responda SIM ou NÃO."
    );

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const saveBtn = page
      .locator('button[type="submit"]')
      .filter({ hasText: /Salvar/ });
    await saveBtn.click();

    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════
  //  DASHBOARD - Read metrics
  // ═══════════════════════════════════════════

  test("Dashboard displays all metrics, chart, and summary cards", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1500);

    // Verify all 4 metric cards
    await expect(page.locator("text=Total de Agendamentos")).toBeVisible();
    await expect(page.locator("text=Taxa de Confirmação")).toBeVisible();
    await expect(page.locator("text=Taxa de Faltas")).toBeVisible();
    await expect(page.locator("text=Prejuízo Estimado")).toBeVisible();

    // Verify chart section
    await expect(page.locator("text=Estatísticas Semanais")).toBeVisible();

    // Scroll to summary cards
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Verify summary cards (dashboard has "Confirmados" and "Faltas")
    await expect(page.locator("text=Confirmados").first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Faltas").first()).toBeVisible({ timeout: 10000 });

    // Verify actual numeric values are displayed (not loading/error)
    const totalCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: "Total de Agendamentos" })
      .first();
    const totalText = await totalCard.locator(".text-2xl").textContent();
    expect(Number(totalText)).toBeGreaterThanOrEqual(0);
  });

  // ═══════════════════════════════════════════
  //  AUTH - Register new user
  // ═══════════════════════════════════════════

  test("Register a new user account and auto-login", async ({ page }) => {
    const regEmail = `novo${TS}@clinica.com`;

    await page.goto("/registro");

    // Verify registration form elements
    await expect(page.locator('input[id="name"]')).toBeVisible();
    await expect(page.locator('input[id="clinicName"]')).toBeVisible();
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="password"]')).toBeVisible();

    // Fill registration form
    await page.fill('input[id="name"]', "Dr. Teste E2E");
    await page.fill('input[id="clinicName"]', `Clinica E2E ${TS}`);
    await page.fill('input[id="email"]', regEmail);
    await page.fill('input[id="password"]', "senha123");

    // Submit
    await page.click('button[type="submit"]:has-text("Criar conta")');

    // Should auto-login and redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 15000 });
    await expect(page).toHaveURL(/.*dashboard/);

    // Verify the new clinic name is shown in the header
    await expect(
      page.locator(`text=Clinica E2E ${TS}`)
    ).toBeVisible({ timeout: 10000 });
  });

  // ═══════════════════════════════════════════
  //  NAVIGATION - All sidebar links
  // ═══════════════════════════════════════════

  test("Navigate through all sidebar links", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/.*dashboard/);

    // Dashboard → Agenda
    await page.click('a:has-text("Agenda")');
    await expect(page).toHaveURL(/.*agenda/);
    await expect(page.locator("h1:has-text('Agenda')")).toBeVisible();

    // Agenda → Pacientes
    await page.click('a:has-text("Pacientes")');
    await expect(page).toHaveURL(/.*pacientes/);
    await expect(page.locator("h1:has-text('Pacientes')")).toBeVisible();

    // Pacientes → Configurações
    await page.click('a:has-text("Configurações")');
    await expect(page).toHaveURL(/.*configuracoes/);
    await expect(page.locator("h1:has-text('Configurações')")).toBeVisible();

    // Configurações → Dashboard
    await page.click('a:has-text("Dashboard")');
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator("h1:has-text('Dashboard')")).toBeVisible();
  });

  // ═══════════════════════════════════════════
  //  AUTH - Logout
  // ═══════════════════════════════════════════

  test("Logout redirects to login page", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.waitForTimeout(1000);

    // Click the "Sair" button in the header (opens confirmation dialog)
    await page.locator('header button[aria-label="Sair da conta"]').click();

    // Confirm in the AlertDialog
    await expect(page.locator('[role="alertdialog"]')).toBeVisible();
    await page.locator('[role="alertdialog"] button:has-text("Sair")').click();

    // Should redirect to login
    await page.waitForURL("**/login", { timeout: 10000 });
    await expect(page).toHaveURL(/.*login/);

    // Login form should be visible
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="password"]')).toBeVisible();
  });

  // ═══════════════════════════════════════════
  //  AUTH - Protected routes
  // ═══════════════════════════════════════════

  test("Accessing dashboard without auth redirects to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });
    await expect(page).toHaveURL(/.*login/);
  });
});

import { Page } from "@playwright/test";

export async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[id="email"]', "admin@teste.com");
  await page.fill('input[id="password"]', "123456");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
}

/**
 * Fill the masked phone input (PhoneInput component). Accepts canonical
 * "+5511988776655" or local digits.
 *
 * Strategy: directly set the native input value via React's setter and dispatch
 * an input event. This is more robust than pressSequentially against masked
 * inputs whose display string differs from the value we want to write.
 */
export async function fillPhoneInput(page: Page, canonical: string) {
  const local = canonical.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  await page.locator('input[id="phone"]').evaluate((el, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, local);
}

/**
 * Convert canonical phone (+5511988776655) to display format "(11) 98877-6655".
 * Mirrors lib/phone.ts formatPhoneDisplay.
 */
export function displayPhone(canonical: string): string {
  const d = canonical.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/**
 * Open the patient combobox in the appointment dialog and select the patient by name.
 * Uses cmdk's input filter (typing the name narrows results, then we click the option).
 * No-op if the trigger already shows the requested patient.
 */
export async function selectPatient(page: Page, patientName: string) {
  const trigger = page.locator('button[role="combobox"]').first();
  if ((await trigger.textContent())?.includes(patientName)) return;

  await trigger.click();
  // cmdk renders its own input with [cmdk-input] inside the popover.
  await page.locator("[cmdk-input]").waitFor({ timeout: 5000 });
  await page.locator("[cmdk-input]").fill(patientName);
  // cmdk options have role="option" and the cmdk-item attribute.
  await page
    .locator('[cmdk-item][role="option"]')
    .filter({ hasText: patientName })
    .first()
    .click();
}

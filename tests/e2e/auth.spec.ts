import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should render login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[id="email"]')).toBeVisible();
    await expect(page.locator('input[id="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test("should show error with invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[id="email"]', "invalid@test.com");
    await page.fill('input[id="password"]', "wrongpassword");
    await page.click('button[type="submit"]');

    // Wait for sonner toast with error message
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Email ou senha incorretos")).toBeVisible({ timeout: 10000 });
  });

  test("should login with valid credentials and redirect to dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[id="email"]', "rhonner.matheus@gmail.com");
    await page.fill('input[id="password"]', "123456");
    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await page.waitForURL("**/dashboard", { timeout: 10000 });
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test("should redirect to login when accessing dashboard without auth", async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();

    // Try to access dashboard
    await page.goto("/dashboard");

    // Should redirect to login
    await page.waitForURL("**/login", { timeout: 10000 });
    await expect(page).toHaveURL(/.*login/);
  });
});

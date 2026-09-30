import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Authentication", () => {
  test("logs in and stores the session", async ({ page }) => {
    await login(page);
    await expect(page.locator('[data-testid="page-title"]')).toHaveText("Dashboard");
    const token = await page.evaluate(() => localStorage.getItem("auth_token"));
    const refresh = await page.evaluate(() => localStorage.getItem("auth_refresh_token"));
    expect(token).toBeTruthy();
    expect(refresh).toBeTruthy();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/");
    await page.fill('[data-testid="input-username"]', "admin");
    await page.fill('[data-testid="input-password"]', "wrong-password");
    await page.click('[data-testid="login-button"]');
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });

  test("keeps the session across reloads and logs out", async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page.locator('[data-testid="page-title"]')).toHaveText("Dashboard");
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
  });
});

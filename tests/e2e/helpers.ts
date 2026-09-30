import { expect, type Page } from "@playwright/test";

export async function login(page: Page, username = "admin", password = "admin") {
  await page.goto("/");
  await page.fill('[data-testid="input-username"]', username);
  await page.fill('[data-testid="input-password"]', password);
  await page.click('[data-testid="login-button"]');
  await expect(page.locator('[data-testid="page-title"]')).toBeVisible();
}

import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Server management", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("adds a server, shows its key once, then deletes it", async ({ page }) => {
    const name = `e2e-${Date.now()}`;
    await page.click('[data-testid="nav-servers"]');
    await page.click('[data-testid="add-server"]');
    await page.fill('[data-testid="input-server-name"]', name);
    await page.fill('[data-testid="input-server-tags"]', "e2e, test");
    await page.click('[data-testid="submit-server"]');

    await expect(page.locator('[data-testid="install-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="server-api-key"]')).toHaveText(/^gpm_/);
    await page.click('[data-testid="close-install-dialog"]');

    const row = page.locator(`[data-testid="server-row-${name}"]`);
    await expect(row).toContainText("Waiting for data");

    await page.click(`[data-testid="server-actions-${name}"]`);
    await page.click(`[data-testid="delete-server-${name}"]`);
    await page.click('[data-testid="confirm-delete"]');
    await expect(row).toHaveCount(0);
  });
});

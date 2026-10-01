import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Maintenance windows", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("schedules maintenance for a server and ends it", async ({ page }) => {
    await page.locator('[data-testid^="server-card-"]').first().click();
    await expect(page.locator('[data-testid="gpu-details-table"]')).toBeVisible();

    await page.click('[data-testid="schedule-maintenance"]');
    await page.fill('[data-testid="maintenance-reason"]', "e2e driver upgrade");
    await page.click('[data-testid="submit-maintenance"]');
    await expect(page.locator('[data-testid="maintenance-banner"]')).toContainText("e2e driver upgrade");
    await expect(page.locator('[data-testid="status-badge"]').first()).toHaveText(/Maintenance/);

    await page.goto("/settings?tab=maintenance");
    const row = page.locator('[data-testid^="maintenance-"]', { hasText: "e2e driver upgrade" }).first();
    await expect(row).toContainText("active");
    await row.getByRole("button", { name: "End now" }).click();
    await expect(page.locator('[data-testid^="maintenance-"]', { hasText: "e2e driver upgrade" })).toHaveCount(0);
  });

  test("shows GPU processes and health on the server page", async ({ page }) => {
    await page.locator('[data-testid^="server-card-sim-"]').first().click();
    await expect(page.locator('[data-testid="processes-table"]')).toBeVisible();
  });
});

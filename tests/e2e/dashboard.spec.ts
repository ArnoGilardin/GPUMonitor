import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("shows fleet statistics", async ({ page }) => {
    for (const id of ["stat-online", "stat-total-gpus", "stat-avg-gpu-util", "stat-total-power", "stat-critical-alerts"]) {
      await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
    await expect(page.locator('[data-testid="stat-avg-gpu-util"]')).toHaveText(/\d+%/);
  });

  test("lists servers and filters them", async ({ page }) => {
    await expect(page.locator('[data-testid="section-servers"]')).toBeVisible();
    const cards = page.locator('[data-testid^="server-card-"]');
    await expect(cards.first()).toBeVisible();
    await page.click('[data-testid="filter-offline"]');
    await page.click('[data-testid="filter-all"]');
    await expect(cards.first()).toBeVisible();
  });

  test("searches from the header", async ({ page }) => {
    await page.fill('[data-testid="search-input"]', "zzz-no-such-server");
    await page.press('[data-testid="search-input"]', "Enter");
    await expect(page.getByText("No server matches these filters")).toBeVisible();
    await page.click('[data-testid="clear-search"]');
    await expect(page.locator('[data-testid^="server-card-"]').first()).toBeVisible();
  });

  test("opens server details with real charts", async ({ page }) => {
    await page.locator('[data-testid^="server-card-"]').first().click();
    await expect(page.locator('[data-testid="gpu-details-table"]')).toBeVisible();
    await page.getByRole("radio", { name: "6h" }).click();
    await expect(page.locator(".recharts-surface").first()).toBeVisible();
  });
});

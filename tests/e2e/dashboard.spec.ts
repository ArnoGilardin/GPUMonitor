import { test, expect } from '@playwright/test';

test.describe('Dashboard Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/');
    await page.fill('[data-testid="input-username"]', 'admin');
    await page.fill('[data-testid="input-password"]', 'admin');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('should display dashboard with stats cards', async ({ page }) => {
    // Verify stats cards are present
    await expect(page.locator('[data-testid="stat-total-cpus"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-avg-gpu-util"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-critical-alerts"]')).toBeVisible();
    await expect(page.locator('[data-testid="stat-power-usage"]')).toBeVisible();
    
    // Verify stats show numeric values
    const totalCpus = await page.locator('[data-testid="stat-total-cpus"]').textContent();
    const avgGpuUtil = await page.locator('[data-testid="stat-avg-gpu-util"]').textContent();
    
    expect(totalCpus).toMatch(/\d+/);
    expect(avgGpuUtil).toMatch(/\d+%/);
  });

  test('should display servers section', async ({ page }) => {
    await expect(page.locator('[data-testid="section-servers"]')).toBeVisible();
    
    // Should show filter tabs
    await expect(page.locator('text=All')).toBeVisible();
    await expect(page.locator('text=Online')).toBeVisible();
    await expect(page.locator('text=Warning')).toBeVisible();
    await expect(page.locator('text=Critical')).toBeVisible();
  });

  test('should display alerts section', async ({ page }) => {
    await expect(page.locator('[data-testid="section-alerts"]')).toBeVisible();
    await expect(page.locator('text=Recent Alerts')).toBeVisible();
  });

  test('should display navigation sidebar', async ({ page }) => {
    await expect(page.locator('[data-testid="nav-dashboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-alerts"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-settings"]')).toBeVisible();
  });

  test('should display user info in header', async ({ page }) => {
    await expect(page.locator('[data-testid="text-username"]')).toContainText('admin');
    await expect(page.locator('[data-testid="button-logout"]')).toBeVisible();
  });
});
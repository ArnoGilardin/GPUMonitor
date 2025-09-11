import { test, expect } from '@playwright/test';

test.describe('Authentication System', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should login successfully and store tokens', async ({ page }) => {
    await page.goto('/');
    
    // Fill login form
    await page.fill('[data-testid="input-username"]', 'admin');
    await page.fill('[data-testid="input-password"]', 'admin');
    
    // Submit login
    await page.click('[data-testid="login-button"]');
    
    // Wait for dashboard redirect
    await expect(page).toHaveURL('/dashboard');
    
    // Verify user is logged in
    await expect(page.locator('[data-testid="text-username"]')).toContainText('admin');
    
    // Verify tokens are stored
    const accessToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('auth_refresh_token'));
    
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
  });

  test('should handle logout correctly', async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.fill('[data-testid="input-username"]', 'admin');
    await page.fill('[data-testid="input-password"]', 'admin');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Logout
    await page.click('[data-testid="button-logout"]');
    
    // Should redirect to login page
    await expect(page).toHaveURL('/');
    
    // Tokens should be cleared
    const accessToken = await page.evaluate(() => localStorage.getItem('auth_token'));
    const refreshToken = await page.evaluate(() => localStorage.getItem('auth_refresh_token'));
    
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });

  test('should handle invalid credentials', async ({ page }) => {
    await page.goto('/');
    
    await page.fill('[data-testid="input-username"]', 'invalid');
    await page.fill('[data-testid="input-password"]', 'invalid');
    await page.click('[data-testid="login-button"]');
    
    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    
    // Should remain on login page
    await expect(page).toHaveURL('/');
  });

  test('should persist authentication across page reloads', async ({ page }) => {
    // Login
    await page.goto('/');
    await page.fill('[data-testid="input-username"]', 'admin');
    await page.fill('[data-testid="input-password"]', 'admin');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Reload page
    await page.reload();
    
    // Should still be authenticated
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="text-username"]')).toContainText('admin');
  });
});
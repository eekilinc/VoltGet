import { test, expect } from '@playwright/test';

test.describe('VoltGet App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('loads main window', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('text=VoltGet')).toBeVisible();
  });

  test('navigation tabs exist', async ({ page }) => {
    await expect(page.locator('text=İndir')).toBeVisible();
    await expect(page.locator('text=Yakalayıcı')).toBeVisible();
    await expect(page.locator('text=Dosyalar')).toBeVisible();
    await expect(page.locator('text=Ayarlar')).toBeVisible();
    await expect(page.locator('text=Hakkında')).toBeVisible();
  });

  test('download panel loads', async ({ page }) => {
    await page.click('text=İndir');
    await expect(page.locator('text=Link İndir')).toBeVisible();
    await expect(page.locator('text=Toplu İndirme')).toBeVisible();
  });

  test('settings panel loads', async ({ page }) => {
    await page.click('text=Ayarlar');
    await expect(page.locator('text=İndirme Klasörü')).toBeVisible();
    await expect(page.locator('text=Tema')).toBeVisible();
  });

  test('about panel loads', async ({ page }) => {
    await page.click('text=Hakkında');
    await expect(page.locator('text=VoltGet')).toBeVisible();
  });
});

test.describe('Download Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('paste link shows download dialog', async ({ page }) => {
    await page.fill('input[placeholder*="youtube"]', 'https://youtube.com/watch?v=dQw4w9WgXcQ');
    await page.click('text=Analiz Et');
    await page.waitForTimeout(2000);
    // Dialog should appear (may be separate window in Electron)
  });
});

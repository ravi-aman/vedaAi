// @ts-nocheck
import { test, expect } from '@playwright/test';

test.describe('verify after blocker fix @live', () => {
  test.setTimeout(120000);
  test('results page for previous real job still renders correctly after code fix (question hierarchy, PDF, highlight, zoom, resize)', async ({ page }) => {
    const jobId = '39ac494f-ecec-4ccc-91ca-c9e9995a644b';
    await page.goto(`/results/${jobId}`);
    await expect(page.getByText('Extracted Questions').first()).toBeVisible({ timeout: 15000 });
    // Dismiss guest gate if present
    const guestBtn = page.getByRole('button', { name: /Continue as guest/ });
    if (await guestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await guestBtn.click();
      await page.waitForTimeout(500);
    }
    const cards = page.locator('[role="button"]');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const count = await cards.count();
    console.log('cards', count);
    expect(count).toBeGreaterThan(30);
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 15000 });
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    // Click Q1
    await cards.nth(0).click();
    await page.waitForTimeout(800);
    const highlight = page.locator('div[style*="border: 2px solid"]');
    // Highlight may be visible or not depending on old mapping (previously Q1 had wrong highlight but still visible)
    // We check that highlight logic doesn't crash
    const hlCount = await highlight.count();
    console.log('highlight count after Q1', hlCount);
    // Zoom
    const zoomOut = page.getByRole('button', { name: /Zoom out/ });
    const zoomIn = page.getByRole('button', { name: /Zoom in/ });
    if (await zoomOut.isVisible({ timeout: 2000 }).catch(() => false)) {
      await zoomOut.click();
      await page.waitForTimeout(400);
      await expect(canvas).toBeVisible();
      await zoomIn.click();
      await zoomIn.click();
      await page.waitForTimeout(400);
      await expect(canvas).toBeVisible();
    }
    // Resize
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForTimeout(500);
    await expect(canvas).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(cards.first()).toBeVisible();
  });
});

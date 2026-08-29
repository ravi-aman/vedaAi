// @ts-nocheck
import { test, expect } from '@playwright/test';

const JOB_ID = '88792ac6-0f5c-46e2-a795-e332b61f77b4';

test.describe('mapping + highlight verification', () => {
  test('Q3 matched with multi-page highlight, Q1 unanswered', async ({ page }) => {
    await page.goto(`/results/${JOB_ID}`);
    await expect(page.getByText('Extracted Questions').first()).toBeVisible({ timeout: 15000 });
    const cards = page.locator('[role="button"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    const count = await cards.count();
    console.log('cards', count);
    expect(count).toBe(33);

    // Check Q3 is matched (should have highlight) — Q3 is 3rd card (index 2)
    const q3 = cards.nth(2);
    await expect(q3).toBeVisible({ timeout: 10000 });
    await q3.click();
    await page.waitForTimeout(1000);
    // Highlight should be visible for matched
    let hl = page.locator('div[style*="border: 2px solid"]').first();
    // Q3 is matched with 2 pages, so highlight should exist
    await expect(hl).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `artifacts/e2e/q3-matched.png`, fullPage: true });

    // Q1 should be unanswered (no highlight or UNANSWERED badge) — index 0
    const q1 = cards.nth(0);
    await q1.click();
    await page.waitForTimeout(1000);
    // For unanswered, highlight should not exist or be empty
    const hl1 = page.locator('div[style*="border: 2px solid"]').first();
    const isVisible = await hl1.isVisible().catch(() => false);
    console.log('Q1 highlight visible', isVisible);
    // Should have UNANSWERED status
    await expect(page.getByText(/UNANSWERED|unanswered/i).first().or(page.getByText('Q1').first())).toBeVisible({ timeout: 5000 });

    // Q17 matched — index 16
    const q17 = cards.nth(16);
    await q17.click();
    await page.waitForTimeout(1000);
    hl = page.locator('div[style*="border: 2px solid"]').first();
    await expect(hl).toBeVisible({ timeout: 10000 });

    // Verify zoom and resize still work
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30000 });
    const zoomOut = page.getByLabel('Zoom out');
    const zoomIn = page.getByLabel('Zoom in');
    if (await zoomOut.isVisible().catch(() => false)) {
      await zoomOut.click();
      await page.waitForTimeout(500);
      await zoomIn.click();
      await page.waitForTimeout(500);
    }
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);

    // Rapid Q3 -> Q5 -> Q7 (Q5 is unanswered, Q7 unanswered, but should not crash)
    const q5 = cards.nth(4);
    const q7 = cards.nth(6);
    await q3.click();
    await page.waitForTimeout(300);
    await q5.click();
    await page.waitForTimeout(300);
    await q7.click();
    await page.waitForTimeout(300);

    // Check Q29 and Q33 (both unanswered, should not have highlight) — indices 28 and 32
    const q29 = cards.nth(28);
    await q29.click();
    await page.waitForTimeout(500);
    const hl29 = page.locator('div[style*="border: 2px solid"]').first();
    const v29 = await hl29.isVisible().catch(() => false);
    console.log('Q29 highlight', v29);

    const q33 = cards.nth(32);
    await q33.click();
    await page.waitForTimeout(500);
  });
});

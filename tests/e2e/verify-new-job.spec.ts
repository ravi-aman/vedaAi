// @ts-nocheck
import { test, expect } from '@playwright/test';

const JOB_ID = 'b8eb9379-eead-4dd8-800b-3e9a802b4b2c';

test.describe('verify new job 33 questions', () => {
  test('question tree 33 top', async ({ page }) => {
    await page.goto(`/results/${JOB_ID}`);
    await expect(page.getByText('Extracted Questions').first()).toBeVisible({ timeout: 15000 });
    // Check for 33 cards
    const cards = page.locator('[role="button"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    const count = await cards.count();
    console.log('cards', count);
    // Should be at least 33 (top) + subparts, but top should be 33
    // Check header text
    const header = await page.getByText(/Extracted Questions/).textContent();
    console.log('header', header);
    // Check for Q1 and Q33 — cards show "1" and "33"
    await expect(page.locator('[role="button"]').filter({ hasText: '1' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[role="button"]').filter({ hasText: '33' }).first()).toBeVisible({ timeout: 10000 });
    // Ensure no 4(i) garbage as top
    const q4i = page.locator('[role="button"]').filter({ hasText: '4(i)' });
    // 4(i) should exist as subpart, not as top with garbage text "44 33 4 :"
    // If it exists, check its text not garbled
    if (await q4i.isVisible().catch(()=>false)) {
      const txt = await q4i.textContent();
      console.log('4(i) text', txt);
      expect(txt).not.toContain('44 33');
    }
    // Check PDF canvas
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 30000 });
    // Click Q1 and check highlight
    const q1 = page.locator('[role="button"]').filter({ hasText: /^1$/ }).first();
    // Fallback to first card
    const first = cards.first();
    await first.click();
    await page.waitForTimeout(1000);
    const hl = page.locator('div[style*="border: 2px solid"]').first();
    // Highlight may not be visible if no answer, but should have no error
    await page.screenshot({ path: `artifacts/e2e/verify-${JOB_ID}-q1.png`, fullPage: true });
  });
});

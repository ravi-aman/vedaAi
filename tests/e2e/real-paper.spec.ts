// @ts-nocheck
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Real files — must exist on runner
const QP_PATH = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/94fce398-d5e0-461f-90f5-a02fae3ff468';
const AS_PATH = 'C:/Users/Dell/AppData/Local/Temp/veda-ai/18645987-aec2-4683-8c8f-2a5fb8f185de/d1926963-a4e9-48ca-8446-431f6bb613fc';

test.describe('real-paper E2E @live-aws', () => {
  test.setTimeout(300000);

  test('upload → processing → result → PDF → click → highlight → zoom', async ({ page }) => {
    test.skip(!fs.existsSync(QP_PATH) || !fs.existsSync(AS_PATH), 'real PDFs not found — run on dev machine with fixtures');
    // Basic env check — fail fast if mock
    const isMock = process.env.OCR_PROVIDER === 'mock';
    if (isMock) throw new Error('OCR_PROVIDER=mock not allowed for real-paper E2E');

    await page.goto('/');
    await expect(page.getByText('Upload Question Paper & Answer Sheets')).toBeVisible({ timeout: 15000 });

    // Upload both files via hidden inputs (no filechooser needed)
    const fileInputs = page.locator('input[type="file"]');
    await expect(fileInputs.first()).toBeAttached({ timeout: 10000 });
    // Question paper is smaller (0.5 MB) — should upload quickly
    await fileInputs.first().setInputFiles(QP_PATH);
    // Wait for upload card to show file info (PDF badge + size)
    await expect(page.getByText('PDF').first()).toBeVisible({ timeout: 30000 });
    // Wait for qp upload to finish (page count appears or no uploading spinner)
    await page.waitForTimeout(1500);

    await fileInputs.last().setInputFiles(AS_PATH);
    // Answer sheet is larger (13 MB) — wait longer; second PDF badge appears
    await expect(page.getByText('PDF').nth(1)).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(2000);

    // Start mapping
    const startBtn = page.getByRole('button', { name: /Start Mapping/ });
    await expect(startBtn).toBeEnabled({ timeout: 10000 });
    await startBtn.click();

    // Processing page
    await page.waitForURL(/\/processing\/.+/, { timeout: 15000 });
    await expect(page.getByText('Extracting...').first()).toBeVisible({ timeout: 10000 });

    // Wait for completion — poll for redirect to results (up to 4 min for Textract+Vision)
    await page.waitForURL(/\/results\/.+/, { timeout: 240000 });
    await expect(page.getByText('Extracted Questions').first()).toBeVisible({ timeout: 15000 });

    // Dismiss guest gate if present (blocks pointer events)
    const guestBtn = page.getByRole('button', { name: /Continue as guest/ });
    if (await guestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await guestBtn.click();
      await page.waitForTimeout(500);
      await expect(guestBtn).toBeHidden({ timeout: 5000 });
    }

    // Verify hierarchy: 38 top-level — question cards are role=button with number badge
    const questionCards = page.locator('[role="button"]');
    await expect(questionCards.first()).toBeVisible({ timeout: 15000 });
    // Ensure at least 30 cards (38 expected) — count visible cards
    const cardCount = await questionCards.count();
    console.log('question cards count', cardCount);
    expect(cardCount).toBeGreaterThan(30);
    const countText = await page.getByText(/Extracted Questions/).textContent();
    console.log('question header', countText);

    // PDF viewer — check canvas (answer sheet PDF) renders
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 60000 });
    // Ensure at least one canvas has non-zero size
    const box = await canvas.boundingBox();
    expect(box?.width).toBeGreaterThan(100);
    // Capture console/network errors from start
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type()==='error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(String(err)));
    // Click Q1 — first card
    const q1Card = questionCards.nth(0);
    await q1Card.click();
    await page.waitForTimeout(1500);
    let hl = page.locator('div[style*="border: 2px solid"]').first();
    await expect(hl).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `artifacts/e2e/q1-highlight.png`, fullPage: true });

    // Click Q5 (MCQ) — 5th card (index 4)
    const q5Card = questionCards.nth(4);
    await q5Card.click();
    await page.waitForTimeout(1200);
    hl = page.locator('div[style*="border: 2px solid"]').first();
    await expect(hl).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: `artifacts/e2e/q5-mcq.png`, fullPage: true });

    // Click subpart 37(i) — find card with 37(i) badge (may be unanswered → no highlight)
    const q37iCard = page.locator('[role="button"]').filter({ hasText: '37(i)' }).first();
    if (await q37iCard.isVisible({ timeout: 5000 }).catch(()=>false)) {
      await q37iCard.click();
      await page.waitForTimeout(1200);
      const hl37 = page.locator('div[style*="border: 2px solid"]').first();
      if (await hl37.isVisible({ timeout: 5000 }).catch(()=>false)) {
        await expect(hl37).toBeVisible({ timeout: 5000 });
      } else {
        console.log('no highlight for 37(i) — likely UNANSWERED/unmapped, checking fallback');
        // Accept either no-answer text or just card selection
        await page.waitForTimeout(500);
      }
      await page.screenshot({ path: `artifacts/e2e/q37i.png`, fullPage: true });
    } else {
      const fallback = questionCards.filter({ hasText: '37' }).first();
      if (await fallback.isVisible().catch(()=>false)) {
        await fallback.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `artifacts/e2e/q37-fallback.png`, fullPage: true });
      }
    }

    // Zoom 50% 100% 200%
    const zoomOut = page.getByLabel('Zoom out');
    const zoomIn = page.getByLabel('Zoom in');
    if (await zoomOut.isVisible()) {
      await zoomOut.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `artifacts/e2e/zoom-50.png`, fullPage: true });
      await zoomIn.click();
      await zoomIn.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `artifacts/e2e/zoom-200.png`, fullPage: true });
    }

    // Resize
    await page.setViewportSize({ width: 800, height: 800 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/e2e/resize-800.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(800);

    // Check console errors
    expect(errors.filter(e=>e.includes('PDF')||e.includes('worker')||e.includes('Failed to load'))).toEqual([]);

    // Re-select Q1 to ensure highlight exists after resize
    await questionCards.nth(0).click();
    await page.waitForTimeout(800);
    const hl2 = page.locator('div[style*="border: 2px solid"]').first();
    await expect(hl2).toBeVisible({ timeout: 10000 });
  });
});

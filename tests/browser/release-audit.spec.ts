import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const samplePath = resolve('public/samples/hexlens-1x1.png');

async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
  expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
}

test('release desktop accessibility budget stays free of serious or critical violations', async ({ page }) => {
  await page.goto('/');
  await expectNoSeriousA11yViolations(page);

  await page.goto('/inspect?sample=png');
  await expectNoSeriousA11yViolations(page);
});

test('release narrow Sample surfaces stay free of serious or critical violations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/');
  await expectNoSeriousA11yViolations(page);

  await page.goto('/inspect?sample=wav');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('mobile-coming-soon')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('release network audit keeps local identity and file-derived details out of requests and storage', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  const hostileName = 'private/<script>alert(1)</script> report.wav';

  await page.goto('/inspect?sample=png');
  const sampleBytes = readFileSync(samplePath);
  await page.getByTestId('local-file-input').setInputFiles({
    name: hostileName,
    mimeType: 'audio/wav',
    buffer: sampleBytes,
  });

  await expect(page.getByRole('heading', { name: 'Local Inspection' })).toBeVisible();
  await expect(page).toHaveURL(/\/inspect$/);
  await expect(page.getByText(hostileName, { exact: true })).toBeVisible();

  const leaked = requests.filter((url) => url.includes('private') || url.includes('script') || url.includes('alert') || url.includes('report.wav') || url.includes('audio/wav'));
  expect(leaked).toEqual([]);
  expect(await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    url: window.location.href,
  }))).toEqual({ local: [], session: [], url: expect.stringMatching(/\/inspect$/) });
});

test('release virtual grid keeps a bounded DOM window and an explicit selection summary', async ({ page }) => {
  await page.goto('/inspect?sample=png');

  const visibleRows = await page.locator('[data-grid-rows] [data-row-index]').count();
  expect(visibleRows).toBeLessThanOrEqual(12);
  await expect(page.locator('[data-grid-spacer]')).toHaveAttribute('style', /height:/);
  await expect(page.getByTestId('selection-summary')).toContainText(/offset \d+, length \d+ bytes/);
});

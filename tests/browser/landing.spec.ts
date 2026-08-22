import { expect, test } from '@playwright/test';

test('the landing page proves the four-beat product path and enters a real Sample Inspection', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Read the file. See its structure.' })).toBeVisible();
  await expect(page.getByTestId('landing-mini-inspector')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open a file/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A span is the explanation.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two Formats. One honest contract.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your file stays with you.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Learn the format while you inspect it.' })).toBeVisible();
  await expect(page.getByTestId('landing-beat-coverage').getByText('PNG', { exact: true })).toBeVisible();
  await expect(page.getByTestId('landing-beat-coverage').getByText('WAV', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /IHDR · image header/ }).click();
  await expect(page.getByTestId('landing-selection-summary')).toContainText('IHDR');
  await page.locator('[data-landing-byte-offset="12"]').click();
  await expect(page.getByTestId('landing-selection-summary')).toContainText('Type');

  await page.getByTestId('try-sample').click();
  await expect(page).toHaveURL(/\/inspect\?sample=png/);
  await expect(page.getByRole('heading', { name: 'Sample Inspection' })).toBeVisible();
});

test('the educational route opens Info and follows the selected Structure', async ({ page }) => {
  await page.goto('/inspect?sample=png&panel=info');

  await expect(page.getByRole('tab', { name: 'Info' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('inspection-info')).toContainText("The file's ID card");
  await expect(page.getByTestId('inspection-info').getByRole('heading', { name: 'What it is' })).toBeVisible();
  await expect(page.getByTestId('inspection-info').getByRole('heading', { name: 'Why it exists' })).toBeVisible();
  await expect(page.getByTestId('inspection-info').getByRole('heading', { name: 'How to read it' })).toBeVisible();
  await page.getByRole('button', { name: /IHDR · image header/ }).click();
  await expect(page.getByTestId('inspection-info')).toContainText('The image blueprint');
  await expect(page.getByTestId('inspection-info')).toContainText('Offsets 8 through 32');

  await page.getByRole('tab', { name: 'Byte map' }).click();
  await expect(page.getByTestId('byte-grid')).toBeVisible();
  await expect(page).not.toHaveURL(/panel=info/);
});

test('the landing sheet remains keyboard-usable, motion-safe, and within the narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByTestId('mobile-coming-soon')).toHaveText('Coming soon');
  await expect(page.getByTestId('mobile-coming-soon-final')).toHaveText('Coming soon');
  await expect(page.getByTestId('try-sample')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Open a file/ })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;

    return Array.from(document.querySelectorAll<HTMLElement>('[data-landing-byte-offset]')).every((cell) => {
      const bounds = cell.getBoundingClientRect();
      return bounds.left >= -1 && bounds.right <= viewportWidth + 1;
    });
  })).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const evidence = document.querySelector<HTMLElement>('.editorial-connection-rows code');
    return Boolean(evidence && evidence.scrollWidth <= evidence.clientWidth + 1);
  })).toBe(true);
  await expect(page.getByText('Inspect PNG and WAV files without sending a byte away from your browser.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test('the light and dark theme control persists the visitor preference', async ({ page }) => {
  await page.goto('/');

  const toggle = page.locator('[data-theme-toggle]');
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  await toggle.click();

  const nextTheme = initialTheme === 'dark' ? 'light' : 'dark';
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  await expect(toggle).toHaveAttribute('aria-pressed', String(nextTheme === 'dark'));

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
});

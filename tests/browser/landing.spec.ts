import { expect, test } from '@playwright/test';

test('the landing page proves the four-beat product path and enters a real Sample Inspection', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Read the file. See the structure.' })).toBeVisible();
  await expect(page.getByTestId('landing-mini-inspector')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open a file/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'A span is the explanation.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Two Formats. One honest contract.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your file stays with you.' })).toBeVisible();
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

test('the landing sheet remains keyboard-usable, motion-safe, and within the narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  await expect(page.getByTestId('try-sample')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open a file/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const sampleButton = page.getByTestId('try-sample');
  await sampleButton.focus();
  await expect(sampleButton).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/inspect\?sample=png/);
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

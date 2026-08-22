import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('a direct PNG Inspection URL returns phones to the landing page', async ({ page }) => {
  await page.goto('/inspect?sample=png');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Read the file. See its structure.' })).toBeVisible();
  await expect(page.getByTestId('mobile-coming-soon')).toHaveText('Coming soon');
  await expect(page.getByRole('heading', { name: 'Sample Inspection' })).toHaveCount(0);
});

test('Info and WAV Inspection URLs are unavailable on phones', async ({ page }) => {
  for (const path of ['/inspect?sample=wav', '/inspect?sample=png&panel=info']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('mobile-coming-soon')).toBeVisible();
    await expect(page.getByRole('tab')).toHaveCount(0);
  }
});

test('an open desktop Inspection closes when the viewport becomes phone-sized', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/inspect?sample=png');
  await expect(page.getByRole('heading', { name: 'Sample Inspection' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('mobile-coming-soon')).toBeVisible();
});

import { expect, test } from '@playwright/test';

test('a visitor can enter the WAV Sample Inspection and synchronize RIFF, bytes, Fields, and Payload', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/inspect?sample=wav');
  await expect(page).toHaveURL(/\/inspect\?sample=wav/);
  await expect(page.getByRole('heading', { name: 'Sample Inspection' })).toBeVisible();
  await expect(page.getByText('hexlens-sample.wav', { exact: true })).toBeVisible();
  await expect(page.getByText(/52 bytes · WAV/)).toBeVisible();
  await expect(page.getByRole('button', { name: /RIFF\/WAVE · container/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('field-detail')).toContainText('Chunk size');

  await page.getByRole('button', { name: /fmt · format/ }).click();
  await expect(page.getByRole('button', { name: /fmt · format/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('field-detail')).toContainText('Audio format');
  await expect(page.getByTestId('field-detail')).toContainText('little-endian');

  await page.getByRole('button', { name: /01 at offset 14/ }).click();
  await expect(page.getByTestId('selection-summary')).toContainText('Audio format');

  await page.getByRole('button', { name: /data · audio sample Payload/ }).click();
  await expect(page.getByTestId('field-detail')).toContainText('Payload');
  await expect(page.locator('audio[controls]')).toHaveAttribute('preload', 'metadata');
  await expect(page.locator('figcaption#field-heading')).toContainText('original-file rendering');
  expect(requests.some((url) => url.includes('/samples/') || url.includes('hexlens-sample.wav'))).toBe(false);
});

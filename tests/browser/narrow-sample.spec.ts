import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('the narrow PNG Sample uses tabs and preserves its Selection and Source preview', async ({ page }) => {
  await page.goto('/inspect?sample=png');

  await expect(page.getByRole('heading', { name: 'Sample Inspection' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Structures' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Bytes' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fields' })).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText('Open another local file', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: /IHDR · image header/ }).click();
  const summary = page.getByTestId('selection-summary');
  await expect(summary).toContainText('offset 8, length 25 bytes');

  await page.getByRole('tab', { name: 'Fields' }).click();
  const preview = page.locator('#narrow-panel-fields img');
  const previewSource = await preview.getAttribute('src');
  await expect(preview).toHaveCount(1);
  await page.getByRole('tab', { name: 'Bytes' }).click();
  await expect(page.locator('#narrow-panel-bytes')).toBeVisible();
  await expect(page.locator('#narrow-panel-structures')).toBeHidden();
  await expect(summary).toContainText('offset 8, length 25 bytes');
  await page.getByRole('tab', { name: 'Fields' }).click();
  await expect(preview).toHaveAttribute('src', previewSource ?? '');
  await expect(page.getByRole('tab', { name: 'Fields' })).toHaveAttribute('aria-selected', 'true');

  for (const tab of await page.getByRole('tab').all()) {
    const box = await tab.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole('link', { name: /Back to landing/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Read the file. See the structure.' })).toBeVisible();
});

test('the narrow WAV Sample keeps the same tab and Selection contract', async ({ page }) => {
  await page.goto('/inspect?sample=wav');

  await expect(page.getByText('hexlens-sample.wav', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /RIFF\/WAVE · container/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /fmt · format/ }).click();
  const summary = page.getByTestId('selection-summary');
  await expect(summary).toContainText('offset 12, length 24 bytes');

  await page.getByRole('tab', { name: 'Bytes' }).click();
  await expect(page.getByRole('grid')).toBeVisible();
  await expect(summary).toContainText('offset 12, length 24 bytes');
  await page.getByRole('tab', { name: 'Fields' }).click();
  await expect(page.getByTestId('field-detail')).toContainText('Audio format');
  await expect(page.locator('#narrow-panel-fields audio[controls]')).toHaveAttribute('preload', 'metadata');
});

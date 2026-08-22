import { expect, test } from '@playwright/test';

test('a visitor can enter the PNG Sample Inspection and synchronize Structure, bytes, and Fields', async ({ page }) => {
  const fileRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/samples/') || request.url().includes('hexlens-sample') || request.url().includes('filename') || /\.(png|wav)(?:$|[?#])/.test(request.url())) fileRequests.push(request.url());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Read the file. See the structure.' })).toBeVisible();
  await expect(page.getByTestId('try-sample')).toBeVisible();
  await page.getByTestId('try-sample').click();

  await expect(page).toHaveURL(/\/inspect\?sample=png/);
  await expect(page.getByRole('heading', { name: 'Sample Inspection' })).toBeVisible();
  await expect(page.getByRole('button', { name: /PNG signature/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('field-detail')).toContainText('Signature');

  await page.getByRole('button', { name: /IHDR · image header/ }).click();
  await expect(page.getByRole('button', { name: /IHDR · image header/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('field-detail')).toContainText('Width');

  await page.getByRole('button', { name: '49 at offset 0C' }).click();
  await expect(page.getByTestId('selection-summary')).toContainText('Type');
  await expect(page.getByTestId('field-detail')).toContainText('IHDR');

  expect(fileRequests).toEqual([]);
});

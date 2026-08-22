import { expect, test } from '@playwright/test';

test('unsupported files keep raw bytes visible and render hostile names as text', async ({ page }) => {
  await page.goto('/inspect?sample=png');
  await page.getByTestId('local-file-input').setInputFiles({
    name: 'evil<script>alert(1)</script>.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0x00, 0x01, 0xff, 0x7f]),
  });

  await expect(page.getByRole('alert')).toContainText('does not have a PNG signature');
  await expect(page.getByText('Unsupported Format · current Inspection preserved')).toBeVisible();
  await expect(page.getByTestId('byte-grid')).toBeVisible();
  await expect(page.getByText('hexlens-sample.png', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="file-feedback"]')).not.toContainText('<script>alert(1)</script>');
  await expect(page.getByRole('button', { name: /PNG signature/ })).toBeVisible();
});

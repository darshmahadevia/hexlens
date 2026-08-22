import { expect, test } from '@playwright/test';

test('byte Selection extends with pointer input, survives go-to navigation, and retains focus', async ({ page }) => {
  await page.goto('/inspect?sample=png');

  await page.getByRole('button', { name: '89 at offset 00' }).click();
  await page.getByRole('button', { name: '47 at offset 03' }).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('selection-summary')).toContainText('offset 0, length 4 bytes');
  await expect(page.getByRole('button', { name: '47 at offset 03' })).toBeFocused();

  const input = page.getByTestId('offset-input');
  await input.fill('GG');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.getByTestId('offset-error')).toContainText('hexadecimal');
  await expect(page.getByTestId('selection-summary')).toContainText('offset 0, length 4 bytes');

  await input.fill('30');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.getByRole('button', { name: '01 at offset 30' })).toBeFocused();
  await expect(page.getByTestId('selection-summary')).toContainText('offset 0, length 4 bytes');
});

test('the virtual grid exposes ownership markers and bounded copy feedback', async ({ page }) => {
  await page.goto('/inspect?sample=png');
  await expect(page.getByText('Structure boundary')).toBeVisible();
  await expect(page.getByText('Unmapped span')).toBeVisible();
  await expect(page.locator('[data-grid-rows] [data-row-index]')).toHaveCount(5);
  await expect(page.locator('[data-grid-spacer]')).toHaveAttribute('style', /height: 240px/);

  await page.getByRole('button', { name: 'Copy selected bytes' }).click();
  await expect(page.getByTestId('copy-feedback')).toContainText(/Copied|blocked|unavailable/);
});


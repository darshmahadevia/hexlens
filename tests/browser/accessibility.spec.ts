import { expect, test } from '@playwright/test';

test('keyboard traversal keeps semantic focus and provides direct semantic-to-byte links', async ({ page }) => {
  await page.goto('/inspect?sample=png');

  const structures = page.getByRole('button', { name: /PNG signature/ });
  await structures.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: /IHDR · image header/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /IHDR · image header/ })).toBeFocused();
  await expect(page.getByTestId('selection-summary')).toContainText('offset 8, length 25 bytes');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: /00 at offset 08/ })).toBeFocused();
  await expect(page.getByRole('button', { name: /Focus selected structure/ })).toBeVisible();
  await page.getByRole('button', { name: /Focus selected structure/ }).click();
  await expect(page.getByRole('button', { name: /IHDR · image header/ })).toBeFocused();
});

test('raw-byte tab enumeration is opt-in while the compact grid remains keyboard navigable', async ({ page }) => {
  await page.goto('/inspect?sample=png');

  const toggle = page.getByTestId('enumerate-bytes');
  const firstByte = page.getByRole('button', { name: /89 at offset 00/ });
  await expect(toggle).not.toBeChecked();
  await expect(firstByte).toHaveAttribute('tabindex', '-1');
  await expect(page.getByRole('grid')).toHaveAttribute('tabindex', '0');

  await toggle.check();
  await expect(toggle).toBeFocused();
  await expect(firstByte).toHaveAttribute('tabindex', '0');
  await expect(page.getByRole('grid')).toHaveAttribute('tabindex', '-1');

  await toggle.uncheck();
  await expect(toggle).toBeFocused();
  await expect(firstByte).toHaveAttribute('tabindex', '-1');
});

test('screen-reader summaries debounce Selection and operation failures announce immediately', async ({ page }) => {
  await page.goto('/inspect?sample=png');
  const announcement = page.getByTestId('selection-announcement');
  const firstByte = page.getByRole('button', { name: /89 at offset 00/ });

  await firstByte.click();
  await page.getByRole('button', { name: /50 at offset 01/ }).click();
  await expect(announcement).toHaveText('');
  await page.waitForTimeout(240);
  await expect(announcement).toContainText('offset 1, length 1 bytes');
  await expect(page.getByRole('grid')).toHaveAttribute('aria-describedby', /selection-summary/);

  await page.getByLabel('Choose one local PNG file').setInputFiles({
    name: 'not-a-png.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG'),
  });
  await expect(page.getByRole('alert')).toContainText('does not have a PNG signature');
  await expect(page.getByTestId('operation-announcement')).toContainText('does not have a PNG signature');
});

test('reduced motion removes the selection trace while preserving the Selection update', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/inspect?sample=png');

  await page.getByRole('button', { name: /89 at offset 00/ }).click();
  await expect(page.getByTestId('selection-summary')).toContainText('offset 0, length 1 bytes');
  await expect(page.getByRole('button', { name: /89 at offset 00/ })).toHaveCSS('animation-name', 'none');
});

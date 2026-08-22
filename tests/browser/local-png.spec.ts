import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const samplePath = resolve('public/samples/hexlens-1x1.png');

test('opens and replaces one local PNG without putting file identity in the URL', async ({ page }) => {
  const sampleBytes = readFileSync(samplePath);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));

  await page.goto('/inspect?sample=png');
  await expect(page.getByRole('heading', { name: 'Sample Inspection' })).toBeVisible();

  await page.getByLabel('Choose one local PNG file').setInputFiles({
    name: 'portrait.jpg',
    mimeType: 'image/jpeg',
    buffer: sampleBytes,
  });

  await expect(page.getByRole('heading', { name: 'Local Inspection' })).toBeVisible();
  await expect(page.getByText('portrait.jpg', { exact: true })).toBeVisible();
  await expect(page.getByTestId('diagnostics')).toContainText('extension_mismatch');
  await expect(page).toHaveURL(/\/inspect$/);
  expect(page.url()).not.toContain('portrait.jpg');
  expect(requests.some((url) => url.includes('portrait.jpg') || url.includes('image/jpeg'))).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);

  const localInput = page.getByLabel('Choose one local PNG file');
  await localInput.setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: sampleBytes,
  });
  await expect(page.getByText('replacement.png', { exact: true })).toBeVisible();
  await expect(page.getByText('portrait.jpg', { exact: true })).toHaveCount(0);

  await page.getByLabel('Choose one local PNG file').setInputFiles([]);
  await expect(page.getByTestId('file-feedback')).toContainText('No file was selected');
  await expect(page.getByText('replacement.png', { exact: true })).toBeVisible();
});

test('opens an unsupported local file as a raw-byte Inspection and preserves it across invalid drops', async ({ page }) => {
  const sampleBytes = readFileSync(samplePath);
  await page.goto('/inspect?sample=png');
  await expect(page.getByText('hexlens-sample.png', { exact: true })).toBeVisible();

  await page.getByLabel('Choose one local PNG file').setInputFiles({
    name: 'not-a-png.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a PNG'),
  });
  await expect(page.getByTestId('file-feedback')).toContainText('does not have a PNG signature');
  await expect(page.getByText('not-a-png.png', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['one'], 'one.png', { type: 'image/png' }));
    transfer.items.add(new File(['two'], 'two.png', { type: 'image/png' }));
    document.querySelector<HTMLElement>('[data-drop-target="inspector"]')?.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.getByTestId('file-feedback')).toContainText('Choose one file at a time');
  await expect(page.getByText('not-a-png.png', { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        files: [],
        items: [{ kind: 'file', webkitGetAsEntry: () => ({ isDirectory: true }) }],
      },
    });
    document.querySelector<HTMLElement>('[data-drop-target="inspector"]')?.dispatchEvent(event);
  });
  await expect(page.getByTestId('file-feedback')).toContainText('Folders are not supported');
  await expect(page.getByText('not-a-png.png', { exact: true })).toBeVisible();
});

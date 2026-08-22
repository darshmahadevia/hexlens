import { expect, test, type Page } from '@playwright/test';
import { metadataWav, truncatedWav, unsupportedTagWav } from '../wav-fixtures.ts';

async function openFixture(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.locator('[data-testid="local-file-input"]').setInputFiles({
    name,
    mimeType: 'audio/wav',
    buffer: Buffer.from(bytes),
  });
}

test('the public local WAV flow renders INFO metadata and keeps samples opaque', async ({ page }) => {
  await page.goto('/inspect?sample=wav');
  await openFixture(page, 'metadata.wav', metadataWav);

  await expect(page.getByRole('heading', { name: 'Local Inspection' })).toBeVisible();
  await expect(page.getByText('metadata.wav', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /LIST\/INFO · metadata/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /INAM · name/ })).toBeVisible();
  await page.getByRole('button', { name: /INAM · name/ }).click();
  await expect(page.getByTestId('field-detail')).toContainText('Name');
  await page.getByRole('button', { name: /Name/ }).click();
  await expect(page.getByTestId('field-detail')).toContainText('Field note');

  await page.getByRole('button', { name: /data · audio sample Payload/ }).click();
  await page.getByRole('button', { name: /Payload/ }).last().click();
  await expect(page.getByTestId('field-detail')).toContainText('opaque audio sample bytes');
  await expect(page.locator('audio[controls]')).toHaveAttribute('preload', 'metadata');
  await expect(page.locator('figcaption#field-heading')).toContainText('original-file rendering');
});

test('partial WAV Diagnostics and Source-preview failure remain independent', async ({ page }) => {
  await page.goto('/inspect?sample=wav');
  await openFixture(page, 'unsupported.wav', unsupportedTagWav);

  await expect(page.getByText(/Partial Inspection · .*WAV/)).toBeVisible();
  await expect(page.getByTestId('diagnostics')).toContainText('unsupported_format_tag');
  await expect(page.getByTestId('diagnostics')).toContainText('format tag 2');
  await expect(page.locator('[data-testid="source-preview-media"]')).toBeVisible();

  await page.locator('[data-testid="source-preview-media"]').dispatchEvent('error');
  await expect(page.getByRole('button', { name: /fmt · format/ })).toBeVisible();
  await expect(page.getByTestId('diagnostics')).toContainText('unsupported_format_tag');
  await expect(page.getByText(/Source preview · original-file rendering/)).toBeVisible();
});

test('truncated WAV keeps the valid prefix visible with a truncation Diagnostic', async ({ page }) => {
  await page.goto('/inspect?sample=wav');
  await openFixture(page, 'truncated.wav', truncatedWav);

  await expect(page.getByText(/Partial Inspection · .*WAV/)).toBeVisible();
  await expect(page.getByTestId('diagnostics')).toContainText('truncated_riff');
  await expect(page.getByTestId('diagnostics')).toContainText('truncated_chunk');
  await expect(page.getByRole('button', { name: /fmt · format/ })).toBeVisible();
  await expect(page.getByTestId('field-detail')).toContainText('Chunk size');
});

import { expect, test } from '@playwright/test';
import { Buffer } from 'node:buffer';
import { manifest, validEveryDeclaredChunk } from '../fixtures/png-contract.ts';

test('renders declared PNG metadata and keeps unknown Payloads generic', async ({ page }) => {
  await page.goto('/inspect?sample=png');
  await page.getByLabel('Choose one local PNG file').setInputFiles({
    name: 'all-chunks.png',
    mimeType: 'image/png',
    buffer: Buffer.from(validEveryDeclaredChunk()),
  });

  await expect(page.getByRole('heading', { name: 'Local Inspection' })).toBeVisible();
  await expect(page.getByRole('button', { name: /PLTE/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /tEXt/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /zzZZ/ })).toContainText('opaque Payload');
  await expect(page.getByTestId('diagnostics')).toContainText('unsupported_chunk');
  await expect(page.locator('figure.source-preview figcaption')).toContainText('original-file rendering');
  await expect(page).toHaveURL(/\/inspect$/);
});

test('shows trustworthy partial Structures and Diagnostics when an envelope is truncated', async ({ page }) => {
  const truncated = validEveryDeclaredChunk().slice(0, manifest.itxt.offset + 7);
  await page.goto('/inspect?sample=png');
  await page.getByLabel('Choose one local PNG file').setInputFiles({
    name: 'truncated.png',
    mimeType: 'image/png',
    buffer: Buffer.from(truncated),
  });

  await expect(page.getByRole('heading', { name: 'Local Inspection' })).toBeVisible();
  await expect(page.getByText(/Partial Inspection/)).toBeVisible();
  await expect(page.getByRole('button', { name: /tEXt/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /iTXt/ })).toHaveCount(0);
  await expect(page.getByTestId('diagnostics')).toContainText('truncated_chunk');
  await expect(page.getByTestId('diagnostics')).toContainText('missing_iend');
  await expect(page.getByText('Original-file rendering unavailable; the Inspection remains usable.')).toBeVisible();
});

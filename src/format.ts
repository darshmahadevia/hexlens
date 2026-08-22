import { hasPngSignature, inspectPng, PNG_SIGNATURE } from './domain/png.ts';
import { hasRiffContainer, hasWavSignature, inspectWav, RIFF_SIGNATURE, WAVE_FORM } from './domain/wav.ts';
import type { FormatId } from './domain/inspection.ts';

export { hasPngSignature, inspectPng, PNG_SIGNATURE } from './domain/png.ts';
export { hasRiffContainer, hasWavSignature, inspectWav, RIFF_SIGNATURE, WAVE_FORM } from './domain/wav.ts';
export type { ByteSpan, Diagnostic, Field, FormatId, Inspection, Structure } from './domain/inspection.ts';

/** Content-first format detection. Unsupported RIFF families remain distinguishable from unknown bytes. */
export type DetectedFormat = FormatId | 'unsupported_riff' | undefined;

export function detectFormat(bytes: Uint8Array): DetectedFormat {
  if (hasPngSignature(bytes)) return 'png';
  if (hasWavSignature(bytes)) return 'wav';
  if (hasRiffContainer(bytes)) return 'unsupported_riff';
  return undefined;
}

export function inspectDetected(bytes: Uint8Array, sourceName: string, metadata: { mimeType?: string } = {}) {
  const detected = detectFormat(bytes);
  if (detected === 'png') return inspectPng(bytes, sourceName, metadata);
  if (detected === 'wav') return inspectWav(bytes, sourceName, metadata);
  return undefined;
}

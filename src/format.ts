import { hasPngSignature, inspectPng, PNG_SIGNATURE } from './domain/png.ts';
import {
  hasRiffContainer,
  hasWavSignature,
  inspectWav,
  RIFF_SIGNATURE,
  RIFX_SIGNATURE,
  RF64_SIGNATURE,
  WAVE_FORM,
  WAVE_FORMAT_EXTENSIBLE,
  WAVE_FORMAT_IEEE_FLOAT,
  WAVE_FORMAT_PCM,
} from './domain/wav.ts';
import type { FormatId } from './domain/inspection.ts';

export { hasPngSignature, inspectPng, PNG_SIGNATURE } from './domain/png.ts';
export {
  hasRiffContainer,
  hasWavSignature,
  inspectWav,
  RIFF_SIGNATURE,
  RIFX_SIGNATURE,
  RF64_SIGNATURE,
  WAVE_FORM,
  WAVE_FORMAT_EXTENSIBLE,
  WAVE_FORMAT_IEEE_FLOAT,
  WAVE_FORMAT_PCM,
} from './domain/wav.ts';
export type { WavInspectionMetadata } from './domain/wav.ts';
export type { BitField, ByteSpan, DerivedValue, Diagnostic, Field, Inspection, Structure, UnmappedSpan } from './domain/inspection.ts';
export type { FormatId } from './domain/inspection.ts';
export {
  ASCII_REPLACEMENT,
  BYTES_PER_ROW,
  buildRows,
  copyText,
  createOwnershipIndex,
  fieldValueText,
  formatByte,
  formatDecimalOffset,
  formatOffset,
  getRow,
  normalizeSelection,
  offsetWidth,
  ownershipAt,
  parseOffset,
  printableAscii,
  resolveSelection,
  rowCount,
  selectionHex,
} from './domain/byte-grid.ts';
export type {
  ByteGridRow,
  ByteOwnership,
  CopyDependencies,
  CopyResult,
  OffsetMode,
  OffsetParseFailure,
  OffsetParseResult,
  OffsetParseSuccess,
  OwnershipIndex,
  SelectionResolution,
} from './domain/byte-grid.ts';

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

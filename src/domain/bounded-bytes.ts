import type { ByteSpan } from './inspection.ts';

/**
 * Return a Byte span clipped to the available bytes and optional boundary.
 * Parsers use this helper when they need to retain a safe prefix of an
 * incomplete Structure without ever manufacturing an out-of-bounds span.
 */
export function boundedByteSpan(
  bytes: Uint8Array,
  offset: number,
  length: number,
  boundary = bytes.length,
): ByteSpan {
  const safeBoundary = Math.max(0, Math.min(bytes.length, Math.trunc(boundary)));
  const safeOffset = Math.max(0, Math.min(safeBoundary, Math.trunc(offset)));
  const safeLength = Math.max(0, Math.min(safeBoundary - safeOffset, Math.trunc(length)));
  return { offset: safeOffset, length: safeLength };
}

/** Test a read against both the source bytes and an optional parse boundary. */
export function canReadBytes(
  bytes: Uint8Array,
  offset: number,
  length: number,
  boundary = bytes.length,
): boolean {
  const safeBoundary = Math.max(0, Math.min(bytes.length, Math.trunc(boundary)));
  return Number.isSafeInteger(offset)
    && Number.isSafeInteger(length)
    && offset >= 0
    && length >= 0
    && offset <= safeBoundary - length;
}

/** Read only a bounded Byte span into the semantic model. */
export function readBytes(bytes: Uint8Array, target: ByteSpan): number[] {
  return canReadBytes(bytes, target.offset, target.length)
    ? Array.from(bytes.slice(target.offset, target.offset + target.length))
    : [];
}

/** Convert bounded bytes to ASCII without exceeding the argument stack. */
export function readAscii(bytes: Uint8Array, target: ByteSpan): string {
  const values = readBytes(bytes, target);
  let result = '';
  for (let index = 0; index < values.length; index += 4096) {
    result += String.fromCharCode(...values.slice(index, index + 4096));
  }
  return result;
}

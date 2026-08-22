import type { ByteSpan, Diagnostic, Field, Inspection, Structure, UnmappedSpan } from './inspection.ts';

export const RIFF_SIGNATURE = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
export const WAVE_FORM = new Uint8Array([0x57, 0x41, 0x56, 0x45]);

export interface WavInspectionMetadata {
  mimeType?: string;
}
function matchesAscii(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
  return offset >= 0 && offset + expected.length <= bytes.length && expected.every((value, index) => bytes[offset + index] === value);
}

/** True only for the little-endian RIFF/WAVE signature. */
export function hasWavSignature(bytes: Uint8Array): boolean {
  return matchesAscii(bytes, 0, RIFF_SIGNATURE) && matchesAscii(bytes, 8, WAVE_FORM);
}

/** RIFF-like roots are kept separate so callers can explain unsupported forms. */
export function hasRiffContainer(bytes: Uint8Array): boolean {
  return matchesAscii(bytes, 0, RIFF_SIGNATURE) || matchesAscii(bytes, 0, new Uint8Array([0x52, 0x49, 0x46, 0x58])) || matchesAscii(bytes, 0, new Uint8Array([0x52, 0x46, 0x36, 0x34]));
}

function bytesOf(bytes: Uint8Array, span: ByteSpan): number[] {
  return Array.from(bytes.slice(span.offset, span.offset + span.length));
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytesOf(bytes, { offset, length }));
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function field(
  bytes: Uint8Array,
  id: string,
  name: string,
  label: string,
  span: ByteSpan,
  value: string | number,
  representation: string,
  explanation: string,
  endianness: Field['endianness'] = 'little-endian',
): Field {
  return {
    id,
    name,
    label,
    span,
    encodedBytes: bytesOf(bytes, span),
    value,
    representation,
    endianness,
    explanation,
  };
}

function commonChunkFields(bytes: Uint8Array, offset: number, length: number, type: string): Field[] {
  return [
    field(bytes, `wav-${type.trim().toLowerCase() || 'chunk'}-length-${offset}`, 'length', 'Length', { offset, length: 4 }, length, 'unsigned 32-bit integer', 'The little-endian payload length declared by this RIFF chunk.'),
    field(bytes, `wav-${type.trim().toLowerCase() || 'chunk'}-type-${offset}`, 'type', 'Type', { offset: offset + 4, length: 4 }, type, 'ASCII identifier', 'The four-byte RIFF chunk identifier.', 'n/a'),
  ];
}

function fmtFields(bytes: Uint8Array, offset: number, length: number): Field[] {
  const fields = commonChunkFields(bytes, offset, length, 'fmt ');
  const data = offset + 8;
  if (length < 16) return fields;
  fields.push(
    field(bytes, 'wav-fmt-audio-format', 'audioFormat', 'Audio format', { offset: data, length: 2 }, u16(bytes, data), 'unsigned 16-bit integer', 'The audio encoding tag: 1 is PCM and 3 is IEEE float.'),
    field(bytes, 'wav-fmt-channels', 'channels', 'Channels', { offset: data + 2, length: 2 }, u16(bytes, data + 2), 'unsigned 16-bit integer', 'The number of interleaved audio channels.'),
    field(bytes, 'wav-fmt-sample-rate', 'sampleRate', 'Sample rate', { offset: data + 4, length: 4 }, u32(bytes, data + 4), 'unsigned 32-bit integer', 'The number of samples per second.'),
    field(bytes, 'wav-fmt-byte-rate', 'byteRate', 'Byte rate', { offset: data + 8, length: 4 }, u32(bytes, data + 8), 'unsigned 32-bit integer', 'The number of bytes per second in the encoded stream.'),
    field(bytes, 'wav-fmt-block-align', 'blockAlign', 'Block align', { offset: data + 12, length: 2 }, u16(bytes, data + 12), 'unsigned 16-bit integer', 'The byte size of one sample frame.'),
    field(bytes, 'wav-fmt-bits-per-sample', 'bitsPerSample', 'Bits per sample', { offset: data + 14, length: 2 }, u16(bytes, data + 14), 'unsigned 16-bit integer', 'The encoded bit depth of each channel sample.'),
  );
  return fields;
}

function genericChunk(bytes: Uint8Array, offset: number, length: number, type: string, occurrence: number): Structure {
  const span = { offset, length: Math.min(8 + length, bytes.length - offset) };
  const fields = commonChunkFields(bytes, offset, length, type);
  if (length > 0 && offset + 8 + length <= bytes.length) {
    fields.push(field(bytes, `wav-${type.trim().toLowerCase() || 'chunk'}-payload-${offset}`, 'payload', 'Payload', { offset: offset + 8, length }, 'opaque bytes', 'opaque Payload', 'HexLens identifies this chunk but does not interpret its content.', 'n/a'));
  }
  return {
    id: `wav-${type.trim().toLowerCase() || 'chunk'}${occurrence > 1 ? `-${occurrence}` : ''}`,
    name: type.trim().toLowerCase() || 'chunk',
    label: `${type} · opaque Payload`,
    kind: 'chunk',
    span,
    fields,
    description: 'A RIFF chunk kept generic until the bounded WAV contract defines it.',
  };
}

function makeStructure(bytes: Uint8Array, offset: number, length: number, type: string, occurrence: number): Structure {
  const span = { offset, length: 8 + length };
  if (type === 'fmt ') {
    return {
      id: `wav-fmt${occurrence > 1 ? `-${occurrence}` : ''}`,
      name: 'fmt',
      label: 'fmt · format',
      kind: 'chunk',
      span,
      fields: fmtFields(bytes, offset, length),
      description: 'The little-endian format values that describe the audio stream.',
    };
  }
  if (type === 'data') {
    return {
      id: `wav-data${occurrence > 1 ? `-${occurrence}` : ''}`,
      name: 'data',
      label: 'data · audio sample Payload',
      kind: 'payload',
      span,
      fields: [
        ...commonChunkFields(bytes, offset, length, type),
        field(bytes, `wav-data-payload-${offset}`, 'payload', 'Payload', { offset: offset + 8, length }, 'opaque audio sample bytes', 'opaque Payload', 'HexLens identifies audio sample bytes but does not decode them.', 'n/a'),
      ],
      description: 'The original audio sample bytes, carried as opaque Payload.',
    };
  }
  return genericChunk(bytes, offset, length, type, occurrence);
}

function riffStructure(bytes: Uint8Array, declaredLength: number): Structure {
  const span = { offset: 0, length: Math.min(bytes.length, declaredLength + 8) };
  return {
    id: 'wav-riff',
    name: 'riff',
    label: 'RIFF/WAVE · container',
    kind: 'header',
    span,
    fields: [
      field(bytes, 'wav-riff-size', 'chunkSize', 'Chunk size', { offset: 4, length: 4 }, declaredLength, 'unsigned 32-bit integer', 'The little-endian size of the RIFF form after the first eight bytes.'),
      field(bytes, 'wav-riff-form', 'formType', 'Form type', { offset: 8, length: 4 }, 'WAVE', 'ASCII identifier', 'The form identifier that selects the RIFF/WAVE Format.', 'n/a'),
    ],
    description: 'The RIFF container and WAVE form identifier at the start of the file.',
  };
}

function diagnostic(code: string, severity: Diagnostic['severity'], message: string, span: ByteSpan): Diagnostic {
  return { code, severity, message, span };
}

function unmappedSpans(length: number, structures: Structure[]): UnmappedSpan[] {
  const covered = structures
    .map((structure) => structure.span)
    .filter((target) => target.length > 0)
    .sort((a, b) => a.offset - b.offset);
  const result: UnmappedSpan[] = [];
  let cursor = 0;
  for (const target of covered) {
    const start = Math.max(0, Math.min(length, target.offset));
    const end = Math.max(start, Math.min(length, target.offset + target.length));
    if (start > cursor) {
      const gap = { offset: cursor, length: start - cursor };
      result.push({ id: `wav-unmapped-${result.length + 1}`, span: gap, ...gap, reason: 'Bytes not claimed by a parsed Structure.' });
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < length) {
    const gap = { offset: cursor, length: length - cursor };
    result.push({ id: `wav-unmapped-${result.length + 1}`, span: gap, ...gap, reason: 'Bytes not claimed by a parsed Structure.' });
  }
  return result;
}

function inspectionResult(
  id: string,
  bytes: Uint8Array,
  sourceName: string,
  structures: Structure[],
  diagnostics: Diagnostic[],
): Inspection {
  const unmapped = unmappedSpans(bytes.length, structures);
  const complete = !diagnostics.some((item) => item.severity === 'error');
  return {
    id,
    format: 'wav',
    state: complete ? 'ready' : 'partial',
    complete,
    termination: complete ? 'complete' : 'partial',
    limitReached: false,
    sourceName,
    bytes,
    structures,
    fields: structures.flatMap((structure) => structure.fields),
    payloads: structures.flatMap((structure) => structure.payload ? [structure.payload] : []),
    unmappedSpans: unmapped,
    unmapped,
    bitFields: [],
    derivedValues: [],
    diagnostics,
  };
}

export function inspectWav(bytes: Uint8Array, sourceName = 'hexlens-sample.wav', _metadata: WavInspectionMetadata = {}): Inspection {
  const diagnostics: Diagnostic[] = [];
  const structures: Structure[] = [];
  const inspectionId = `wav-${bytes.byteLength}-${bytes[0] ?? 0}`;

  if (!hasWavSignature(bytes)) {
    const message = hasRiffContainer(bytes)
      ? 'The RIFF container is not a RIFF/WAVE file.'
      : 'The file does not begin with the RIFF/WAVE signature.';
    return inspectionResult(
      inspectionId,
      bytes,
      sourceName,
      [],
      [diagnostic('unsupported_format', 'error', message, { offset: 0, length: Math.min(bytes.length, 12) })],
    );
  }

  const declaredLength = u32(bytes, 4);
  structures.push(riffStructure(bytes, declaredLength));
  const expectedFileLength = declaredLength + 8;
  if (expectedFileLength > bytes.length) {
    diagnostics.push(diagnostic('truncated_riff', 'error', 'The RIFF container declares bytes beyond the file boundary.', { offset: 4, length: Math.min(4, bytes.length - 4) }));
  } else if (expectedFileLength < bytes.length) {
    diagnostics.push(diagnostic('invalid_length', 'warning', 'The RIFF container ends before the available file bytes.', { offset: 4, length: 4 }));
  }

  let offset = 12;
  const occurrences = new Map<string, number>();
  let foundFmt = false;
  let foundData = false;
  while (offset < bytes.length) {
    const remaining = bytes.length - offset;
    if (remaining < 8) {
      diagnostics.push(diagnostic('truncated_chunk', 'error', 'A RIFF chunk header is incomplete at the end of the file.', { offset, length: remaining }));
      break;
    }
    const type = ascii(bytes, offset, 4);
    const length = u32(bytes, offset + 4);
    const total = 8 + length;
    if (total < 8 || length > bytes.length - offset - 8) {
      diagnostics.push(diagnostic('truncated_chunk', 'error', `The ${type || 'RIFF'} chunk declares bytes beyond the file boundary.`, { offset, length: remaining }));
      break;
    }
    const occurrence = (occurrences.get(type) ?? 0) + 1;
    occurrences.set(type, occurrence);
    structures.push(makeStructure(bytes, offset, length, type, occurrence));
    if (type === 'fmt ') foundFmt = true;
    if (type === 'data') foundData = true;
    offset += total;
    if (length % 2 === 1) {
      if (offset >= bytes.length) {
        diagnostics.push(diagnostic('invalid_alignment', 'error', 'An odd-sized RIFF chunk is missing its required padding byte.', { offset: offset - 1, length: 1 }));
        break;
      }
      offset += 1;
    }
  }
  if (!foundFmt) diagnostics.push(diagnostic('missing_fmt', 'error', 'The RIFF/WAVE file is missing its required fmt chunk.', { offset: 12, length: Math.max(0, bytes.length - 12) }));
  if (!foundData) diagnostics.push(diagnostic('missing_data', 'error', 'The RIFF/WAVE file is missing its required data chunk.', { offset: 12, length: Math.max(0, bytes.length - 12) }));

  const extension = sourceName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (extension && extension !== 'wav') {
    diagnostics.unshift(diagnostic('extension_mismatch', 'note', 'The filename extension does not match the RIFF/WAVE signature. Content determined this Format.', { offset: 0, length: 12 }));
  }

  return inspectionResult(inspectionId, bytes, sourceName, structures, diagnostics);
}

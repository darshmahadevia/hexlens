import type {
  ByteSpan,
  Diagnostic,
  Field,
  Inspection,
  Payload,
  Structure,
  UnmappedSpan,
} from './inspection.ts';
import {
  GENERIC_DIAGNOSTIC_CODES,
  INSPECTION_LIMITS,
} from './inspection.ts';
import {
  canReadBytes as canRead,
  readAscii as ascii,
  readBytes as bytesOf,
} from './bounded-bytes.ts';

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/** The release safety budget affirmed by the #12 profiling run. */
export const PNG_LIMITS = Object.freeze({
  maxBytes: INSPECTION_LIMITS.maxBytes,
  maxStructures: INSPECTION_LIMITS.maxStructures,
  maxDiagnostics: INSPECTION_LIMITS.maxDiagnostics,
});

/** Stable public Diagnostic identities and their byte-span policy. */
export const PNG_DIAGNOSTIC_CODES = Object.freeze({
  unsupportedFormat: GENERIC_DIAGNOSTIC_CODES.unsupportedFormat,
  formatNameMismatch: GENERIC_DIAGNOSTIC_CODES.formatNameMismatch,
  limitReached: GENERIC_DIAGNOSTIC_CODES.limitReached,
  parseAborted: GENERIC_DIAGNOSTIC_CODES.parseAborted,
  truncatedChunk: 'truncated_chunk',
  invalidLength: 'invalid_length',
  invalidChunkType: 'invalid_chunk_type',
  invalidOrder: 'invalid_order',
  duplicateChunk: 'duplicate_chunk',
  missingIhdr: 'missing_ihdr',
  missingPlte: 'missing_plte',
  missingIdat: 'missing_idat',
  missingIend: 'missing_iend',
  crcMismatch: 'crc_mismatch',
  invalidIhdr: 'invalid_ihdr',
  invalidChunkData: 'invalid_chunk_data',
  unsupportedChunk: 'unsupported_chunk',
  compressedTextOpaque: 'compressed_text_opaque',
  trailingData: 'trailing_data',
} as const);

export const PNG_DIAGNOSTIC_SPAN_POLICY: Readonly<Record<string, string>> = Object.freeze({
  unsupported_format: 'Available signature prefix.',
  extension_mismatch: 'The eight-byte signature.',
  limit_reached: 'The first offset that could not be safely inspected.',
  parse_aborted: 'The first offset not inspected when cancellation was observed.',
  truncated_chunk: 'All available bytes from the unsafe chunk offset.',
  invalid_length: 'The declared length field or complete offending envelope.',
  invalid_chunk_type: 'The four-byte chunk type field.',
  invalid_order: 'The complete offending chunk envelope.',
  duplicate_chunk: 'The complete duplicate chunk envelope.',
  missing_ihdr: 'A zero-length expected span at the first unprocessed offset, or the post-signature gap.',
  missing_plte: 'A zero-length expected span at the first unprocessed offset.',
  missing_idat: 'A zero-length expected span at the first unprocessed offset.',
  missing_iend: 'A zero-length expected span at the first unprocessed offset.',
  crc_mismatch: 'The four-byte stored CRC field.',
  invalid_ihdr: 'The 13-byte IHDR data span.',
  invalid_chunk_data: 'The offending data field or complete chunk envelope.',
  unsupported_chunk: 'The complete well-formed unknown chunk envelope.',
  compressed_text_opaque: 'The compressed text data span.',
  trailing_data: 'All bytes after the first IEND envelope.',
});

export interface PngInspectionMetadata {
  mimeType?: string;
  /** Optional cooperative cancellation for worker/adaptor callers. */
  signal?: AbortSignal;
}

/** One source of truth for typed PNG Structures in both parser and UI. */
export const PNG_TYPED_CHUNK_TYPES: ReadonlySet<string> = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tEXt',
  'iTXt',
  'gAMA',
  'sRGB',
  'tRNS',
  'pHYs',
]);
const PNG_CHUNK_TYPE_LENGTH = 4;
const PNG_CHUNK_HEADER_LENGTH = 8;
const PNG_CHUNK_TRAILER_LENGTH = 4;
const PNG_MIN_CHUNK_LENGTH = PNG_CHUNK_HEADER_LENGTH + PNG_CHUNK_TRAILER_LENGTH;

interface ParseContext {
  seenIhdr: boolean;
  seenPlte: boolean;
  seenIdat: boolean;
  idatClosed: boolean;
  seenIend: boolean;
  colorType?: number;
  paletteEntries: number;
  occurrences: Map<string, number>;
}

function span(offset: number, length: number): ByteSpan {
  return { offset, length };
}

function latin1(bytes: Uint8Array, target: ByteSpan): string {
  const max = 8_192;
  const safe = target.length > max ? span(target.offset, max) : target;
  const value = ascii(bytes, safe);
  return target.length > max ? `${value}…` : value;
}

function hexBytes(values: number[]): string {
  return values.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function u32(bytes: Uint8Array, offset: number): number | undefined {
  if (!canRead(bytes, offset, 4)) return undefined;
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function u16(bytes: Uint8Array, offset: number): number | undefined {
  if (!canRead(bytes, offset, 2)) return undefined;
  return (bytes[offset] << 8) + bytes[offset + 1];
}

function crc32(bytes: Uint8Array, typeOffset: number, dataOffset: number, dataLength: number): number {
  let crc = 0xffffffff;
  const update = (value: number): void => {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  };
  for (let index = 0; index < PNG_CHUNK_TYPE_LENGTH; index += 1) update(bytes[typeOffset + index]);
  for (let index = 0; index < dataLength; index += 1) update(bytes[dataOffset + index]);
  return (crc ^ 0xffffffff) >>> 0;
}

function sourceNameSuffix(sourceName: string): string | undefined {
  const match = sourceName.match(/\.([^.\\/]+)$/);
  return match?.[1]?.toLowerCase();
}

function safeTypeSlug(type: string): string {
  const slug = type.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  return slug || 'unknown';
}

function chunkId(type: string, offset: number, occurrence: number): string {
  if (type === 'IHDR' && occurrence === 1) return 'png-ihdr';
  if (type === 'IEND' && occurrence === 1) return 'png-iend';
  if (type === 'IDAT' && occurrence === 1) return 'png-idat';
  if (type === 'PLTE' && occurrence === 1) return 'png-plte';
  return `png-${safeTypeSlug(type)}-${occurrence}-${offset}`;
}

function field(
  bytes: Uint8Array,
  id: string,
  name: string,
  label: string,
  target: ByteSpan,
  value: string | number,
  representation: string,
  explanation: string,
  endianness: Field['endianness'] = 'big-endian',
  status: Field['status'] = 'interpreted',
  payloadId?: string,
): Field {
  return {
    id,
    name,
    label,
    span: target,
    encodedBytes: bytesOf(bytes, target),
    value,
    representation,
    endianness,
    explanation,
    status,
    ...(payloadId ? { payloadId } : {}),
  };
}

function makePayload(
  structureId: string,
  offset: number,
  length: number,
  label: string,
  description: string,
): Payload {
  return {
    id: `${structureId}-payload`,
    structureId,
    span: span(offset, length),
    encoding: 'opaque',
    label,
    description,
  };
}

function addOpaquePayload(
  bytes: Uint8Array,
  fields: Field[],
  structureId: string,
  offset: number,
  length: number,
  label: string,
  description: string,
): Payload | undefined {
  if (length <= 0) return undefined;
  const payload = makePayload(structureId, offset, length, label, description);
  fields.push(field(
    bytes,
    `${structureId}-payload-field`,
    'payload',
    label,
    payload.span,
    'opaque bytes',
    'opaque Payload',
    description,
    'n/a',
    'opaque',
    payload.id,
  ));
  return payload;
}

function findZero(bytes: Uint8Array, start: number, end: number): number {
  for (let index = start; index < end; index += 1) if (bytes[index] === 0) return index;
  return -1;
}

function isValidKeyword(bytes: Uint8Array, target: ByteSpan): boolean {
  if (target.length < 1 || target.length > 79 || !canRead(bytes, target.offset, target.length)) return false;
  for (const value of bytesOf(bytes, target)) {
    // PNG keywords are Latin-1 text without NUL; reject controls so a parsed
    // value never smuggles a line/control protocol into the UI.
    if (value === 0 || value < 32 || value === 127) return false;
  }
  return true;
}

function decodeUtf8(bytes: Uint8Array, target: ByteSpan): string | undefined {
  if (target.length > 8_192) return undefined;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(new Uint8Array(bytesOf(bytes, target)));
  } catch {
    return undefined;
  }
}

function chunkLabel(type: string, hasPayload: boolean): string {
  if (type === 'IHDR') return 'IHDR · image header';
  if (type === 'PLTE') return 'PLTE · palette';
  if (type === 'IDAT') return 'IDAT · compressed Payload';
  if (type === 'IEND') return 'IEND · image end';
  if (type === 'tEXt') return 'tEXt · text';
  if (type === 'iTXt') return 'iTXt · international text';
  if (type === 'gAMA') return 'gAMA · gamma';
  if (type === 'sRGB') return 'sRGB · rendering intent';
  if (type === 'tRNS') return 'tRNS · transparency';
  if (type === 'pHYs') return 'pHYs · pixel dimensions';
  return `${type || 'Unknown'} · ${hasPayload ? 'opaque Payload' : 'unknown chunk'}`;
}

function chunkDescription(type: string, hasPayload: boolean): string {
  if (type === 'IHDR') return 'The required image header and its seven format values.';
  if (type === 'PLTE') return 'The palette entries used by indexed-color images.';
  if (type === 'IDAT') return 'Compressed image bytes identified as opaque Payload; HexLens does not decode pixels.';
  if (type === 'IEND') return 'The required marker that ends the PNG datastream.';
  if (type === 'tEXt') return 'Uncompressed Latin-1 text separated into keyword and text Fields.';
  if (type === 'iTXt') return 'UTF-8 text when uncompressed; compressed text remains opaque.';
  if (type === 'gAMA') return 'The image gamma value stored as a big-endian integer scaled by 100000.';
  if (type === 'sRGB') return 'The one-byte sRGB rendering intent.';
  if (type === 'tRNS') return 'Transparency samples whose layout depends on the IHDR color type.';
  if (type === 'pHYs') return 'Pixels-per-unit values and their unit selector.';
  return hasPayload ? 'A well-formed but unsupported chunk retained with opaque Payload.' : 'A well-formed generic PNG chunk.';
}

function addField(fields: Field[], next: Field): void {
  fields.push(next);
}

function parseTextFields(
  bytes: Uint8Array,
  type: string,
  structureId: string,
  dataStart: number,
  dataEnd: number,
  fields: Field[],
  addDiagnostic: (code: string, severity: Diagnostic['severity'], message: string, target: ByteSpan) => void,
): Payload | undefined {
  const separator = findZero(bytes, dataStart, dataEnd);
  const keywordSpan = span(dataStart, separator < 0 ? dataEnd - dataStart : separator - dataStart);
  if (separator < 0 || !isValidKeyword(bytes, keywordSpan)) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', `${type} does not contain a safe keyword separator and text layout.`, span(dataStart, dataEnd - dataStart));
    return addOpaquePayload(bytes, fields, structureId, dataStart, dataEnd - dataStart, 'Opaque Payload', 'Text layout was not safely parseable.');
  }

  addField(fields, field(bytes, `${structureId}-keyword`, 'keyword', 'Keyword', keywordSpan, latin1(bytes, keywordSpan), 'Latin-1 text', 'The uncompressed text keyword.', 'n/a'));
  const textSpan = span(separator + 1, dataEnd - separator - 1);
  if (textSpan.length > 8_192) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'warning', `${type} text exceeds the bounded display length and remains opaque.`, textSpan);
    return addOpaquePayload(bytes, fields, structureId, textSpan.offset, textSpan.length, 'Opaque text Payload', 'The text value is too large to decode into the Field inspector.');
  }
  addField(fields, field(bytes, `${structureId}-text`, 'text', 'Text', textSpan, latin1(bytes, textSpan), 'Latin-1 text', 'The uncompressed text value.', 'n/a'));
  return undefined;
}

function parseITXtFields(
  bytes: Uint8Array,
  structureId: string,
  dataStart: number,
  dataEnd: number,
  fields: Field[],
  addDiagnostic: (code: string, severity: Diagnostic['severity'], message: string, target: ByteSpan) => void,
): Payload | undefined {
  const firstSeparator = findZero(bytes, dataStart, dataEnd);
  if (firstSeparator < 0) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'iTXt is missing its keyword separator.', span(dataStart, dataEnd - dataStart));
    return addOpaquePayload(bytes, fields, structureId, dataStart, dataEnd - dataStart, 'Opaque Payload', 'iTXt layout was not safely parseable.');
  }
  const keywordSpan = span(dataStart, firstSeparator - dataStart);
  if (!isValidKeyword(bytes, keywordSpan) || dataEnd - firstSeparator < 3) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'iTXt has an invalid keyword or missing compression controls.', span(dataStart, dataEnd - dataStart));
    return addOpaquePayload(bytes, fields, structureId, dataStart, dataEnd - dataStart, 'Opaque Payload', 'iTXt layout was not safely parseable.');
  }

  const compressionFlagOffset = firstSeparator + 1;
  const compressionMethodOffset = compressionFlagOffset + 1;
  const compressionFlag = bytes[compressionFlagOffset];
  const compressionMethod = bytes[compressionMethodOffset];
  addField(fields, field(bytes, `${structureId}-keyword`, 'keyword', 'Keyword', keywordSpan, latin1(bytes, keywordSpan), 'Latin-1 text', 'The iTXt keyword.', 'n/a'));
  addField(fields, field(bytes, `${structureId}-compression-flag`, 'compressionFlag', 'Compression flag', span(compressionFlagOffset, 1), compressionFlag, 'unsigned 8-bit integer', 'Zero means the text is uncompressed; one means it is compressed.', 'n/a'));
  addField(fields, field(bytes, `${structureId}-compression-method`, 'compressionMethod', 'Compression method', span(compressionMethodOffset, 1), compressionMethod, 'unsigned 8-bit integer', 'The compression method identifier when the flag is set.', 'n/a'));

  const languageStart = compressionMethodOffset + 1;
  const languageEnd = findZero(bytes, languageStart, dataEnd);
  if (languageEnd < 0) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'iTXt is missing its language separator.', span(dataStart, dataEnd - dataStart));
    return addOpaquePayload(bytes, fields, structureId, dataStart, dataEnd - dataStart, 'Opaque Payload', 'iTXt language layout was not safely parseable.');
  }
  const languageSpan = span(languageStart, languageEnd - languageStart);
  addField(fields, field(bytes, `${structureId}-language`, 'language', 'Language tag', languageSpan, latin1(bytes, languageSpan), 'ASCII text', 'The optional language tag.', 'n/a'));

  const translatedStart = languageEnd + 1;
  const translatedEnd = findZero(bytes, translatedStart, dataEnd);
  if (translatedEnd < 0) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'iTXt is missing its translated-keyword separator.', span(dataStart, dataEnd - dataStart));
    return addOpaquePayload(bytes, fields, structureId, dataStart, dataEnd - dataStart, 'Opaque Payload', 'iTXt translated keyword layout was not safely parseable.');
  }
  const translatedSpan = span(translatedStart, translatedEnd - translatedStart);
  const translatedKeyword = decodeUtf8(bytes, translatedSpan);
  if (translatedKeyword === undefined) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'The iTXt translated keyword is not valid UTF-8.', translatedSpan);
    return addOpaquePayload(bytes, fields, structureId, dataStart, dataEnd - dataStart, 'Opaque Payload', 'The iTXt translated keyword was not safely decoded.');
  }
  addField(fields, field(bytes, `${structureId}-translated-keyword`, 'translatedKeyword', 'Translated keyword', translatedSpan, translatedKeyword, 'UTF-8 text', 'The optional translated keyword.', 'n/a'));

  const textSpan = span(translatedEnd + 1, dataEnd - translatedEnd - 1);
  if (textSpan.length > 8_192) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'warning', 'iTXt text exceeds the bounded display length and remains opaque.', textSpan);
    return addOpaquePayload(bytes, fields, structureId, textSpan.offset, textSpan.length, 'Opaque text Payload', 'The text value is too large to decode into the Field inspector.');
  }
  if (compressionFlag === 1) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.compressedTextOpaque, 'note', 'Compressed iTXt text remains opaque; HexLens does not decompress text.', textSpan);
    return addOpaquePayload(bytes, fields, structureId, textSpan.offset, textSpan.length, 'Opaque compressed text', 'Compressed iTXt Payload is retained without decompression.');
  }
  if (compressionFlag !== 0 || compressionMethod !== 0) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'iTXt uses an unsupported uncompressed layout.', span(compressionFlagOffset, 2));
    return addOpaquePayload(bytes, fields, structureId, dataStart, dataEnd - dataStart, 'Opaque Payload', 'iTXt compression controls were not safely parseable.');
  }
  const text = decodeUtf8(bytes, textSpan);
  if (text === undefined) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'Uncompressed iTXt text is not valid UTF-8.', textSpan);
    return addOpaquePayload(bytes, fields, structureId, textSpan.offset, textSpan.length, 'Opaque Payload', 'The iTXt text was not valid UTF-8.');
  }
  addField(fields, field(bytes, `${structureId}-text`, 'text', 'Text', textSpan, text, 'UTF-8 text', 'The uncompressed UTF-8 text value.', 'n/a'));
  return undefined;
}

function parseChunkData(
  bytes: Uint8Array,
  type: string,
  structureId: string,
  offset: number,
  length: number,
  context: ParseContext,
  fields: Field[],
  addDiagnostic: (code: string, severity: Diagnostic['severity'], message: string, target: ByteSpan) => void,
): Payload | undefined {
  const dataStart = offset + PNG_CHUNK_HEADER_LENGTH;
  const dataEnd = dataStart + length;

  if (type === 'IHDR') {
    if (length !== 13) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'IHDR must declare exactly 13 data bytes.', span(offset, length + 12));
      return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'IHDR values were not safely parseable because its declared length is invalid.');
    }
    const width = u32(bytes, dataStart) ?? 0;
    const height = u32(bytes, dataStart + 4) ?? 0;
    const bitDepth = bytes[dataStart + 8];
    const colorType = bytes[dataStart + 9];
    const compression = bytes[dataStart + 10];
    const filter = bytes[dataStart + 11];
    const interlace = bytes[dataStart + 12];
    context.colorType = colorType;
    addField(fields, field(bytes, `${structureId}-width`, 'width', 'Width', span(dataStart, 4), width, 'unsigned 32-bit integer', 'Image width in pixels.', 'big-endian'));
    addField(fields, field(bytes, `${structureId}-height`, 'height', 'Height', span(dataStart + 4, 4), height, 'unsigned 32-bit integer', 'Image height in pixels.', 'big-endian'));
    addField(fields, field(bytes, `${structureId}-bit-depth`, 'bitDepth', 'Bit depth', span(dataStart + 8, 1), bitDepth, 'unsigned 8-bit integer', 'Bits used by each sample.', 'n/a'));
    addField(fields, field(bytes, `${structureId}-color-type`, 'colorType', 'Color type', span(dataStart + 9, 1), colorType, 'PNG color type', 'The PNG color model identifier.', 'n/a'));
    addField(fields, field(bytes, `${structureId}-compression`, 'compression', 'Compression', span(dataStart + 10, 1), compression, 'unsigned 8-bit integer', 'The PNG compression method.', 'n/a'));
    addField(fields, field(bytes, `${structureId}-filter`, 'filter', 'Filter', span(dataStart + 11, 1), filter, 'unsigned 8-bit integer', 'The PNG filter method.', 'n/a'));
    addField(fields, field(bytes, `${structureId}-interlace`, 'interlace', 'Interlace', span(dataStart + 12, 1), interlace, 'unsigned 8-bit integer', 'The PNG interlace method.', 'n/a'));

    const validColorType = [0, 2, 3, 4, 6].includes(colorType);
    const validDepthByColor: Record<number, number[]> = {
      0: [1, 2, 4, 8, 16],
      2: [8, 16],
      3: [1, 2, 4, 8],
      4: [8, 16],
      6: [8, 16],
    };
    const valid = width > 0 && height > 0 && validColorType && validDepthByColor[colorType]?.includes(bitDepth) && compression === 0 && filter === 0 && (interlace === 0 || interlace === 1);
    if (!valid) {
      fields.slice(-7).forEach((item) => { item.status = 'invalid'; });
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidIhdr, 'error', 'IHDR contains an unsupported or inconsistent image format value.', span(dataStart, 13));
    }
    return undefined;
  }

  if (type === 'PLTE') {
    if (length === 0 || length % 3 !== 0 || length > 768) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'PLTE data must contain one to 256 complete RGB entries.', span(offset, length + 12));
      return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'PLTE entries were not safely aligned.');
    }
    context.paletteEntries = length / 3;
    for (let index = 0; index < length; index += 3) {
      const target = span(dataStart + index, 3);
      addField(fields, field(bytes, `${structureId}-entry-${index / 3}`, `entry${index / 3}`, `Entry ${index / 3}`, target, `#${hexBytes(bytesOf(bytes, target)).replaceAll(' ', '')}`, 'RGB triplet', 'One palette entry in source order.', 'n/a'));
    }
    return undefined;
  }

  if (type === 'IDAT') {
    if (length === 0) addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'IDAT must carry at least one compressed data byte.', span(offset, length + 12));
    return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque compressed Payload', 'Compressed image bytes are retained without zlib or pixel decoding.');
  }

  if (type === 'IEND') {
    if (length !== 0) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'IEND must declare zero data bytes.', span(offset, length + 12));
      return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'IEND data was not expected by the PNG contract.');
    }
    return undefined;
  }

  if (type === 'tEXt') return parseTextFields(bytes, type, structureId, dataStart, dataEnd, fields, addDiagnostic);
  if (type === 'iTXt') return parseITXtFields(bytes, structureId, dataStart, dataEnd, fields, addDiagnostic);

  if (type === 'gAMA') {
    if (length !== 4) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'gAMA must declare exactly four data bytes.', span(offset, length + 12));
      return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'The gAMA integer was not safely parseable.');
    }
    addField(fields, field(bytes, `${structureId}-gamma`, 'gamma', 'Gamma', span(dataStart, 4), u32(bytes, dataStart) ?? 0, 'unsigned 32-bit integer (×100000)', 'The image gamma value divided by 100000.', 'big-endian'));
    return undefined;
  }

  if (type === 'sRGB') {
    if (length !== 1) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'sRGB must declare exactly one data byte.', span(offset, length + 12));
      return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'The sRGB intent was not safely parseable.');
    }
    const intent = bytes[dataStart];
    addField(fields, field(bytes, `${structureId}-intent`, 'renderingIntent', 'Rendering intent', span(dataStart, 1), intent, 'unsigned 8-bit integer', 'The sRGB rendering intent (0–3).', 'n/a'));
    if (intent > 3) addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'sRGB rendering intent must be between 0 and 3.', span(dataStart, 1));
    return undefined;
  }

  if (type === 'tRNS') {
    if (context.colorType === 3 && !context.seenPlte) addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidOrder, 'error', 'Indexed-color tRNS should appear after PLTE.', span(offset, length + 12));
    if (context.colorType === 0 && length === 2) {
      addField(fields, field(bytes, `${structureId}-gray-sample`, 'graySample', 'Gray sample', span(dataStart, 2), u16(bytes, dataStart) ?? 0, 'unsigned 16-bit integer', 'The transparent grayscale sample.', 'big-endian'));
      return undefined;
    }
    if (context.colorType === 2 && length === 6) {
      addField(fields, field(bytes, `${structureId}-red-sample`, 'redSample', 'Red sample', span(dataStart, 2), u16(bytes, dataStart) ?? 0, 'unsigned 16-bit integer', 'The transparent red sample.', 'big-endian'));
      addField(fields, field(bytes, `${structureId}-green-sample`, 'greenSample', 'Green sample', span(dataStart + 2, 2), u16(bytes, dataStart + 2) ?? 0, 'unsigned 16-bit integer', 'The transparent green sample.', 'big-endian'));
      addField(fields, field(bytes, `${structureId}-blue-sample`, 'blueSample', 'Blue sample', span(dataStart + 4, 2), u16(bytes, dataStart + 4) ?? 0, 'unsigned 16-bit integer', 'The transparent blue sample.', 'big-endian'));
      return undefined;
    }
    if (context.colorType === 3 && length <= Math.max(context.paletteEntries, 1)) {
      for (let index = 0; index < length; index += 1) {
        addField(fields, field(bytes, `${structureId}-alpha-${index}`, `alpha${index}`, `Palette alpha ${index}`, span(dataStart + index, 1), bytes[dataStart + index], 'unsigned 8-bit integer', 'The alpha value for a palette entry.', 'n/a'));
      }
      return undefined;
    }
    addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'tRNS layout does not match the IHDR color type.', span(offset, length + 12));
    return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'Transparency bytes were not safely separated for this color type.');
  }

  if (type === 'pHYs') {
    if (length !== 9) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'pHYs must declare exactly nine data bytes.', span(offset, length + 12));
      return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'The pHYs values were not safely parseable.');
    }
    addField(fields, field(bytes, `${structureId}-pixels-x`, 'pixelsPerUnitX', 'Pixels per unit X', span(dataStart, 4), u32(bytes, dataStart) ?? 0, 'unsigned 32-bit integer', 'Horizontal pixels per unit.', 'big-endian'));
    addField(fields, field(bytes, `${structureId}-pixels-y`, 'pixelsPerUnitY', 'Pixels per unit Y', span(dataStart + 4, 4), u32(bytes, dataStart + 4) ?? 0, 'unsigned 32-bit integer', 'Vertical pixels per unit.', 'big-endian'));
    addField(fields, field(bytes, `${structureId}-unit`, 'unitSpecifier', 'Unit specifier', span(dataStart + 8, 1), bytes[dataStart + 8], 'unsigned 8-bit integer', 'Zero means unknown; one means the metre.', 'n/a'));
    if (bytes[dataStart + 8] > 1) addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkData, 'error', 'pHYs unit specifier must be 0 or 1.', span(dataStart + 8, 1));
    return undefined;
  }

  if (!PNG_TYPED_CHUNK_TYPES.has(type)) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.unsupportedChunk, 'note', `${type || 'Unknown'} is retained as a generic opaque chunk.`, span(offset, length + 12));
    if (length === 0) {
      const emptyPayload = makePayload(structureId, dataStart, 0, 'Opaque Payload', 'HexLens identifies this chunk but it carries no bytes to interpret.');
      fields.push(field(bytes, `${structureId}-payload-field`, 'payload', 'Opaque Payload', emptyPayload.span, 'opaque bytes', 'opaque Payload', emptyPayload.description, 'n/a', 'opaque', emptyPayload.id));
      return emptyPayload;
    }
  }
  return addOpaquePayload(bytes, fields, structureId, dataStart, length, 'Opaque Payload', 'HexLens identifies this chunk but does not interpret its Payload.');
}

function signatureStructure(bytes: Uint8Array): Structure {
  const target = span(0, PNG_SIGNATURE.length);
  return {
    id: 'png-signature',
    name: 'signature',
    label: 'PNG signature',
    kind: 'header',
    span: target,
    fields: [field(bytes, 'png-signature-value', 'signature', 'Signature', target, 'PNG', '8-byte identifier', 'The file identifier that selects the PNG Format.', 'n/a')],
    description: 'The eight-byte identifier at the start of the file.',
    occurrence: 1,
  };
}

function addUnmapped(length: number, structures: Structure[]): UnmappedSpan[] {
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
      const targetSpan = span(cursor, start - cursor);
      result.push({ id: `png-unmapped-${result.length + 1}`, span: targetSpan, offset: targetSpan.offset, length: targetSpan.length, reason: 'Bytes not claimed by a parsed Structure.' });
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < length) {
    const target = span(cursor, length - cursor);
    result.push({ id: `png-unmapped-${result.length + 1}`, span: target, offset: target.offset, length: target.length, reason: 'Bytes not claimed by a parsed Structure.' });
  }
  return result;
}

function inspectionId(bytes: Uint8Array): string {
  let hash = 2166136261;
  // Keep identity work bounded even when the caller hands us a source above
  // the semantic byte budget. The full source remains available to the byte
  // grid, but identity need not scan every byte before returning a limit.
  const prefixLength = Math.min(bytes.length, 1_048_576);
  for (let index = 0; index < prefixLength; index += 1) hash = Math.imul(hash ^ bytes[index], 16777619);
  for (let index = Math.max(prefixLength, bytes.length - 1_024); index < bytes.length; index += 1) hash = Math.imul(hash ^ bytes[index], 16777619);
  return `png-${bytes.length}-${(hash >>> 0).toString(16)}`;
}

function baseInspection(
  bytes: Uint8Array,
  sourceName: string,
  structures: Structure[],
  diagnostics: Diagnostic[],
  complete: boolean,
  status: Inspection['status'] = complete ? 'ready' : diagnostics.some((diagnostic) => diagnostic.code === PNG_DIAGNOSTIC_CODES.limitReached) ? 'limit-reached' : 'partial',
  termination: Inspection['termination'] = complete ? 'complete' : status === 'limit-reached' ? 'limit-reached' : status === 'unsupported' ? 'unsupported' : status === 'aborted' ? 'aborted' : status === 'application-error' ? 'application-error' : 'partial',
): Inspection {
  const fields = structures.flatMap((structure) => structure.fields);
  const payloads = structures.flatMap((structure) => structure.payload ? [structure.payload] : []);
  const unmappedSpans = addUnmapped(bytes.length, structures);
  return {
    id: inspectionId(bytes),
    format: 'png',
    state: complete ? 'ready' : 'partial',
    status,
    complete,
    termination,
    limitReached: diagnostics.some((diagnostic) => diagnostic.code === PNG_DIAGNOSTIC_CODES.limitReached),
    sourceName,
    bytes,
    structures,
    fields,
    payloads,
    unmappedSpans,
    unmapped: unmappedSpans,
    bitFields: [],
    derivedValues: [],
    diagnostics,
  };
}

export function hasPngSignature(bytes: Uint8Array): boolean {
  return bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

export function inspectPng(input: Uint8Array, sourceName = 'hexlens-sample.png', metadata: PngInspectionMetadata = {}): Inspection {
  const bytes = new Uint8Array(input);
  const structures: Structure[] = [];
  const diagnostics: Diagnostic[] = [];
  let diagnosticLimitReached = false;

  const addDiagnostic = (code: string, severity: Diagnostic['severity'], message: string, target: ByteSpan, bucket?: string[]): void => {
    if (bucket && !bucket.includes(code)) bucket.push(code);
    if (diagnostics.length >= PNG_LIMITS.maxDiagnostics) return;
    if (diagnostics.length === PNG_LIMITS.maxDiagnostics - 1 && code !== PNG_DIAGNOSTIC_CODES.limitReached) {
      diagnostics.push({ code: PNG_DIAGNOSTIC_CODES.limitReached, severity: 'error', message: 'The Diagnostic safety limit was reached; parsing stopped before more findings could be recorded.', span: target });
      diagnosticLimitReached = true;
      return;
    }
    diagnostics.push({ code, severity, message, span: target });
  };

  if (!hasPngSignature(bytes)) {
    const target = span(0, Math.min(bytes.length, PNG_SIGNATURE.length));
    const inspection = baseInspection(bytes, sourceName, [], [{ code: PNG_DIAGNOSTIC_CODES.unsupportedFormat, severity: 'error', message: 'The file does not begin with the PNG signature.', span: target }], false, 'unsupported', 'unsupported');
    return inspection;
  }

  structures.push(signatureStructure(bytes));
  if (bytes.length > PNG_LIMITS.maxBytes) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.limitReached, 'error', 'The PNG exceeds the 25 MiB local safety limit; only the signature was inspected.', span(PNG_LIMITS.maxBytes, 0));
    return baseInspection(bytes, sourceName, structures, diagnostics, false, 'limit-reached', 'limit-reached');
  }

  const suffix = sourceNameSuffix(sourceName);
  if (suffix && suffix !== 'png') addDiagnostic(PNG_DIAGNOSTIC_CODES.formatNameMismatch, 'note', 'The source name suffix does not match the PNG signature. Content determined this Format.', span(0, PNG_SIGNATURE.length));
  // MIME is supporting evidence only. It never chooses this parser and is not
  // promoted to a misleading source-name Diagnostic in the public result.
  void metadata.mimeType;

  const context: ParseContext = { seenIhdr: false, seenPlte: false, seenIdat: false, idatClosed: false, seenIend: false, paletteEntries: 0, occurrences: new Map() };
  let offset = PNG_SIGNATURE.length;
  let unsafeStop = false;

  while (offset < bytes.length) {
    if (metadata.signal?.aborted) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.parseAborted, 'warning', 'Parsing was canceled before the next PNG chunk could be inspected.', span(Math.min(offset, bytes.length), 0));
      unsafeStop = true;
      break;
    }
    if (diagnosticLimitReached) {
      unsafeStop = true;
      break;
    }
    if (structures.length >= PNG_LIMITS.maxStructures) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.limitReached, 'error', 'The Structure safety limit was reached; parsing stopped before more chunks could be claimed.', span(offset, 0));
      unsafeStop = true;
      break;
    }
    const remaining = bytes.length - offset;
    if (remaining < PNG_MIN_CHUNK_LENGTH) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.truncatedChunk, 'error', 'The PNG chunk envelope is truncated before its length, type, data, and CRC are complete.', span(offset, remaining));
      unsafeStop = true;
      break;
    }

    const length = u32(bytes, offset);
    if (length === undefined) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.truncatedChunk, 'error', 'The PNG chunk length could not be read safely.', span(offset, remaining));
      unsafeStop = true;
      break;
    }
    if (length > PNG_LIMITS.maxBytes || length > remaining - PNG_MIN_CHUNK_LENGTH) {
      if (length > 0x7fffffff || length > PNG_LIMITS.maxBytes) addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'The PNG chunk declares an unsafe or impossible Payload length.', span(offset, Math.min(4, remaining)));
      addDiagnostic(PNG_DIAGNOSTIC_CODES.truncatedChunk, 'error', 'The PNG chunk declares bytes beyond the available file boundary; recovery stopped at this unsafe offset.', span(offset, remaining));
      unsafeStop = true;
      break;
    }

    const type = ascii(bytes, span(offset + 4, PNG_CHUNK_TYPE_LENGTH));
    const total = length + PNG_MIN_CHUNK_LENGTH;
    const end = offset + total;
    if (!Number.isSafeInteger(end) || end <= offset || !canRead(bytes, offset, total)) {
      addDiagnostic(PNG_DIAGNOSTIC_CODES.invalidLength, 'error', 'The PNG chunk envelope could not be bounded safely.', span(offset, Math.min(remaining, PNG_MIN_CHUNK_LENGTH)));
      unsafeStop = true;
      break;
    }

    const typeBytes = bytesOf(bytes, span(offset + 4, 4));
    const validType = typeBytes.every((value) => (value >= 65 && value <= 90) || (value >= 97 && value <= 122));
    const occurrence = (context.occurrences.get(type) ?? 0) + 1;
    context.occurrences.set(type, occurrence);
    const id = chunkId(type, offset, occurrence);
    const fields: Field[] = [
      field(bytes, `${id}-length`, 'length', 'Length', span(offset, 4), length, 'unsigned 32-bit integer', 'The payload length declared by this chunk.', 'big-endian'),
      field(bytes, `${id}-type`, 'type', 'Type', span(offset + 4, 4), type, 'ASCII identifier', 'The four-byte chunk identifier.', 'n/a', validType ? 'interpreted' : 'invalid'),
    ];
    const diagnosticCodes: string[] = [];
    const chunkDiagnostic = (code: string, severity: Diagnostic['severity'], message: string, target: ByteSpan): void => addDiagnostic(code, severity, message, target, diagnosticCodes);

    if (!validType) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.invalidChunkType, 'error', 'The chunk type is not four ASCII letters; its complete envelope is retained without guessing.', span(offset + 4, 4));
    if (type === 'IHDR') {
      if (context.seenIhdr) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.duplicateChunk, 'error', 'PNG may contain exactly one IHDR chunk.', span(offset, total));
      if (offset !== PNG_SIGNATURE.length) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.invalidOrder, 'error', 'IHDR must be the first PNG chunk after the signature.', span(offset, total));
      context.seenIhdr = true;
    } else if (!context.seenIhdr) {
      chunkDiagnostic(PNG_DIAGNOSTIC_CODES.invalidOrder, 'error', 'A PNG chunk appeared before the required IHDR.', span(offset, total));
    }
    if (occurrence > 1 && ['PLTE', 'gAMA', 'sRGB', 'tRNS', 'pHYs'].includes(type)) {
      chunkDiagnostic(PNG_DIAGNOSTIC_CODES.duplicateChunk, 'error', `${type} may appear at most once in this PNG Inspection.`, span(offset, total));
    }
    if (type === 'PLTE') {
      if (context.seenIdat) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.invalidOrder, 'error', 'PLTE must appear before the first IDAT chunk.', span(offset, total));
      if (context.colorType === 0 || context.colorType === 4) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.invalidOrder, 'error', 'PLTE is not permitted for grayscale color types.', span(offset, total));
      context.seenPlte = true;
    }
    if (type === 'IDAT') {
      if (context.idatClosed) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.invalidOrder, 'error', 'IDAT chunks must remain consecutive in source order.', span(offset, total));
      if (context.colorType === 3 && !context.seenPlte) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.missingPlte, 'error', 'Indexed-color PNG data requires PLTE before IDAT.', span(offset, total));
      context.seenIdat = true;
    } else if (context.seenIdat && type !== 'IEND') {
      context.idatClosed = true;
    }
    if (type === 'IEND') {
      if (context.seenIend) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.duplicateChunk, 'error', 'PNG may contain exactly one IEND chunk.', span(offset, total));
      if (!context.seenIdat) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.invalidOrder, 'error', 'IEND appeared before any IDAT chunk.', span(offset, total));
      context.seenIend = true;
    }

    const payload = parseChunkData(bytes, type, id, offset, length, context, fields, chunkDiagnostic);
    const expectedCrc = u32(bytes, offset + PNG_CHUNK_HEADER_LENGTH + length) ?? 0;
    const actualCrc = crc32(bytes, offset + 4, offset + PNG_CHUNK_HEADER_LENGTH, length);
    addField(fields, field(bytes, `${id}-crc`, 'crc', 'CRC', span(offset + PNG_CHUNK_HEADER_LENGTH + length, 4), `0x${expectedCrc.toString(16).toUpperCase().padStart(8, '0')}`, 'CRC-32', 'The chunk integrity value stored after the Payload.', 'big-endian'));
    if (expectedCrc !== actualCrc) chunkDiagnostic(PNG_DIAGNOSTIC_CODES.crcMismatch, 'error', 'The stored CRC does not match the chunk type and data bytes.', span(offset + PNG_CHUNK_HEADER_LENGTH + length, 4));

    const structure: Structure = {
      id,
      name: type ? type.toLowerCase() : 'unknown',
      label: chunkLabel(type, Boolean(payload)),
      kind: type === 'IDAT' ? 'payload' : 'chunk',
      span: span(offset, total),
      fields,
      description: chunkDescription(type, Boolean(payload)),
      occurrence,
      type,
      ...(payload ? { payload } : {}),
      ...(diagnosticCodes.length ? { diagnosticCodes } : {}),
    };
    structures.push(structure);
    offset = end;
    if (type === 'IEND') break;
  }

  if (context.seenIend && offset < bytes.length) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.trailingData, 'error', 'Bytes after IEND are not part of the PNG datastream and remain Unmapped.', span(offset, bytes.length - offset));
    unsafeStop = true;
  }
  if (!context.seenIhdr) addDiagnostic(PNG_DIAGNOSTIC_CODES.missingIhdr, 'error', 'The PNG is missing its required IHDR chunk.', span(PNG_SIGNATURE.length, Math.max(0, offset - PNG_SIGNATURE.length)));
  if (!context.seenIdat) addDiagnostic(PNG_DIAGNOSTIC_CODES.missingIdat, 'error', 'The PNG is missing its required IDAT data.', span(Math.min(offset, bytes.length), 0));
  if (!context.seenIend) addDiagnostic(PNG_DIAGNOSTIC_CODES.missingIend, 'error', 'The PNG is missing its required IEND marker.', span(Math.min(offset, bytes.length), 0));
  if (context.colorType === 3 && !context.seenPlte && !diagnostics.some((diagnostic) => diagnostic.code === PNG_DIAGNOSTIC_CODES.missingPlte)) {
    addDiagnostic(PNG_DIAGNOSTIC_CODES.missingPlte, 'error', 'Indexed-color PNG data requires a PLTE chunk.', span(Math.min(offset, bytes.length), 0));
  }

  const complete = !unsafeStop && !diagnosticLimitReached && context.seenIhdr && context.seenIdat && context.seenIend && !diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const status: Inspection['status'] = diagnostics.some((diagnostic) => diagnostic.code === PNG_DIAGNOSTIC_CODES.limitReached)
    ? 'limit-reached'
    : diagnostics.some((diagnostic) => diagnostic.code === PNG_DIAGNOSTIC_CODES.parseAborted)
      ? 'aborted'
      : complete ? 'ready' : 'partial';
  return baseInspection(bytes, sourceName, structures, diagnostics, complete, status);
}

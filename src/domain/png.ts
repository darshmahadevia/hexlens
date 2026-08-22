import type { ByteSpan, Diagnostic, Field, Inspection, Structure } from './inspection.ts';

export const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function bytesOf(bytes: Uint8Array, span: ByteSpan): number[] {
  return Array.from(bytes.slice(span.offset, span.offset + span.length));
}

function ascii(bytes: Uint8Array, span: ByteSpan): string {
  return String.fromCharCode(...bytesOf(bytes, span));
}

function u32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
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
  endianness: Field['endianness'] = 'big-endian',
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

function chunkFields(bytes: Uint8Array, offset: number, length: number, type: string): Field[] {
  const fields: Field[] = [
    field(bytes, `${type.toLowerCase()}-length-${offset}`, 'length', 'Length', { offset, length: 4 }, length, 'unsigned 32-bit integer', 'The payload length declared by this chunk.', 'big-endian'),
    field(bytes, `${type.toLowerCase()}-type-${offset}`, 'type', 'Type', { offset: offset + 4, length: 4 }, type, 'ASCII identifier', 'The four-byte chunk identifier.', 'n/a'),
  ];

  if (type === 'IHDR' && length >= 13) {
    const data = offset + 8;
    fields.push(
      field(bytes, 'ihdr-width', 'width', 'Width', { offset: data, length: 4 }, u32(bytes, data), 'unsigned 32-bit integer', 'Image width in pixels.', 'big-endian'),
      field(bytes, 'ihdr-height', 'height', 'Height', { offset: data + 4, length: 4 }, u32(bytes, data + 4), 'unsigned 32-bit integer', 'Image height in pixels.', 'big-endian'),
      field(bytes, 'ihdr-bit-depth', 'bitDepth', 'Bit depth', { offset: data + 8, length: 1 }, bytes[data + 8], 'unsigned 8-bit integer', 'Bits used by each sample.', 'n/a'),
      field(bytes, 'ihdr-color-type', 'colorType', 'Color type', { offset: data + 9, length: 1 }, bytes[data + 9], 'PNG color type', 'The PNG color model identifier.', 'n/a'),
      field(bytes, 'ihdr-compression', 'compression', 'Compression', { offset: data + 10, length: 1 }, bytes[data + 10], 'unsigned 8-bit integer', 'The PNG compression method.', 'n/a'),
      field(bytes, 'ihdr-filter', 'filter', 'Filter', { offset: data + 11, length: 1 }, bytes[data + 11], 'unsigned 8-bit integer', 'The PNG filter method.', 'n/a'),
      field(bytes, 'ihdr-interlace', 'interlace', 'Interlace', { offset: data + 12, length: 1 }, bytes[data + 12], 'unsigned 8-bit integer', 'The PNG interlace method.', 'n/a'),
    );
  } else if (type === 'IDAT') {
    fields.push(field(bytes, 'idat-payload', 'payload', 'Payload', { offset: offset + 8, length }, 'opaque compressed bytes', 'opaque Payload', 'HexLens identifies compressed image bytes but does not decode them.', 'n/a'));
  } else if (length > 0) {
    fields.push(field(bytes, `${type.toLowerCase()}-payload-${offset}`, 'payload', 'Payload', { offset: offset + 8, length }, 'opaque bytes', 'opaque Payload', 'HexLens identifies these bytes without interpreting them.', 'n/a'));
  }

  fields.push(
    field(bytes, `${type.toLowerCase()}-crc-${offset}`, 'crc', 'CRC', { offset: offset + 8 + length, length: 4 }, `0x${u32(bytes, offset + 8 + length).toString(16).toUpperCase().padStart(8, '0')}`, 'CRC-32', 'The chunk integrity value stored after the payload.', 'big-endian'),
  );
  return fields;
}

function signatureStructure(bytes: Uint8Array): Structure {
  const span = { offset: 0, length: 8 };
  return {
    id: 'png-signature',
    name: 'signature',
    label: 'PNG signature',
    kind: 'header',
    span,
    fields: [field(bytes, 'png-signature-value', 'signature', 'Signature', span, 'PNG', '8-byte identifier', 'The file identifier that selects the PNG Format.', 'n/a')],
    description: 'The eight-byte identifier at the start of the file.',
  };
}

function makeChunk(bytes: Uint8Array, offset: number, length: number, type: string): Structure {
  const span = { offset, length: length + 12 };
  const isPayload = type === 'IDAT';
  return {
    id: `png-${type.toLowerCase()}`,
    name: type.toLowerCase(),
    label: type === 'IHDR' ? 'IHDR · image header' : type === 'IEND' ? 'IEND · image end' : `${type} · opaque Payload`,
    kind: isPayload ? 'payload' : 'chunk',
    span,
    fields: chunkFields(bytes, offset, length, type),
    description: type === 'IHDR' ? 'The required image header and its seven format values.' : type === 'IEND' ? 'The required marker that ends the PNG datastream.' : 'A compressed Payload kept opaque by HexLens.',
  };
}

export function inspectPng(bytes: Uint8Array, sourceName = 'hexlens-sample.png'): Inspection {
  const diagnostics: Diagnostic[] = [];
  const structures: Structure[] = [];
  const inspectionId = `png-${bytes.byteLength}-${bytes[0] ?? 0}`;

  if (bytes.length < PNG_SIGNATURE.length || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) {
    return {
      id: inspectionId,
      format: 'png',
      state: 'partial',
      sourceName,
      bytes,
      structures: [],
      diagnostics: [{ code: 'unsupported_format', severity: 'error', message: 'The file does not begin with the PNG signature.', span: { offset: 0, length: Math.min(bytes.length, 8) } }],
    };
  }

  structures.push(signatureStructure(bytes));
  let offset = 8;
  let foundIhdr = false;
  let foundIend = false;

  while (offset + 8 <= bytes.length) {
    const length = u32(bytes, offset);
    const type = ascii(bytes, { offset: offset + 4, length: 4 });
    const total = length + 12;

    if (total < 12 || total > bytes.length - offset) {
      diagnostics.push({ code: 'truncated_chunk', severity: 'error', message: `The ${type || 'PNG'} chunk declares bytes beyond the file boundary.`, span: { offset, length: bytes.length - offset } });
      break;
    }

    if (type === 'IHDR') {
      foundIhdr = true;
      if (offset !== 8) diagnostics.push({ code: 'invalid_order', severity: 'error', message: 'IHDR must be the first PNG chunk.', span: { offset, length: total } });
    }
    if (type === 'IEND') foundIend = true;
    structures.push(makeChunk(bytes, offset, length, type));
    offset += total;
    if (type === 'IEND') break;
  }

  if (!foundIhdr) diagnostics.push({ code: 'missing_ihdr', severity: 'error', message: 'The PNG is missing its required IHDR chunk.', span: { offset: 8, length: Math.max(0, bytes.length - 8) } });
  if (!foundIend) diagnostics.push({ code: 'missing_iend', severity: 'warning', message: 'The PNG has no IEND marker in the available bytes.', span: { offset: bytes.length, length: 0 } });

  return { id: inspectionId, format: 'png', state: diagnostics.some((item) => item.severity === 'error') ? 'partial' : 'ready', sourceName, bytes, structures, diagnostics };
}

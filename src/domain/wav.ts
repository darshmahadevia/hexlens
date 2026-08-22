import {
  GENERIC_DIAGNOSTIC_CODES,
  INSPECTION_LIMITS,
  type ByteSpan,
  type Diagnostic,
  type Field,
  type Inspection,
  type Structure,
  type UnmappedSpan,
} from './inspection.ts';
import {
  boundedByteSpan as boundedSpan,
  boundedByteSpan as boundedSpanWithin,
  canReadBytes as canRead,
  readAscii,
  readBytes as bytesOf,
} from './bounded-bytes.ts';

export const RIFF_SIGNATURE = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
export const WAVE_FORM = new Uint8Array([0x57, 0x41, 0x56, 0x45]);
export const RIFX_SIGNATURE = new Uint8Array([0x52, 0x49, 0x46, 0x58]);
export const RF64_SIGNATURE = new Uint8Array([0x52, 0x46, 0x36, 0x34]);

/** The only audio format tags interpreted by the bounded WAV contract. */
export const WAVE_FORMAT_PCM = 0x0001;
export const WAVE_FORMAT_IEEE_FLOAT = 0x0003;
export const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

/** The same release bounds apply to PNG and WAV inspections. */
export const WAV_LIMITS = Object.freeze({
  maxBytes: INSPECTION_LIMITS.maxBytes,
  maxStructures: INSPECTION_LIMITS.maxStructures,
  maxDiagnostics: INSPECTION_LIMITS.maxDiagnostics,
});

/** Stable WAV Diagnostic identities and their public span policy. */
export const WAV_DIAGNOSTIC_CODES = Object.freeze({
  unsupportedFormat: GENERIC_DIAGNOSTIC_CODES.unsupportedFormat,
  limitReached: GENERIC_DIAGNOSTIC_CODES.limitReached,
  parseAborted: GENERIC_DIAGNOSTIC_CODES.parseAborted,
  formatNameMismatch: GENERIC_DIAGNOSTIC_CODES.formatNameMismatch,
  truncatedRiff: 'truncated_riff',
  truncatedChunk: 'truncated_chunk',
  invalidLength: 'invalid_length',
  invalidAlignment: 'invalid_alignment',
  missingFmt: 'missing_fmt',
  missingData: 'missing_data',
  missingFact: 'missing_fact',
  unsupportedFormatTag: 'unsupported_format_tag',
  invalidConsistency: 'invalid_consistency',
} as const);

export const WAV_DIAGNOSTIC_SPAN_POLICY: Readonly<Record<string, string>> = Object.freeze({
  unsupported_format: 'The available RIFF/root signature prefix.',
  limit_reached: 'The first offset that could not be safely inspected.',
  parse_aborted: 'The first offset not inspected when cancellation was observed.',
  extension_mismatch: 'The RIFF/WAVE root identifier.',
  truncated_riff: 'The four-byte declared RIFF size field.',
  truncated_chunk: 'All available bytes from the unsafe chunk offset.',
  invalid_length: 'The declared length field or offending chunk envelope.',
  invalid_alignment: 'The expected one-byte padding position.',
  missing_fmt: 'The remaining RIFF Payload where fmt was expected.',
  missing_data: 'The remaining RIFF Payload where data was expected.',
  missing_fact: 'The remaining RIFF Payload where fact was expected for IEEE-float audio.',
  unsupported_format_tag: 'The two-byte format tag Field.',
  invalid_consistency: 'The Field whose declared relationship is inconsistent.',
});

export interface WavInspectionMetadata {
  mimeType?: string;
  signal?: AbortSignal;
}

const INFO_LABELS: Record<string, { name: string; label: string }> = {
  INAM: { name: 'name', label: 'Name' },
  IART: { name: 'artist', label: 'Artist' },
  ICMT: { name: 'comment', label: 'Comment' },
  ICRD: { name: 'creationDate', label: 'Creation date' },
  IGNR: { name: 'genre', label: 'Genre' },
};

function matchesAscii(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
  return offset >= 0 && offset + expected.length <= bytes.length && expected.every((value, index) => bytes[offset + index] === value);
}

/** True only for the little-endian RIFF/WAVE signature. */
export function hasWavSignature(bytes: Uint8Array): boolean {
  return matchesAscii(bytes, 0, RIFF_SIGNATURE) && matchesAscii(bytes, 8, WAVE_FORM);
}

/** RIFF-like roots remain distinguishable so callers can explain exclusions. */
export function hasRiffContainer(bytes: Uint8Array): boolean {
  return matchesAscii(bytes, 0, RIFF_SIGNATURE)
    || matchesAscii(bytes, 0, RIFX_SIGNATURE)
    || matchesAscii(bytes, 0, RF64_SIGNATURE);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return readAscii(bytes, boundedSpan(bytes, offset, length));
}

function text(bytes: Uint8Array, offset: number, length: number): string {
  const max = 8_192;
  const value = ascii(bytes, offset, Math.min(length, max)).replace(/\0+$/, '');
  return length > max ? `${value}…` : value;
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
  status: Field['status'] = 'interpreted',
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
    status,
  };
}

function diagnostic(code: string, severity: Diagnostic['severity'], message: string, span: ByteSpan): Diagnostic {
  return { code, severity, message, span };
}

interface DiagnosticCollector {
  readonly items: Diagnostic[];
  capped: boolean;
  add(item: Diagnostic): void;
}

function createDiagnosticCollector(): DiagnosticCollector {
  const items: Diagnostic[] = [];
  return {
    items,
    capped: false,
    add(item): void {
      if (items.length >= WAV_LIMITS.maxDiagnostics) return;
      if (items.length === WAV_LIMITS.maxDiagnostics - 1 && item.code !== WAV_DIAGNOSTIC_CODES.limitReached) {
        items.push(diagnostic(
          WAV_DIAGNOSTIC_CODES.limitReached,
          'error',
          'The Diagnostic safety limit was reached; parsing stopped before more findings could be recorded.',
          item.span,
        ));
        this.capped = true;
        return;
      }
      items.push(item);
      if (item.code === WAV_DIAGNOSTIC_CODES.limitReached) this.capped = true;
    },
  };
}

function addUnmapped(unmapped: UnmappedSpan[], bytes: Uint8Array, span: ByteSpan, reason: string): void {
  const safe = boundedSpan(bytes, span.offset, span.length);
  if (safe.length === 0) return;
  const previous = unmapped[unmapped.length - 1];
  if (previous && previous.span.offset + previous.span.length === safe.offset && previous.reason === reason) {
    previous.span.length += safe.length;
    previous.length += safe.length;
    return;
  }
  unmapped.push({
    id: `wav-unmapped-${safe.offset}`,
    span: safe,
    offset: safe.offset,
    length: safe.length,
    label: 'Unmapped span',
    reason,
  });
}

function chunkId(type: string): string {
  return type.trim().toLowerCase() || 'chunk';
}

function commonChunkFields(bytes: Uint8Array, offset: number, declaredLength: number, type: string, boundary = bytes.length): Field[] {
  const fields: Field[] = [];
  if (offset + 4 <= boundary && canRead(bytes, offset, 4)) {
    fields.push(field(bytes, `wav-${chunkId(type)}-length-${offset}`, 'length', 'Length', { offset, length: 4 }, declaredLength, 'unsigned 32-bit integer', 'The little-endian payload length declared by this RIFF chunk.'));
  }
  if (offset + 8 <= boundary && canRead(bytes, offset + 4, 4)) {
    fields.push(field(bytes, `wav-${chunkId(type)}-type-${offset}`, 'type', 'Type', { offset: offset + 4, length: 4 }, type, 'ASCII identifier', 'The four-byte RIFF chunk identifier.', 'n/a'));
  }
  return fields;
}

function payloadField(
  bytes: Uint8Array,
  id: string,
  offset: number,
  declaredLength: number,
  value: string,
  explanation: string,
  boundary = bytes.length,
): Field | undefined {
  const availableLength = Math.max(0, Math.min(declaredLength, boundary - offset, bytes.length - offset));
  if (availableLength === 0 && (offset > boundary || !canRead(bytes, offset, 0))) return undefined;
  return field(bytes, id, 'payload', 'Payload', { offset, length: availableLength }, value, 'opaque Payload', explanation, 'n/a', 'opaque');
}

function fmtFields(bytes: Uint8Array, offset: number, declaredLength: number, boundary = bytes.length, idSuffix = ''): Field[] {
  const fields = commonChunkFields(bytes, offset, declaredLength, 'fmt ', boundary);
  const dataOffset = offset + 8;
  const structureEnd = Math.min(boundary, bytes.length, offset + 8 + Math.max(0, declaredLength));
  const fieldDefinitions: Array<[string, string, string, number, number, string, Field['endianness']]> = [
    ['audioFormat', 'Audio format', 'unsigned 16-bit integer', 0, 2, 'The audio encoding tag: 1 is PCM and 3 is IEEE float.', 'little-endian'],
    ['channels', 'Channels', 'unsigned 16-bit integer', 2, 2, 'The number of interleaved audio channels.', 'little-endian'],
    ['sampleRate', 'Sample rate', 'unsigned 32-bit integer', 4, 4, 'The number of samples per second.', 'little-endian'],
    ['byteRate', 'Byte rate', 'unsigned 32-bit integer', 8, 4, 'The number of bytes per second in the encoded stream.', 'little-endian'],
    ['blockAlign', 'Block align', 'unsigned 16-bit integer', 12, 2, 'The byte size of one sample frame.', 'little-endian'],
    ['bitsPerSample', 'Bits per sample', 'unsigned 16-bit integer', 14, 2, 'The encoded bit depth of each channel sample.', 'little-endian'],
  ];
  for (const [name, label, representation, relativeOffset, length, explanation, endianness] of fieldDefinitions) {
    const absoluteOffset = dataOffset + relativeOffset;
    if (!canRead(bytes, absoluteOffset, length) || absoluteOffset + length > boundary || relativeOffset + length > declaredLength) {
      const absentOffset = Math.min(structureEnd, Math.max(offset, absoluteOffset));
      fields.push(field(bytes, `wav-fmt-${name}${idSuffix}`, name, label, { offset: absentOffset, length: 0 }, 'absent', 'not present', 'This format value is absent from the available fmt Payload.', 'n/a', 'absent'));
      continue;
    }
    const value = length === 2 ? u16(bytes, absoluteOffset) : u32(bytes, absoluteOffset);
    fields.push(field(bytes, `wav-fmt-${name}${idSuffix}`, name, label, { offset: absoluteOffset, length }, value, representation, explanation, endianness));
  }
  if (declaredLength >= 18 && canRead(bytes, dataOffset + 16, 2) && dataOffset + 18 <= boundary) {
    fields.push(field(bytes, `wav-fmt-extension-size${idSuffix}`, 'extensionSize', 'Extension size', { offset: dataOffset + 16, length: 2 }, u16(bytes, dataOffset + 16), 'unsigned 16-bit integer', 'The optional WAVEFORMATEX extension size.', 'little-endian'));
  }
  return fields;
}

function genericChunk(
  bytes: Uint8Array,
  offset: number,
  declaredLength: number,
  type: string,
  occurrence: number,
  boundary = bytes.length,
  parentId?: string,
): Structure {
  const span = boundedSpanWithin(bytes, offset, 8 + declaredLength, boundary);
  const fields = commonChunkFields(bytes, offset, declaredLength, type, boundary);
  const payload = payloadField(bytes, `wav-${chunkId(type)}-payload-${offset}`, offset + 8, declaredLength, 'opaque bytes', 'HexLens identifies this chunk but does not interpret its content.', boundary);
  if (payload) fields.push(payload);
  return {
    id: `wav-${chunkId(type)}${occurrence > 1 ? `-${occurrence}` : ''}`,
    name: chunkId(type),
    label: `${type} · opaque Payload`,
    kind: 'chunk',
    span,
    fields,
    description: 'A RIFF chunk kept generic by the bounded WAV contract; its Payload remains opaque.',
    ...(parentId ? { parentId } : {}),
  };
}

function fmtStructure(bytes: Uint8Array, offset: number, declaredLength: number, occurrence: number, boundary = bytes.length, parentId?: string): Structure {
  return {
    id: `wav-fmt${occurrence > 1 ? `-${occurrence}` : ''}`,
    name: 'fmt',
    label: 'fmt · format',
    kind: 'chunk',
    span: boundedSpanWithin(bytes, offset, 8 + declaredLength, boundary),
    fields: fmtFields(bytes, offset, declaredLength, boundary, occurrence > 1 ? `-${offset}` : ''),
    description: 'The little-endian format values that describe the audio stream.',
    ...(parentId ? { parentId } : {}),
  };
}

function dataStructure(bytes: Uint8Array, offset: number, declaredLength: number, occurrence: number, boundary = bytes.length, parentId?: string): Structure {
  const fields = commonChunkFields(bytes, offset, declaredLength, 'data', boundary);
  const payload = payloadField(bytes, `wav-data-payload-${offset}`, offset + 8, declaredLength, 'opaque audio sample bytes', 'HexLens identifies audio sample bytes but does not decode them.', boundary);
  if (payload) fields.push(payload);
  return {
    id: `wav-data${occurrence > 1 ? `-${occurrence}` : ''}`,
    name: 'data',
    label: 'data · audio sample Payload',
    kind: 'payload',
    span: boundedSpanWithin(bytes, offset, 8 + declaredLength, boundary),
    fields,
    description: 'The original audio sample bytes, carried as opaque Payload.',
    ...(parentId ? { parentId } : {}),
  };
}

function factStructure(bytes: Uint8Array, offset: number, declaredLength: number, occurrence: number, boundary = bytes.length, parentId?: string): Structure {
  const fields = commonChunkFields(bytes, offset, declaredLength, 'fact', boundary);
  if (declaredLength >= 4 && offset + 12 <= boundary && canRead(bytes, offset + 8, 4)) {
    fields.push(field(bytes, `wav-fact-sample-length-${offset}`, 'sampleLength', 'Sample length', { offset: offset + 8, length: 4 }, u32(bytes, offset + 8), 'unsigned 32-bit integer', 'The number of decoded sample frames reported by this fact chunk.', 'little-endian'));
  } else {
    fields.push(field(bytes, `wav-fact-sample-length-${offset}`, 'sampleLength', 'Sample length', { offset: Math.min(boundary, offset + 8), length: 0 }, 'absent', 'not present', 'The required fact sample-frame count is absent.', 'n/a', 'absent'));
  }
  const extraLength = Math.max(0, declaredLength - 4);
  const payload = extraLength > 0
    ? payloadField(bytes, `wav-fact-payload-${offset}`, offset + 12, extraLength, 'opaque bytes', 'Additional fact bytes are outside the bounded contract and remain opaque.', boundary)
    : undefined;
  if (payload) fields.push(payload);
  return {
    id: `wav-fact${occurrence > 1 ? `-${occurrence}` : ''}`,
    name: 'fact',
    label: 'fact · sample count',
    kind: 'chunk',
    span: boundedSpanWithin(bytes, offset, 8 + declaredLength, boundary),
    fields,
    description: 'An optional fact chunk carrying a decoded sample-frame count for non-PCM or extended audio.',
    ...(parentId ? { parentId } : {}),
  };
}

function listStructure(
  bytes: Uint8Array,
  offset: number,
  declaredLength: number,
  occurrence: number,
  listType?: string,
  boundary = bytes.length,
  parentId?: string,
): Structure {
  const fields = commonChunkFields(bytes, offset, declaredLength, 'LIST', boundary);
  if (declaredLength >= 4 && offset + 12 <= boundary && canRead(bytes, offset + 8, 4)) {
    fields.push(field(bytes, `wav-list-type-${offset}`, 'listType', 'List type', { offset: offset + 8, length: 4 }, listType ?? ascii(bytes, offset + 8, 4), 'ASCII identifier', 'The four-byte LIST payload type.', 'n/a'));
  }
  if (listType !== 'INFO') {
    const payloadLength = Math.max(0, declaredLength - 4);
    const payload = payloadLength > 0
      ? payloadField(bytes, `wav-list-payload-${offset}`, offset + 12, payloadLength, 'opaque bytes', 'This LIST type is outside the declared INFO metadata subset and remains opaque.', boundary)
      : undefined;
    if (payload) fields.push(payload);
  }
  return {
    id: `wav-list${occurrence > 1 ? `-${occurrence}` : ''}`,
    name: 'list',
    label: `LIST${listType ? `/${listType}` : ''} · metadata`,
    kind: 'chunk',
    span: boundedSpanWithin(bytes, offset, 8 + declaredLength, boundary),
    fields,
    description: listType === 'INFO' ? 'An INFO metadata list; declared identifiers are parsed as text Fields.' : 'A generic RIFF LIST container; only LIST/INFO metadata is interpreted.',
    ...(parentId ? { parentId } : {}),
  };
}

function infoStructure(bytes: Uint8Array, offset: number, declaredLength: number, type: string, occurrence: number, boundary = bytes.length, parentId?: string): Structure {
  const metadata = INFO_LABELS[type];
  const fields = commonChunkFields(bytes, offset, declaredLength, type, boundary);
  const availableTextLength = Math.max(0, Math.min(declaredLength, boundary - (offset + 8), bytes.length - (offset + 8)));
  if (metadata && availableTextLength > 0 && availableTextLength <= 8_192) {
    fields.push(field(bytes, `wav-${type.toLowerCase()}-value-${offset}`, metadata.name, metadata.label, { offset: offset + 8, length: availableTextLength }, text(bytes, offset + 8, availableTextLength), 'INFO text', `The ${type} identifier's text value from the bounded LIST/INFO subset.`, 'n/a'));
  } else if (metadata && availableTextLength === 0) {
    fields.push(field(bytes, `wav-${type.toLowerCase()}-value-${offset}`, metadata.name, metadata.label, { offset: Math.min(boundary, offset + 8), length: 0 }, 'absent', 'not present', `The ${type} identifier has no available text Payload.`, 'n/a', 'absent'));
  }
  const payload = (metadata && availableTextLength > 8_192) || (!metadata && availableTextLength > 0)
    ? payloadField(bytes, `wav-${chunkId(type)}-payload-${offset}`, offset + 8, availableTextLength, 'opaque bytes', 'This INFO identifier is outside the declared metadata subset and remains opaque.', boundary)
    : undefined;
  if (payload) fields.push(payload);
  return {
    id: `wav-${type.toLowerCase()}${occurrence > 1 ? `-${occurrence}` : ''}-${offset}`,
    name: type.toLowerCase(),
    label: metadata ? `${type} · ${metadata.label.toLowerCase()}` : `${type} · opaque Payload`,
    kind: 'chunk',
    span: boundedSpanWithin(bytes, offset, 8 + declaredLength, boundary),
    fields,
    description: metadata ? `The ${type} identifier from a RIFF/LIST/INFO metadata list.` : 'An INFO identifier kept generic until the bounded WAV contract defines it.',
    ...(parentId ? { parentId } : {}),
  };
}

function riffStructure(bytes: Uint8Array, declaredLength: number, containerEnd: number): Structure {
  const rootSpan = boundedSpan(bytes, 0, Math.max(12, containerEnd));
  const fields: Field[] = [];
  if (canRead(bytes, 4, 4)) {
    fields.push(field(bytes, 'wav-riff-size', 'chunkSize', 'Chunk size', { offset: 4, length: 4 }, declaredLength, 'unsigned 32-bit integer', 'The little-endian size of the RIFF form after the first eight bytes.'));
  }
  if (canRead(bytes, 8, 4)) {
    fields.push(field(bytes, 'wav-riff-form', 'formType', 'Form type', { offset: 8, length: 4 }, 'WAVE', 'ASCII identifier', 'The form identifier that selects the RIFF/WAVE Format.', 'n/a'));
  }
  return {
    id: 'wav-riff',
    name: 'riff',
    label: 'RIFF/WAVE · container',
    kind: 'header',
    span: rootSpan,
    fields,
    description: 'The RIFF container and WAVE form identifier at the start of the file.',
  };
}

function structureForChunk(
  bytes: Uint8Array,
  offset: number,
  declaredLength: number,
  type: string,
  occurrence: number,
  boundary = bytes.length,
  parentId?: string,
): Structure {
  if (type === 'fmt ') return fmtStructure(bytes, offset, declaredLength, occurrence, boundary, parentId);
  if (type === 'data') return dataStructure(bytes, offset, declaredLength, occurrence, boundary, parentId);
  if (type === 'fact') return factStructure(bytes, offset, declaredLength, occurrence, boundary, parentId);
  return genericChunk(bytes, offset, declaredLength, type, occurrence, boundary, parentId);
}

function parseInfoChildren(
  bytes: Uint8Array,
  listOffset: number,
  listLength: number,
  boundary: number,
  structures: Structure[],
  diagnostics: DiagnosticCollector,
  unmapped: UnmappedSpan[],
  occurrences: Map<string, number>,
  parentId: string,
): void {
  const payloadStart = listOffset + 8;
  const listEnd = Math.min(boundary, listOffset + 8 + listLength);
  if (listLength < 4 || !canRead(bytes, payloadStart, 4)) return;
  let offset = payloadStart + 4;
  while (offset < listEnd) {
    if (structures.length >= WAV_LIMITS.maxStructures) {
      diagnostics.add(diagnostic(
        WAV_DIAGNOSTIC_CODES.limitReached,
        'error',
        'The Structure safety limit was reached while reading nested LIST/INFO Payload; the Inspection is incomplete.',
        { offset: Math.min(offset, bytes.length), length: 0 },
      ));
      return;
    }
    if (diagnostics.capped) return;
    const previousOffset = offset;
    const remaining = listEnd - offset;
    if (remaining < 8) {
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.truncatedChunk, 'error', 'A LIST/INFO metadata chunk header is incomplete at the end of the list.', { offset, length: remaining }));
      addUnmapped(unmapped, bytes, { offset, length: remaining }, 'Bytes left after an incomplete LIST/INFO chunk header.');
      return;
    }
    const type = ascii(bytes, offset, 4);
    const declaredLength = u32(bytes, offset + 4);
    const payloadEnd = offset + 8 + declaredLength;
    if (payloadEnd > listEnd || payloadEnd < offset + 8) {
      const available = Math.max(0, listEnd - offset);
      const occurrence = (occurrences.get(type) ?? 0) + 1;
      occurrences.set(type, occurrence);
      structures.push(INFO_LABELS[type]
        ? infoStructure(bytes, offset, declaredLength, type, occurrence, listEnd, parentId)
        : genericChunk(bytes, offset, declaredLength, type, occurrence, listEnd, parentId));
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.truncatedChunk, 'error', `The ${type || 'LIST/INFO'} metadata chunk declares bytes beyond the list boundary.`, { offset, length: available }));
      return;
    }
    const occurrence = (occurrences.get(type) ?? 0) + 1;
    occurrences.set(type, occurrence);
    structures.push(INFO_LABELS[type]
      ? infoStructure(bytes, offset, declaredLength, type, occurrence, listEnd, parentId)
      : genericChunk(bytes, offset, declaredLength, type, occurrence, listEnd, parentId));
    offset = payloadEnd;
    if (declaredLength % 2 === 1) {
      if (offset >= listEnd || offset >= bytes.length) {
        diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidAlignment, 'error', 'An odd-sized LIST/INFO chunk is missing its required padding byte.', { offset, length: 0 }));
        return;
      }
      addUnmapped(unmapped, bytes, { offset, length: 1 }, 'Required RIFF padding byte after an odd-sized LIST/INFO chunk.');
      offset += 1;
    }
    if (!Number.isSafeInteger(offset) || offset <= previousOffset) {
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidLength, 'error', 'LIST/INFO parsing did not advance safely; recovery stopped.', { offset: previousOffset, length: Math.max(0, listEnd - previousOffset) }));
      return;
    }
  }
}

function unsupportedRootMessage(bytes: Uint8Array): string {
  if (matchesAscii(bytes, 0, RF64_SIGNATURE)) return 'RF64 is outside the bounded RIFF/WAVE contract; only little-endian RIFF/WAVE is supported.';
  if (matchesAscii(bytes, 0, RIFX_SIGNATURE)) return 'RIFX uses a big-endian RIFF form and is outside the bounded RIFF/WAVE contract.';
  if (matchesAscii(bytes, 0, RIFF_SIGNATURE)) return 'The RIFF container is not a RIFF/WAVE file.';
  return 'The file does not begin with the RIFF/WAVE signature.';
}

function addFmtDiagnostics(structure: Structure, diagnostics: DiagnosticCollector): number | undefined {
  const audioFormat = structure.fields.find((item) => item.name === 'audioFormat');
  if (!audioFormat || structure.span.length < 24) {
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidLength, 'error', 'The fmt chunk must contain the 16-byte PCM or IEEE-float format Payload.', structure.span));
    return undefined;
  }
  const formatTag = typeof audioFormat.value === 'number' ? audioFormat.value : undefined;
  if (formatTag !== WAVE_FORMAT_PCM && formatTag !== WAVE_FORMAT_IEEE_FLOAT) {
    audioFormat.status = 'invalid';
    const detail = formatTag === WAVE_FORMAT_EXTENSIBLE ? 'WAVE_FORMAT_EXTENSIBLE' : `format tag ${formatTag ?? 'unknown'}`;
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.unsupportedFormatTag, 'error', `${detail} is outside the bounded WAV contract; PCM (1) and IEEE float (3) are supported.`, audioFormat.span));
    return formatTag;
  }

  const byName = (name: string): Field | undefined => structure.fields.find((item) => item.name === name);
  const channels = byName('channels');
  const sampleRate = byName('sampleRate');
  const byteRate = byName('byteRate');
  const blockAlign = byName('blockAlign');
  const bitsPerSample = byName('bitsPerSample');
  const numeric = (item: Field | undefined): number | undefined => typeof item?.value === 'number' ? item.value : undefined;
  const channelCount = numeric(channels);
  const rate = numeric(sampleRate);
  const bits = numeric(bitsPerSample);
  const actualBlockAlign = numeric(blockAlign);
  const actualByteRate = numeric(byteRate);
  const markInvalid = (item: Field | undefined): void => {
    if (item) item.status = 'invalid';
  };
  const expectedBlockAlign = channelCount !== undefined && bits !== undefined && channelCount > 0 && bits > 0
    ? channelCount * Math.ceil(bits / 8)
    : undefined;
  if (channelCount !== undefined && channelCount < 1) {
    markInvalid(channels);
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidConsistency, 'error', 'The fmt chunk must declare at least one channel.', channels?.span ?? structure.span));
  }
  if (rate !== undefined && rate < 1) {
    markInvalid(sampleRate);
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidConsistency, 'error', 'The fmt chunk must declare a positive sample rate.', sampleRate?.span ?? structure.span));
  }
  if (bits !== undefined && (bits < 1 || bits % 8 !== 0)) {
    markInvalid(bitsPerSample);
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidConsistency, 'error', 'Bits per sample must be a positive whole number of bytes for PCM or IEEE float.', bitsPerSample?.span ?? structure.span));
  }
  if (expectedBlockAlign !== undefined && actualBlockAlign !== expectedBlockAlign) {
    markInvalid(blockAlign);
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidConsistency, 'error', `Block align ${actualBlockAlign ?? 'unknown'} does not match ${channelCount} channel(s) × ${Math.ceil((bits ?? 0) / 8)} byte(s).`, blockAlign?.span ?? structure.span));
  }
  if (rate !== undefined && expectedBlockAlign !== undefined) {
    const expectedByteRate = rate * expectedBlockAlign;
    if (actualByteRate !== expectedByteRate) {
      markInvalid(byteRate);
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidConsistency, 'error', `Byte rate ${actualByteRate ?? 'unknown'} does not match sample rate × block align (${expectedByteRate}).`, byteRate?.span ?? structure.span));
    }
  }
  return formatTag;
}

function buildUnmappedSpans(length: number, structures: Structure[], explicit: UnmappedSpan[] = []): UnmappedSpan[] {
  const explicitSpans = explicit
    .map((item) => {
      const offset = Math.max(0, Math.min(length, Math.trunc(item.span.offset)));
      const span = { offset, length: Math.max(0, Math.min(length - offset, Math.trunc(item.span.length))) };
      return { ...item, span, offset: span.offset, length: span.length };
    })
    .filter((item) => item.span.length > 0)
    .sort((a, b) => a.span.offset - b.span.offset);
  const covered = structures
    .map((structure) => structure.span)
    .filter((target) => target.length > 0)
    .sort((a, b) => a.offset - b.offset);
  const result: UnmappedSpan[] = [...explicitSpans];
  const appendGeneric = (start: number, end: number): void => {
    if (end <= start) return;
    let byteSpans: ByteSpan[] = [{ offset: start, length: end - start }];
    for (const explicitSpan of explicitSpans) {
      const explicitStart = explicitSpan.span.offset;
      const explicitEnd = explicitStart + explicitSpan.span.length;
      byteSpans = byteSpans.flatMap((byteSpan) => {
        const byteSpanEnd = byteSpan.offset + byteSpan.length;
        if (explicitEnd <= byteSpan.offset || explicitStart >= byteSpanEnd) return [byteSpan];
        const pieces: ByteSpan[] = [];
        if (byteSpan.offset < explicitStart) pieces.push({ offset: byteSpan.offset, length: explicitStart - byteSpan.offset });
        if (explicitEnd < byteSpanEnd) pieces.push({ offset: explicitEnd, length: byteSpanEnd - explicitEnd });
        return pieces;
      });
    }
    for (const byteSpan of byteSpans) {
      result.push({ id: `wav-unmapped-${result.length + 1}`, span: byteSpan, ...byteSpan, reason: 'Bytes not claimed by a parsed Structure.' });
    }
  };
  let cursor = 0;
  for (const target of covered) {
    const start = Math.max(0, Math.min(length, target.offset));
    const end = Math.max(start, Math.min(length, target.offset + target.length));
    appendGeneric(cursor, start);
    cursor = Math.max(cursor, end);
  }
  appendGeneric(cursor, length);
  return result.sort((a, b) => a.span.offset - b.span.offset);
}

function attachDiagnosticCodes(structures: Structure[], diagnostics: Diagnostic[]): void {
  for (const item of diagnostics) {
    const candidates = structures
      .filter((structure) => {
        const start = structure.span.offset;
        const end = start + structure.span.length;
        const diagnosticStart = item.span.offset;
        const diagnosticEnd = diagnosticStart + item.span.length;
        return diagnosticStart >= start && diagnosticStart <= end
          && (item.span.length === 0 || diagnosticEnd <= end);
      })
      .sort((a, b) => a.span.length - b.span.length || a.span.offset - b.span.offset);
    const owner = candidates[0];
    if (!owner) continue;
    owner.diagnosticCodes = owner.diagnosticCodes?.includes(item.code)
      ? owner.diagnosticCodes
      : [...(owner.diagnosticCodes ?? []), item.code];
  }
}

function inspectionResult(
  id: string,
  bytes: Uint8Array,
  sourceName: string,
  structures: Structure[],
  diagnostics: Diagnostic[],
  explicitUnmapped: UnmappedSpan[] = [],
  status?: Inspection['status'],
): Inspection {
  const inferredStatus: Inspection['status'] = diagnostics.some((item) => item.code === WAV_DIAGNOSTIC_CODES.limitReached)
    ? 'limit-reached'
    : diagnostics.some((item) => item.code === WAV_DIAGNOSTIC_CODES.parseAborted)
      ? 'aborted'
      : diagnostics.some((item) => item.code === WAV_DIAGNOSTIC_CODES.unsupportedFormat)
        ? 'unsupported'
        : diagnostics.some((item) => item.severity === 'error') ? 'partial' : 'ready';
  const unmapped = buildUnmappedSpans(bytes.length, structures, explicitUnmapped);
  attachDiagnosticCodes(structures, diagnostics);
  const resolvedStatus = status ?? inferredStatus;
  const complete = resolvedStatus === 'ready' && !diagnostics.some((item) => item.severity === 'error');
  return {
    id,
    format: 'wav',
    state: complete ? 'ready' : 'partial',
    status: resolvedStatus,
    complete,
    termination: complete ? 'complete' : resolvedStatus === 'limit-reached' ? 'limit-reached' : resolvedStatus === 'unsupported' ? 'unsupported' : resolvedStatus === 'aborted' ? 'aborted' : 'partial',
    limitReached: resolvedStatus === 'limit-reached',
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

export function inspectWav(input: Uint8Array, sourceName = 'hexlens-sample.wav', metadata: WavInspectionMetadata = {}): Inspection {
  // Own the source view so callers cannot mutate an active Inspection while a
  // worker/session is deciding whether its result is still current.
  const bytes = new Uint8Array(input);
  const diagnostics = createDiagnosticCollector();
  const structures: Structure[] = [];
  const unmappedSpans: UnmappedSpan[] = [];
  const inspectionId = `wav-${bytes.byteLength}-${bytes[0] ?? 0}`;

  if (!hasWavSignature(bytes)) {
    const message = unsupportedRootMessage(bytes);
    return inspectionResult(
      inspectionId,
      bytes,
      sourceName,
      [],
      [diagnostic(WAV_DIAGNOSTIC_CODES.unsupportedFormat, 'error', message, { offset: 0, length: Math.min(bytes.length, 12) })],
      unmappedSpans,
      'unsupported',
    );
  }

  if (bytes.length > WAV_LIMITS.maxBytes) {
    if (bytes.length >= 12 && structures.length < WAV_LIMITS.maxStructures) structures.push(riffStructure(bytes, u32(bytes, 4), Math.min(bytes.length, 12)));
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.limitReached, 'error', 'The WAV exceeds the 25 MiB local safety limit; only the RIFF root was inspected.', { offset: WAV_LIMITS.maxBytes, length: 0 }));
    return inspectionResult(inspectionId, bytes, sourceName, structures, diagnostics.items, unmappedSpans, 'limit-reached');
  }

  const declaredLength = u32(bytes, 4);
  const expectedFileLength = Number.isSafeInteger(declaredLength + 8) ? declaredLength + 8 : Number.MAX_SAFE_INTEGER;
  const containerEnd = Math.min(bytes.length, Math.max(12, expectedFileLength));
  structures.push(riffStructure(bytes, declaredLength, containerEnd));

  if (expectedFileLength > bytes.length) {
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.truncatedRiff, 'error', 'The RIFF container declares bytes beyond the file boundary.', { offset: 4, length: 4 }));
  } else if (expectedFileLength < bytes.length) {
    diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidLength, 'warning', 'The RIFF container ends before the available file bytes.', { offset: 4, length: 4 }));
    addUnmapped(unmappedSpans, bytes, { offset: Math.max(12, expectedFileLength), length: bytes.length - Math.max(12, expectedFileLength) }, 'Bytes beyond the declared RIFF container length.');
  }

  let offset = 12;
  const occurrences = new Map<string, number>();
  let foundFmt = false;
  let foundData = false;
  let foundFact = false;
  let formatTag: number | undefined;
  while (offset < containerEnd) {
    if (metadata.signal?.aborted) {
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.parseAborted, 'warning', 'Parsing was canceled before the next RIFF chunk could be inspected.', { offset: Math.min(offset, bytes.length), length: 0 }));
      break;
    }
    if (diagnostics.capped) break;
    if (structures.length >= WAV_LIMITS.maxStructures) {
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.limitReached, 'error', 'The Structure safety limit was reached; parsing stopped before more chunks could be claimed.', { offset: Math.min(offset, bytes.length), length: 0 }));
      break;
    }

    const previousOffset = offset;
    const remaining = containerEnd - offset;
    if (remaining < 8) {
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.truncatedChunk, 'error', 'A RIFF chunk header is incomplete at the end of the file.', { offset, length: remaining }));
      addUnmapped(unmappedSpans, bytes, { offset, length: remaining }, 'Bytes left after an incomplete RIFF chunk header.');
      break;
    }

    const type = ascii(bytes, offset, 4);
    const declaredChunkLength = u32(bytes, offset + 4);
    const envelopeLength = declaredChunkLength + 8;
    const chunkEnd = offset + envelopeLength;
    const safeEnvelope = Number.isSafeInteger(envelopeLength)
      && Number.isSafeInteger(chunkEnd)
      && envelopeLength >= 8
      && chunkEnd > offset;
    const chunkFits = safeEnvelope && chunkEnd <= containerEnd;
    const occurrence = (occurrences.get(type) ?? 0) + 1;
    occurrences.set(type, occurrence);
    if (!safeEnvelope || !chunkFits) {
      const available = Math.max(0, containerEnd - offset);
      const partial = type === 'fmt '
        ? fmtStructure(bytes, offset, declaredChunkLength, occurrence, containerEnd)
        : type === 'data'
          ? dataStructure(bytes, offset, declaredChunkLength, occurrence, containerEnd, 'wav-riff')
          : type === 'fact'
            ? factStructure(bytes, offset, declaredChunkLength, occurrence, containerEnd, 'wav-riff')
            : genericChunk(bytes, offset, declaredChunkLength, type, occurrence, containerEnd, 'wav-riff');
      partial.parentId = 'wav-riff';
      structures.push(partial);
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidLength, 'error', `The ${type || 'RIFF'} chunk declares an unsafe or impossible length; recovery stopped at this boundary.`, { offset, length: Math.min(4, available) }));
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.truncatedChunk, 'error', `The ${type || 'RIFF'} chunk declares bytes beyond the ${expectedFileLength > bytes.length ? 'file' : 'RIFF container'} boundary.`, { offset, length: available }));
      break;
    }

    const listType = type === 'LIST' && declaredChunkLength >= 4 && canRead(bytes, offset + 8, 4)
      ? ascii(bytes, offset + 8, 4)
      : undefined;
    const structure = type === 'LIST'
      ? listStructure(bytes, offset, declaredChunkLength, occurrence, listType, containerEnd, 'wav-riff')
      : structureForChunk(bytes, offset, declaredChunkLength, type, occurrence, containerEnd, 'wav-riff');
    structures.push(structure);
    if (type === 'fmt ') {
      foundFmt = true;
      formatTag = addFmtDiagnostics(structure, diagnostics);
    }
    if (type === 'data') foundData = true;
    if (type === 'fact') foundFact = true;
    if (type === 'LIST' && listType === 'INFO') {
      parseInfoChildren(bytes, offset, declaredChunkLength, containerEnd, structures, diagnostics, unmappedSpans, occurrences, structure.id);
    }

    offset = chunkEnd;
    if (declaredChunkLength % 2 === 1) {
      if (offset >= containerEnd || offset >= bytes.length) {
        diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidAlignment, 'error', 'An odd-sized RIFF chunk is missing its required padding byte.', { offset, length: 0 }));
        break;
      }
      addUnmapped(unmappedSpans, bytes, { offset, length: 1 }, 'Required RIFF padding byte after an odd-sized chunk.');
      offset += 1;
    }
    if (!Number.isSafeInteger(offset) || offset <= previousOffset) {
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.invalidLength, 'error', 'RIFF parsing did not advance safely; recovery stopped.', { offset: previousOffset, length: Math.max(0, containerEnd - previousOffset) }));
      break;
    }
  }

  if (!diagnostics.capped && !metadata.signal?.aborted) {
    if (!foundFmt) diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.missingFmt, 'error', 'The RIFF/WAVE file is missing its required fmt chunk.', { offset: 12, length: Math.max(0, containerEnd - 12) }));
    if (!foundData) diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.missingData, 'error', 'The RIFF/WAVE file is missing its required data chunk.', { offset: 12, length: Math.max(0, containerEnd - 12) }));
    if (formatTag === WAVE_FORMAT_IEEE_FLOAT && !foundFact) {
      diagnostics.add(diagnostic(WAV_DIAGNOSTIC_CODES.missingFact, 'error', 'IEEE-float audio requires a fact chunk with the decoded sample-frame count.', { offset: Math.min(containerEnd, bytes.length), length: 0 }));
    }
  }

  const suffix = sourceName.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (suffix && suffix !== 'wav' && !diagnostics.capped) {
    diagnostics.items.unshift(diagnostic(WAV_DIAGNOSTIC_CODES.formatNameMismatch, 'note', 'The source name suffix does not match the RIFF/WAVE signature. Content determined this Format.', { offset: 0, length: 12 }));
  }

  const status: Inspection['status'] = diagnostics.capped || diagnostics.items.some((item) => item.code === WAV_DIAGNOSTIC_CODES.limitReached)
    ? 'limit-reached'
    : metadata.signal?.aborted
      ? 'aborted'
      : diagnostics.items.some((item) => item.severity === 'error') ? 'partial' : 'ready';
  return inspectionResult(inspectionId, bytes, sourceName, structures, diagnostics.items, unmappedSpans, status);
}

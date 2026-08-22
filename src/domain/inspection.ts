export type FormatId = 'png' | 'wav' | 'unknown';

/**
 * The parser's compatibility `state` remains ready/partial for the first
 * format-contract consumers. `status` carries the reason a result is not a
 * complete semantic Inspection so the UI and future adapters can distinguish
 * unsupported input, safety caps, cancellation, and application failures.
 */
export type InspectionStatus =
  | 'ready'
  | 'partial'
  | 'unsupported'
  | 'limit-reached'
  | 'aborted'
  | 'application-error';

export type InspectionTermination =
  | 'complete'
  | 'partial'
  | 'unsupported'
  | 'limit-reached'
  | 'aborted'
  | 'application-error';

/** Provisional values from the product safety contract. */
export const INSPECTION_LIMITS = Object.freeze({
  maxBytes: 25 * 1024 * 1024,
  maxStructures: 100_000,
  maxDiagnostics: 1_000,
  slowNoticeMs: 2_000,
  cancellationDeadlineMs: 250,
});

/** Generic Diagnostic identities shared by all Format adapters. */
export const GENERIC_DIAGNOSTIC_CODES = Object.freeze({
  unsupportedFormat: 'unsupported_format',
  limitReached: 'limit_reached',
  parseAborted: 'parse_aborted',
  extensionMismatch: 'extension_mismatch',
} as const);

export const GENERIC_DIAGNOSTIC_SPAN_POLICY: Readonly<Record<string, string>> = Object.freeze({
  unsupported_format: 'The available signature prefix, or the first 8 bytes when present.',
  limit_reached: 'The first offset that could not be safely inspected.',
  parse_aborted: 'The first offset not inspected when cancellation was observed.',
  extension_mismatch: 'The format signature or root identifier.',
});

export interface ByteSpan {
  offset: number;
  length: number;
}

export type DiagnosticSeverity = 'note' | 'warning' | 'error';

export type FieldValueStatus = 'interpreted' | 'opaque' | 'invalid';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  span: ByteSpan;
}

export interface Field {
  id: string;
  name: string;
  label: string;
  span: ByteSpan;
  encodedBytes: number[];
  value: string | number;
  representation: string;
  endianness?: 'big-endian' | 'little-endian' | 'n/a';
  explanation: string;
  /** Opaque or invalid values remain visible without being presented as decoded. */
  status?: FieldValueStatus;
  payloadId?: string;
}

export interface Payload {
  id: string;
  structureId: string;
  span: ByteSpan;
  /** Payload bytes are intentionally not copied into the semantic model. */
  encoding: 'opaque';
  label: string;
  description: string;
}

/**
 * A value whose meaning occupies only some bits of a byte-level Field.
 * Bit fields never replace the Byte span that contains them: Selection keeps
 * operating on complete bytes and the mask is an additional explanation.
 */
export interface BitField {
  id: string;
  name: string;
  label: string;
  span: ByteSpan;
  mask: number;
  value?: string | number;
  fieldId?: string;
  explanation?: string;
}

/** A calculated value that points back to its source Fields and owns no bytes. */
export interface DerivedValue {
  id: string;
  name: string;
  label: string;
  value: string | number;
  sourceFieldIds: string[];
  explanation: string;
}

/** A byte span not claimed by a parsed Structure or Field. */
export interface UnmappedSpan {
  id: string;
  span: ByteSpan;
  /** Duplicated scalar access keeps adapters simple while span remains canonical. */
  offset: number;
  length: number;
  reason: string;
  label?: string;
}

export interface Structure {
  id: string;
  name: string;
  label: string;
  kind: 'header' | 'chunk' | 'payload';
  span: ByteSpan;
  fields: Field[];
  description: string;
  /** Format source order occurrence, starting at one for each structure name. */
  occurrence?: number;
  /** Four-byte PNG type when this is a chunk; absent for the signature. */
  type?: string;
  payload?: Payload;
  diagnosticCodes?: string[];
  parentId?: string;
  relatedIds?: string[];
}

export interface Inspection {
  id: string;
  format: FormatId;
  /** Stable compatibility state retained for the original PNG/WAV contract. */
  state: 'ready' | 'partial';
  /** More precise result state for UI, job/session, and future adapters. */
  status?: InspectionStatus;
  /** False for a partial result, including a safety-cap result. */
  complete: boolean;
  /** Why a result stopped, kept separate from the stable ready/partial state. */
  termination: InspectionTermination;
  limitReached: boolean;
  sourceName: string;
  bytes: Uint8Array;
  structures: Structure[];
  fields: Field[];
  payloads: Payload[];
  unmappedSpans: UnmappedSpan[];
  /** Compatibility alias for consumers that use the shorter domain term. */
  unmapped: UnmappedSpan[];
  bitFields: BitField[];
  derivedValues: DerivedValue[];
  diagnostics: Diagnostic[];
}

export function spanContains(outer: ByteSpan, inner: ByteSpan): boolean {
  return inner.offset >= outer.offset && inner.offset + inner.length <= outer.offset + outer.length;
}

export function spanIntersects(a: ByteSpan, b: ByteSpan): boolean {
  return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

export function spanLabel(span: ByteSpan): string {
  const end = span.offset + Math.max(span.length, 1) - 1;
  return `${span.offset.toString(16).toUpperCase().padStart(2, '0')}-${end.toString(16).toUpperCase().padStart(2, '0')}`;
}

function rawInspectionId(bytes: Uint8Array, status: InspectionStatus): string {
  let hash = 2166136261;
  // Raw fallback identity is deterministic but bounded even when the source
  // exceeds the semantic safety budget.
  const prefixLength = Math.min(bytes.length, 1_048_576);
  for (let index = 0; index < prefixLength; index += 1) hash = Math.imul(hash ^ bytes[index], 16777619);
  for (let index = Math.max(prefixLength, bytes.length - 1_024); index < bytes.length; index += 1) hash = Math.imul(hash ^ bytes[index], 16777619);
  return `raw-${status}-${bytes.length}-${(hash >>> 0).toString(16)}`;
}

function rawUnmapped(bytes: Uint8Array, reason: string): UnmappedSpan[] {
  if (bytes.length === 0) return [];
  const span = { offset: 0, length: bytes.length };
  return [{ id: 'raw-unmapped-1', span, offset: span.offset, length: span.length, label: 'Unmapped span', reason }];
}

/**
 * Construct a semantic-free Inspection for unknown input or a safe fallback.
 * The byte grid can still provide bounded navigation, but no parser claim is
 * invented after unsupported input or an application failure.
 */
export function createRawInspection(
  input: Uint8Array,
  sourceName: string,
  status: Exclude<InspectionStatus, 'ready' | 'partial'>,
  message?: string,
): Inspection {
  const bytes = new Uint8Array(input);
  const diagnostics: Diagnostic[] = [];
  if (status === 'unsupported') {
    diagnostics.push({
      code: GENERIC_DIAGNOSTIC_CODES.unsupportedFormat,
      severity: 'error',
      message: message ?? 'The file does not match a supported Format. The raw bytes remain available without semantic parsing.',
      span: { offset: 0, length: Math.min(bytes.length, 8) },
    });
  } else if (status === 'limit-reached') {
    diagnostics.push({
      code: GENERIC_DIAGNOSTIC_CODES.limitReached,
      severity: 'error',
      message: message ?? 'The local safety limit stopped semantic parsing before the file was complete.',
      span: { offset: Math.min(bytes.length, INSPECTION_LIMITS.maxBytes), length: 0 },
    });
  } else if (status === 'aborted') {
    diagnostics.push({
      code: GENERIC_DIAGNOSTIC_CODES.parseAborted,
      severity: 'warning',
      message: message ?? 'Parsing was canceled before semantic output was complete.',
      span: { offset: Math.min(bytes.length, INSPECTION_LIMITS.maxBytes), length: 0 },
    });
  }

  const unmappedSpans = rawUnmapped(bytes, status === 'application-error'
    ? 'The parser failed before any semantic Structure could be trusted.'
    : 'Bytes are available for raw inspection because no complete semantic Structure is available.');
  const complete = false;
  return {
    id: rawInspectionId(bytes, status),
    format: 'unknown',
    state: 'partial',
    status,
    complete,
    termination: status,
    limitReached: status === 'limit-reached',
    sourceName,
    bytes,
    structures: [],
    fields: [],
    payloads: [],
    unmappedSpans,
    unmapped: unmappedSpans,
    bitFields: [],
    derivedValues: [],
    diagnostics,
  };
}

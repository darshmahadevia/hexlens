/**
 * The shared Inspection vocabulary. Format adapters may add detail, but the
 * views consume these byte-span-shaped records rather than format-specific
 * projections.
 */
export type FormatId = 'png';

export interface ByteSpan {
  offset: number;
  length: number;
}

export type DiagnosticSeverity = 'note' | 'warning' | 'error';

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  /** The actual affected span, or a zero-length expected span. */
  span: ByteSpan;
}

export type FieldValueStatus = 'interpreted' | 'opaque' | 'invalid';

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

export interface UnmappedSpan {
  id: string;
  span: ByteSpan;
  /** Duplicated scalar access keeps adapters simple while span remains canonical. */
  offset: number;
  length: number;
  reason: string;
}

export interface BitField {
  id: string;
  name: string;
  label: string;
  span: ByteSpan;
  mask: number;
  value: number;
  explanation: string;
}

export interface DerivedValue {
  id: string;
  name: string;
  label: string;
  value: string | number;
  representation: string;
  sourceFieldIds: string[];
  explanation: string;
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
  state: 'ready' | 'partial';
  /** False for a partial result, including a safety-cap result. */
  complete: boolean;
  /** Why a result stopped, kept separate from the stable ready/partial state. */
  termination: 'complete' | 'partial' | 'limit-reached';
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

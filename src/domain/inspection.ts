export type FormatId = 'png' | 'wav';

export interface ByteSpan {
  offset: number;
  length: number;
}

export type DiagnosticSeverity = 'note' | 'warning' | 'error';

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
}

export interface Structure {
  id: string;
  name: string;
  label: string;
  kind: 'header' | 'chunk' | 'payload';
  span: ByteSpan;
  fields: Field[];
  description: string;
}

export interface Inspection {
  id: string;
  format: FormatId;
  state: 'ready' | 'partial';
  sourceName: string;
  bytes: Uint8Array;
  structures: Structure[];
  diagnostics: Diagnostic[];
}

export function spanContains(outer: ByteSpan, inner: ByteSpan): boolean {
  return inner.offset >= outer.offset && inner.offset + inner.length <= outer.offset + outer.length;
}

export function spanIntersects(a: ByteSpan, b: ByteSpan): boolean {
  return a.offset < b.offset + b.length && b.offset < a.offset + a.length;
}

export function spanLabel(span: ByteSpan): string {
  const end = span.offset + span.length - 1;
  return `${span.offset.toString(16).toUpperCase().padStart(2, '0')}-${end.toString(16).toUpperCase().padStart(2, '0')}`;
}

import type {
  BitField,
  ByteSpan,
  DerivedValue,
  Field,
  Inspection,
  Structure,
  UnmappedSpan,
} from './inspection.ts';
import { spanContains, spanIntersects } from './inspection.ts';

export const BYTES_PER_ROW = 16;
export const ASCII_REPLACEMENT = '·';
export const MAX_COPY_BYTES = 1024 * 1024;

export type OffsetMode = 'hex' | 'decimal';

export interface ByteGridRow {
  index: number;
  offset: number;
  values: number[];
  ascii: string;
}

export interface OffsetParseSuccess {
  ok: true;
  offset: number;
}

export interface OffsetParseFailure {
  ok: false;
  message: string;
}

export type OffsetParseResult = OffsetParseSuccess | OffsetParseFailure;

export interface ByteOwnership {
  kind: 'field' | 'structure' | 'unmapped' | 'unowned';
  id?: string;
  label: string;
  structureId?: string;
  structureLabel?: string;
  fieldId?: string;
  fieldLabel?: string;
  span?: ByteSpan;
}

export interface OwnershipIndex {
  structures: Structure[];
  fields: Array<Field & { structureId: string; structureLabel: string }>;
  unmapped: UnmappedSpan[];
  cache: Map<number, ByteOwnership>;
}

export interface SelectionResolution {
  selection: ByteSpan;
  structure?: Structure;
  field?: Field;
  intersectingFields: Field[];
  bitFields: BitField[];
  derivedValues: DerivedValue[];
  unmapped?: UnmappedSpan;
}

export interface CopyResult {
  ok: boolean;
  method: 'clipboard' | 'fallback' | 'none';
  message: string;
}

export interface CopyDependencies {
  clipboard?: { writeText(value: string): Promise<void> };
  document?: {
    body?: { appendChild(node: unknown): unknown };
    createElement(tagName: string): {
      value: string;
      setAttribute(name: string, value: string): void;
      style: { cssText: string };
      select(): void;
      remove(): void;
    };
    execCommand?(command: string): boolean;
  };
}

export function rowCount(byteLength: number): number {
  return Math.ceil(Math.max(0, byteLength) / BYTES_PER_ROW);
}

export function offsetWidth(byteLength: number): number {
  const largestOffset = Math.max(0, byteLength - 1);
  const digits = largestOffset === 0 ? 1 : Math.ceil(Math.log(largestOffset + 1) / Math.log(16));
  return Math.max(4, digits);
}

export function formatOffset(offset: number, byteLength = offset + 1): string {
  return Math.max(0, Math.trunc(offset)).toString(16).toUpperCase().padStart(offsetWidth(byteLength), '0');
}

export function formatDecimalOffset(offset: number): string {
  return Math.max(0, Math.trunc(offset)).toLocaleString('en-US');
}

export function formatByte(value: number): string {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

export function printableAscii(value: number): string {
  return value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : ASCII_REPLACEMENT;
}

export function asciiLabel(value: number): string {
  return value >= 0x20 && value <= 0x7e
    ? `printable ASCII ${JSON.stringify(String.fromCharCode(value))}`
    : `non-printable byte, shown as ${ASCII_REPLACEMENT}`;
}

export function getRow(bytes: Uint8Array | number[], index: number): ByteGridRow {
  const start = Math.max(0, Math.trunc(index)) * BYTES_PER_ROW;
  const values = Array.from(bytes.slice(start, start + BYTES_PER_ROW));
  return {
    index: Math.max(0, Math.trunc(index)),
    offset: start,
    values,
    ascii: values.map(printableAscii).join(''),
  };
}

export function buildRows(bytes: Uint8Array | number[]): ByteGridRow[] {
  return Array.from({ length: rowCount(bytes.length) }, (_, index) => getRow(bytes, index));
}

export function parseOffset(input: string, mode: OffsetMode, byteLength: number): OffsetParseResult {
  const value = input.trim();
  if (value.length === 0) return { ok: false, message: 'Enter an offset to go to.' };
  if (byteLength <= 0) return { ok: false, message: 'This Inspection has no bytes to navigate.' };

  const isHex = mode === 'hex';
  const normalized = isHex && /^0x/i.test(value) ? value.slice(2) : value;
  const valid = isHex ? /^[0-9a-f]+$/i.test(normalized) : /^\d+$/.test(normalized);
  if (!valid || normalized.length === 0) {
    return {
      ok: false,
      message: isHex ? 'Use hexadecimal digits (0–9, A–F), optionally prefixed with 0x.' : 'Use a non-negative decimal whole number.',
    };
  }

  const offset = Number.parseInt(normalized, isHex ? 16 : 10);
  if (!Number.isSafeInteger(offset)) return { ok: false, message: 'That offset is too large to navigate safely.' };
  if (offset < 0 || offset >= byteLength) {
    return { ok: false, message: `Offset is outside this file. Enter 0–${byteLength - 1}.` };
  }
  return { ok: true, offset };
}

export function normalizeSelection(selection: ByteSpan, byteLength: number): ByteSpan {
  const offset = Number.isFinite(selection.offset) ? Math.trunc(selection.offset) : 0;
  const length = Number.isFinite(selection.length) ? Math.trunc(selection.length) : 0;
  const safeOffset = Math.max(0, Math.min(byteLength, offset));
  const safeLength = Math.max(0, Math.min(Math.max(0, byteLength - safeOffset), length));
  return { offset: safeOffset, length: safeLength };
}

function compareSpans(a: { span: ByteSpan }, b: { span: ByteSpan }): number {
  return a.span.length - b.span.length || a.span.offset - b.span.offset;
}

function smallestContaining<T extends { span: ByteSpan }>(items: T[], span: ByteSpan): T | undefined {
  return items.filter((item) => spanContains(item.span, span)).sort(compareSpans)[0];
}

function smallestContainingOffset<T extends { span: ByteSpan }>(items: T[], offset: number): T | undefined {
  return items
    .filter((item) => offset >= item.span.offset && offset < item.span.offset + item.span.length)
    .sort(compareSpans)[0];
}

export function createOwnershipIndex(inspection: Inspection): OwnershipIndex {
  const fields = inspection.structures.flatMap((structure) => structure.fields.map((field) => ({
    ...field,
    structureId: structure.id,
    structureLabel: structure.label,
  })));
  return {
    structures: inspection.structures,
    fields,
    unmapped: inspection.unmappedSpans ?? [],
    cache: new Map(),
  };
}

export function ownershipAt(index: OwnershipIndex, offset: number): ByteOwnership {
  const cached = index.cache.get(offset);
  if (cached) return cached;

  const field = smallestContainingOffset(index.fields, offset);
  const structure = smallestContainingOffset(index.structures, offset);
  const unmapped = smallestContainingOffset(index.unmapped, offset);
  let ownership: ByteOwnership;
  if (field) {
    ownership = {
      kind: 'field',
      id: field.id,
      label: `${field.structureLabel} · ${field.label}`,
      structureId: field.structureId,
      structureLabel: field.structureLabel,
      fieldId: field.id,
      fieldLabel: field.label,
      span: field.span,
    };
  } else if (structure) {
    ownership = {
      kind: 'structure',
      id: structure.id,
      label: structure.label,
      structureId: structure.id,
      structureLabel: structure.label,
      span: structure.span,
    };
  } else if (unmapped) {
    ownership = {
      kind: 'unmapped',
      id: unmapped.id,
      label: unmapped.label ?? 'Unmapped span',
      span: unmapped.span,
    };
  } else {
    ownership = { kind: 'unowned', label: 'Unmapped span', span: { offset, length: 1 } };
  }
  index.cache.set(offset, ownership);
  return ownership;
}

export function resolveSelection(inspection: Inspection, selection: ByteSpan): SelectionResolution {
  const normalized = normalizeSelection(selection, inspection.bytes.length);
  const fields = inspection.structures.flatMap((structure) => structure.fields);
  const intersectingFields = fields.filter((field) => spanIntersects(field.span, normalized));
  const field = smallestContaining(fields, normalized);
  const structure = smallestContaining(inspection.structures, normalized)
    ?? inspection.structures.filter((item) => spanIntersects(item.span, normalized)).sort(compareSpans)[0];
  const bitFields = (inspection.bitFields ?? [])
    .filter((bitField) => spanIntersects(bitField.span, normalized) || (field ? bitField.fieldId === field.id : false))
    .sort(compareSpans);
  const fieldIds = new Set(intersectingFields.map((item) => item.id));
  if (field) fieldIds.add(field.id);
  const derivedValues = (inspection.derivedValues ?? [])
    .filter((derived) => derived.sourceFieldIds.some((id) => fieldIds.has(id)));
  const unmapped = (inspection.unmappedSpans ?? [])
    .filter((item) => spanIntersects(item.span, normalized))
    .sort(compareSpans)[0];

  return { selection: normalized, structure, field, intersectingFields, bitFields, derivedValues, unmapped };
}

export function selectionHex(bytes: Uint8Array | number[], selection: ByteSpan): string {
  const safe = normalizeSelection(selection, bytes.length);
  const length = Math.min(safe.length, MAX_COPY_BYTES);
  return Array.from(bytes.slice(safe.offset, safe.offset + length), formatByte).join(' ');
}

export function fieldValueText(field: Field): string {
  return typeof field.value === 'number' ? String(field.value) : field.value;
}

export function copyText(text: string, dependencies: CopyDependencies = {}): Promise<CopyResult> {
  const clipboard = dependencies.clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : undefined);
  if (clipboard?.writeText) {
    return clipboard.writeText(text)
      .then(() => ({ ok: true, method: 'clipboard' as const, message: 'Copied to the clipboard.' }))
      .catch(() => fallbackCopy(text, dependencies));
  }
  return Promise.resolve(fallbackCopy(text, dependencies));
}

function fallbackCopy(text: string, dependencies: CopyDependencies): CopyResult {
  const documentRef: any = dependencies.document ?? (typeof document !== 'undefined' ? document : undefined);
  if (!documentRef?.body || !documentRef.createElement || !documentRef.execCommand) {
    return { ok: false, method: 'none', message: 'Copy is unavailable in this browser.' };
  }

  const textarea = documentRef.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  documentRef.body.appendChild(textarea);
  let copied = false;
  try {
    textarea.select();
    copied = documentRef.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    textarea.remove();
  }
  return copied
    ? { ok: true, method: 'fallback', message: 'Copied to the clipboard.' }
    : { ok: false, method: 'fallback', message: 'Copy was blocked. Select the value manually instead.' };
}

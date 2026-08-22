import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ASCII_REPLACEMENT,
  copyText,
  createOwnershipIndex,
  formatByte,
  formatOffset,
  getRow,
  ownershipAt,
  parseOffset,
  resolveSelection,
  selectionHex,
} from '../src/format.ts';
import type { Inspection } from '../src/format.ts';

function fixtureInspection(): Inspection {
  const bytes = Uint8Array.from([0x10, 0x11, 0x12, 0x13, 0x20, 0x41, 0x7e, 0x80, 0x90, 0xa0]);
  return {
    id: 'fixture',
    format: 'png',
    state: 'ready',
    complete: true,
    termination: 'complete',
    limitReached: false,
    sourceName: 'fixture.bin',
    bytes,
    structures: [{
      id: 'structure-a',
      name: 'a',
      label: 'Structure A',
      kind: 'chunk',
      span: { offset: 0, length: 7 },
      description: 'Fixture Structure.',
      fields: [
        { id: 'field-a', name: 'a', label: 'Field A', span: { offset: 0, length: 2 }, encodedBytes: [0x10, 0x11], value: 0x1011, representation: 'unsigned integer', explanation: 'First Field.' },
        { id: 'field-b', name: 'b', label: 'Field B', span: { offset: 2, length: 2 }, encodedBytes: [0x12, 0x13], value: 0x1213, representation: 'unsigned integer', explanation: 'Second Field.' },
      ],
    }],
    fields: [],
    payloads: [],
    bitFields: [{ id: 'bit-a', name: 'flag', label: 'Flag', span: { offset: 0, length: 1 }, mask: 0x80, fieldId: 'field-a', value: 0, explanation: 'A bit.' }],
    derivedValues: [{ id: 'derived-a', name: 'sum', label: 'Sum', value: 0x2224, sourceFieldIds: ['field-a', 'field-b'], explanation: 'A calculation.' }],
    unmappedSpans: [{ id: 'unmapped-a', span: { offset: 7, length: 3 }, offset: 7, length: 3, label: 'Padding', reason: 'No parsed item claims these bytes.' }],
    unmapped: [{ id: 'unmapped-a', span: { offset: 7, length: 3 }, offset: 7, length: 3, label: 'Padding', reason: 'No parsed item claims these bytes.' }],
    diagnostics: [],
  };
}

test('rows use a 16-byte display rhythm and stable printable replacement', () => {
  const row = getRow(Uint8Array.from([0x00, 0x20, 0x41, 0x7e, 0x7f]), 0);
  assert.deepEqual(row.values, [0x00, 0x20, 0x41, 0x7e, 0x7f]);
  assert.equal(row.ascii, `${ASCII_REPLACEMENT} A~${ASCII_REPLACEMENT}`);
  assert.equal(formatByte(0xab), 'AB');
  assert.equal(formatOffset(0x2a, 0x100000), '0002A');
});

test('go-to offset is hexadecimal by default and decimal only when explicit', () => {
  assert.deepEqual(parseOffset('0x2A', 'hex', 100), { ok: true, offset: 42 });
  assert.deepEqual(parseOffset('2A', 'hex', 100), { ok: true, offset: 42 });
  assert.deepEqual(parseOffset('42', 'decimal', 100), { ok: true, offset: 42 });
  assert.equal(parseOffset('42', 'hex', 16).ok, false);
  assert.equal(parseOffset('-1', 'decimal', 100).ok, false);
  assert.equal(parseOffset('100', 'decimal', 100).ok, false);
});

test('selection resolution preserves exact spans and applies focus rules', () => {
  const inspection = fixtureInspection();
  const index = createOwnershipIndex(inspection);
  assert.equal(ownershipAt(index, 0).fieldLabel, 'Field A');
  assert.equal(ownershipAt(index, 8).kind, 'unmapped');

  const oneField = resolveSelection(inspection, { offset: 1, length: 1 });
  assert.deepEqual(oneField.selection, { offset: 1, length: 1 });
  assert.equal(oneField.field?.id, 'field-a');
  assert.equal(oneField.bitFields[0]?.mask, 0x80);
  assert.equal(oneField.derivedValues[0]?.id, 'derived-a');

  const crossField = resolveSelection(inspection, { offset: 1, length: 3 });
  assert.deepEqual(crossField.selection, { offset: 1, length: 3 });
  assert.equal(crossField.field, undefined);
  assert.deepEqual(crossField.intersectingFields.map((field) => field.id), ['field-a', 'field-b']);
  assert.equal(crossField.structure?.id, 'structure-a');

  const unmapped = resolveSelection(inspection, { offset: 8, length: 2 });
  assert.equal(unmapped.unmapped?.id, 'unmapped-a');
  assert.equal(unmapped.field, undefined);
});

test('selected byte copy is spaced uppercase hex and fallback copy reports success', async () => {
  const inspection = fixtureInspection();
  assert.equal(selectionHex(inspection.bytes, { offset: 1, length: 3 }), '11 12 13');
  let copied = '';
  const result = await copyText('11 12 13', {
    document: {
      body: { appendChild: () => undefined },
      createElement: () => ({
        value: '',
        setAttribute: () => undefined,
        style: { cssText: '' },
        select: () => undefined,
        remove: () => undefined,
      }),
      execCommand: (command: string) => {
        copied = command;
        return true;
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'fallback');
  assert.equal(copied, 'copy');
});

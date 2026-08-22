import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG_SIGNATURE, inspectPng } from '../src/format.ts';
import { sampleBytes, sampleInspection } from '../src/sample.ts';
import { spanContains } from '../src/domain/inspection.ts';

test('the public PNG Inspection contract exposes the sample Structures and Byte spans', () => {
  const inspection = sampleInspection();
  const signature = inspection.structures.find((structure) => structure.id === 'png-signature');
  const ihdr = inspection.structures.find((structure) => structure.id === 'png-ihdr');
  const iend = inspection.structures.find((structure) => structure.id === 'png-iend');

  assert.equal(inspection.format, 'png');
  assert.equal(inspection.state, 'ready');
  assert.deepEqual(Array.from(inspection.bytes.slice(0, 8)), Array.from(PNG_SIGNATURE));
  assert.deepEqual(signature?.span, { offset: 0, length: 8 });
  assert.deepEqual(ihdr?.span, { offset: 8, length: 25 });
  assert.deepEqual(iend?.span, { offset: 56, length: 12 });
  assert.ok(signature?.fields.some((field) => field.name === 'signature'));
  assert.ok(ihdr?.fields.some((field) => field.name === 'width' && field.value === 1));
  assert.ok(ihdr?.fields.some((field) => field.name === 'height' && field.value === 1));
  assert.ok(ihdr?.fields.every((field) => spanContains(ihdr.span, field.span)));
  assert.equal(inspection.diagnostics.length, 0);
});

test('a malformed signature returns a partial Inspection without pretending to parse it', () => {
  const bytes = sampleBytes();
  bytes[0] = 0;
  const inspection = inspectPng(bytes, 'not-a-png.bin');

  assert.equal(inspection.state, 'partial');
  assert.equal(inspection.structures.length, 0);
  assert.equal(inspection.diagnostics[0]?.code, 'unsupported_format');
  assert.equal(inspection.diagnostics[0]?.span.offset, 0);
});

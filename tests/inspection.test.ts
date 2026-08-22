import assert from 'node:assert/strict';
import test from 'node:test';
import { detectFormat, hasWavSignature, PNG_SIGNATURE, inspectPng, RIFF_SIGNATURE, inspectWav } from '../src/format.ts';
import { sampleBytes, sampleInspection, wavSampleBytes, wavSampleInspection } from '../src/sample.ts';
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

test('the public WAV Inspection contract exposes RIFF/WAVE, fmt, and data Byte spans', () => {
  const bytes = wavSampleBytes();
  const inspection = wavSampleInspection();
  const riff = inspection.structures.find((structure) => structure.name === 'riff');
  const fmt = inspection.structures.find((structure) => structure.name === 'fmt');
  const data = inspection.structures.find((structure) => structure.name === 'data');

  assert.equal(detectFormat(bytes), 'wav');
  assert.equal(hasWavSignature(bytes), true);
  assert.deepEqual(Array.from(bytes.slice(0, 4)), Array.from(RIFF_SIGNATURE));
  assert.equal(inspection.format, 'wav');
  assert.equal(inspection.state, 'ready');
  assert.deepEqual(riff?.span, { offset: 0, length: 52 });
  assert.deepEqual(fmt?.span, { offset: 12, length: 24 });
  assert.deepEqual(data?.span, { offset: 36, length: 16 });
  assert.equal(riff?.fields.find((field) => field.name === 'chunkSize')?.value, 44);
  assert.equal(fmt?.fields.find((field) => field.name === 'audioFormat')?.value, 1);
  assert.equal(fmt?.fields.find((field) => field.name === 'sampleRate')?.value, 8000);
  assert.ok(fmt?.fields.filter((field) => field.endianness === 'little-endian').length >= 6);
  const payload = data?.fields.find((field) => field.name === 'payload');
  assert.deepEqual(payload?.span, { offset: 44, length: 8 });
  assert.equal(payload?.value, 'opaque audio sample bytes');
  assert.equal(payload?.representation, 'opaque Payload');
  assert.ok(inspection.structures.every((structure) => structure.fields.every((field) => spanContains(structure.span, field.span))));
  assert.equal(inspection.diagnostics.length, 0);
});

test('content-first detection distinguishes an unsupported RIFF form from unknown bytes', () => {
  const unsupportedRiff = new Uint8Array([...RIFF_SIGNATURE, 0x2c, 0, 0, 0, 0x41, 0x49, 0x46, 0x46]);
  assert.equal(detectFormat(unsupportedRiff), 'unsupported_riff');
  const inspection = inspectWav(unsupportedRiff, 'misleading.wav');
  assert.equal(inspection.state, 'partial');
  assert.equal(inspection.diagnostics[0]?.code, 'unsupported_format');
  assert.match(inspection.diagnostics[0]?.message ?? '', /not a RIFF\/WAVE/);
  assert.equal(detectFormat(new Uint8Array([0x01, 0x02, 0x03])), undefined);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { detectFormat, hasWavSignature, PNG_DIAGNOSTIC_CODES, PNG_LIMITS, PNG_SIGNATURE, inspectPng, RIFF_SIGNATURE, WAV_DIAGNOSTIC_CODES, inspectWav } from '../src/format.ts';
import { sampleBytes, sampleInspection, wavSampleBytes, wavSampleInspection } from '../src/sample.ts';
import { spanContains } from '../src/domain/inspection.ts';
import { chunk, ihdrRgba, manifest, png, validEveryDeclaredChunk } from './fixtures/png-contract.ts';

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

test('content-first detection keeps a misleading filename non-fatal', () => {
  const inspection = inspectPng(sampleBytes(), 'report.jpg', { mimeType: 'image/jpeg' });
  assert.equal(inspection.format, 'png');
  assert.equal(inspection.state, 'ready');
  assert.deepEqual(inspection.diagnostics.map((diagnostic) => diagnostic.code), ['extension_mismatch']);
  assert.deepEqual(inspection.diagnostics[0]?.span, { offset: 0, length: 8 });
});

test('Diagnostic code exports retain the legacy mismatch key while emitting the stable code', () => {
  assert.equal(PNG_DIAGNOSTIC_CODES.extensionMismatch, 'extension_mismatch');
  assert.equal(PNG_DIAGNOSTIC_CODES.formatNameMismatch, PNG_DIAGNOSTIC_CODES.extensionMismatch);
  assert.equal(WAV_DIAGNOSTIC_CODES.extensionMismatch, 'extension_mismatch');
  assert.equal(WAV_DIAGNOSTIC_CODES.formatNameMismatch, WAV_DIAGNOSTIC_CODES.extensionMismatch);
});

test('the public contract covers every declared PNG chunk and preserves source order', () => {
  const bytes = validEveryDeclaredChunk();
  const inspection = inspectPng(bytes, 'all-chunks.png');

  assert.equal(inspection.state, 'ready');
  assert.equal(inspection.complete, true);
  assert.deepEqual(inspection.diagnostics, [{
    code: 'unsupported_chunk',
    severity: 'note',
    message: 'zzZZ is retained as a generic opaque chunk.',
    span: manifest.unknown,
  }]);
  assert.deepEqual(inspection.structures.map((structure) => structure.span), [
    manifest.signature,
    manifest.ihdr,
    manifest.gamma,
    manifest.srgb,
    manifest.phys,
    manifest.plte,
    manifest.trns,
    manifest.text,
    manifest.itxt,
    manifest.idat,
    manifest.unknown,
    manifest.iend,
  ]);
  assert.equal(new Set(inspection.structures.map((structure) => structure.id)).size, inspection.structures.length);
  assert.deepEqual(inspection.structures.find((structure) => structure.type === 'PLTE')?.fields.filter((field) => field.name.startsWith('entry')).map((field) => field.value), ['#FF0000', '#00FF00']);
  assert.equal(inspection.structures.find((structure) => structure.type === 'tEXt')?.fields.find((field) => field.name === 'text')?.value, '<script>alert(1)</script>');
  assert.equal(inspection.structures.find((structure) => structure.type === 'iTXt')?.fields.find((field) => field.name === 'text')?.value, 'plain text');
  assert.deepEqual(inspection.structures.find((structure) => structure.type === 'IDAT')?.payload?.span, { offset: 211, length: 10 });
  assert.equal(inspection.payloads.length, 2);
  assert.equal(inspection.unmappedSpans.length, 0);
  assert.ok(inspection.fields.every((field) => inspection.structures.some((structure) => spanContains(structure.span, field.span))));
});

test('duplicate unknown chunks retain distinct occurrences and opaque Payloads', () => {
  const bytes = png([ihdrRgba, chunk('abCD', [1, 2]), chunk('abCD', [3, 4]), chunk('IDAT', [0x78]), chunk('IEND')]);
  const inspection = inspectPng(bytes);
  const unknown = inspection.structures.filter((structure) => structure.type === 'abCD');

  assert.equal(unknown.length, 2);
  assert.notEqual(unknown[0].id, unknown[1].id);
  assert.deepEqual(unknown.map((structure) => structure.occurrence), [1, 2]);
  assert.deepEqual(unknown.map((structure) => structure.payload?.span), [{ offset: 41, length: 2 }, { offset: 55, length: 2 }]);
  assert.ok(unknown.every((structure) => structure.fields.find((field) => field.name === 'payload')?.status === 'opaque'));
});

test('bad CRC and invalid ordering keep complete envelopes and stable Diagnostics', () => {
  const badIhdr = chunk('IHDR', Array.from(ihdrRgba.slice(8, 21)), 0);
  const bytes = png([chunk('IDAT', [1]), badIhdr, chunk('IEND')]);
  const inspection = inspectPng(bytes);
  const codes = inspection.diagnostics.map((diagnostic) => diagnostic.code);

  assert.equal(inspection.state, 'partial');
  assert.ok(codes.includes('invalid_order'));
  assert.ok(codes.includes('crc_mismatch'));
  assert.ok(inspection.structures.some((structure) => structure.type === 'IHDR' && structure.span.length === 25));
  assert.ok(inspection.diagnostics.every((diagnostic) => diagnostic.span.offset >= 0 && diagnostic.span.offset <= bytes.length));
});

test('truncation preserves prior Structures and marks the unsafe tail Unmapped', () => {
  const bytes = validEveryDeclaredChunk();
  const truncated = bytes.slice(0, manifest.itxt.offset + 7);
  const inspection = inspectPng(truncated);

  assert.equal(inspection.state, 'partial');
  assert.ok(inspection.structures.some((structure) => structure.type === 'tEXt'));
  assert.equal(inspection.structures.some((structure) => structure.type === 'iTXt'), false);
  assert.equal(inspection.diagnostics[0]?.code, 'truncated_chunk');
  assert.deepEqual(inspection.unmappedSpans.at(-1)?.span, { offset: manifest.itxt.offset, length: truncated.length - manifest.itxt.offset });
});

test('an impossible length stops recovery instead of scanning arbitrary bytes', () => {
  const impossible = Uint8Array.from([
    ...PNG_SIGNATURE,
    0xff, 0xff, 0xff, 0xff,
    ...Array.from('IDAT', (character) => character.charCodeAt(0)),
    0,
    0,
    0,
    0,
  ]);
  const inspection = inspectPng(impossible);

  assert.equal(inspection.structures.length, 1);
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === 'invalid_length'));
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === 'truncated_chunk'));
  assert.deepEqual(inspection.unmappedSpans, [{
    id: 'png-unmapped-1',
    span: { offset: 8, length: impossible.length - 8 },
    offset: 8,
    length: impossible.length - 8,
    reason: 'Bytes not claimed by a parsed Structure.',
  }]);
});

test('compressed iTXt remains opaque and does not expose compressed bytes as text', () => {
  const compressedText = [
    ...Array.from('Note', (character) => character.charCodeAt(0)), 0,
    1, 0,
    0,
    0,
    0x78, 0x9c, 0x03, 0x00,
  ];
  const inspection = inspectPng(png([ihdrRgba, chunk('iTXt', compressedText), chunk('IDAT', [1]), chunk('IEND')]));
  const itxt = inspection.structures.find((structure) => structure.type === 'iTXt');

  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === 'compressed_text_opaque'));
  assert.equal(itxt?.fields.some((field) => field.name === 'text'), false);
  assert.equal(itxt?.payload?.encoding, 'opaque');
});

test('valid signature with a broken envelope yields independent Source-preview input', () => {
  const inspection = inspectPng(png([ihdrRgba, chunk('IEND')]));
  assert.equal(inspection.state, 'partial');
  assert.ok(inspection.structures.some((structure) => structure.type === 'IHDR'));
  assert.ok(inspection.structures.some((structure) => structure.type === 'IEND'));
  assert.ok(inspection.diagnostics.some((diagnostic) => diagnostic.code === 'missing_idat'));
});

test('byte and Structure safety caps are explicit and preserve the safe prefix', () => {
  const oversized = new Uint8Array(PNG_LIMITS.maxBytes + 1);
  oversized.set(PNG_SIGNATURE);
  const oversizedInspection = inspectPng(oversized);
  assert.equal(oversizedInspection.termination, 'limit-reached');
  assert.equal(oversizedInspection.limitReached, true);
  assert.equal(oversizedInspection.structures.length, 1);
  assert.equal(oversizedInspection.diagnostics[0]?.code, 'limit_reached');

  const manyTextChunks = Array.from({ length: PNG_LIMITS.maxStructures + 2 }, () => chunk('tEXt', [65, 0]));
  const structureLimited = inspectPng(png([ihdrRgba, ...manyTextChunks, chunk('IDAT', [1]), chunk('IEND')]));
  assert.equal(structureLimited.termination, 'limit-reached');
  assert.equal(structureLimited.limitReached, true);
  assert.equal(structureLimited.structures.length, PNG_LIMITS.maxStructures);
  assert.ok(structureLimited.diagnostics.some((diagnostic) => diagnostic.code === 'limit_reached'));
  assert.equal(structureLimited.structures.at(-1)?.type, 'tEXt');
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

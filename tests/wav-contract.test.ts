import assert from 'node:assert/strict';
import test from 'node:test';
import { detectFormat, inspectWav, WAV_LIMITS } from '../src/format.ts';
import {
  chunk,
  extensibleWav,
  floatWav,
  infoPayload,
  lengthMismatchWav,
  metadataWav,
  missingPaddingWav,
  missingRequiredWav,
  oddPaddingWav,
  pcmWav,
  truncatedWav,
  unknownBytes,
  unsupportedRiff,
  unsupportedTagWav,
  wav,
  fmtPayload,
} from './wav-fixtures.ts';

function assertPublicSpans(bytes: Uint8Array, inspection: ReturnType<typeof inspectWav>): void {
  for (const structure of inspection.structures) {
    assert.ok(structure.span.offset >= 0);
    assert.ok(structure.span.offset + structure.span.length <= bytes.length, `${structure.id} exceeds the file`);
    for (const field of structure.fields) {
      assert.ok(field.span.offset >= structure.span.offset, `${field.id} starts outside ${structure.id}`);
      assert.ok(field.span.offset + field.span.length <= structure.span.offset + structure.span.length, `${field.id} exceeds ${structure.id}`);
      assert.equal(field.encodedBytes.length, field.span.length, `${field.id} encoded bytes do not match the Byte span`);
    }
  }
  for (const diagnostic of inspection.diagnostics) {
    assert.ok(diagnostic.span.offset >= 0 && diagnostic.span.offset <= bytes.length, diagnostic.code);
    assert.ok(diagnostic.span.offset + diagnostic.span.length <= bytes.length, `${diagnostic.code} exceeds the file`);
  }
  for (const unmapped of inspection.unmappedSpans ?? []) {
    assert.ok(unmapped.span.offset + unmapped.span.length <= bytes.length, `${unmapped.id} exceeds the file`);
  }
}

test('valid PCM exposes the complete little-endian contract and opaque audio Payload', () => {
  const inspection = inspectWav(pcmWav);
  const fmt = inspection.structures.find((structure) => structure.name === 'fmt');
  const data = inspection.structures.find((structure) => structure.name === 'data');

  assert.equal(inspection.state, 'ready');
  assert.deepEqual(fmt?.fields.find((field) => field.name === 'audioFormat')?.value, 1);
  assert.deepEqual(fmt?.fields.find((field) => field.name === 'bitsPerSample')?.value, 8);
  assert.ok(fmt?.fields.every((field) => field.endianness === 'little-endian' || field.endianness === 'n/a'));
  assert.equal(data?.kind, 'payload');
  assert.equal(data?.fields.find((field) => field.name === 'payload')?.value, 'opaque audio sample bytes');
  assert.equal(data?.fields.find((field) => field.name === 'payload')?.representation, 'opaque Payload');
  assert.deepEqual(inspection.diagnostics, []);
  assertPublicSpans(pcmWav, inspection);
});

test('IEEE-float WAV exposes tag 3 and conditional fact sample count', () => {
  const inspection = inspectWav(floatWav);
  const fmt = inspection.structures.find((structure) => structure.name === 'fmt');
  const fact = inspection.structures.find((structure) => structure.name === 'fact');

  assert.equal(inspection.state, 'ready');
  assert.equal(fmt?.fields.find((field) => field.name === 'audioFormat')?.value, 3);
  assert.equal(fact?.fields.find((field) => field.name === 'sampleLength')?.value, 2);
  assert.equal(inspection.diagnostics.length, 0);
  assertPublicSpans(floatWav, inspection);
});

test('IEEE-float WAV without fact is partial and marks the missing requirement', () => {
  const bytes = wav([
    { id: 'fmt ', payload: fmtPayload({ tag: 3, bitsPerSample: 32, blockAlign: 4, byteRate: 32_000 }) },
    { id: 'data', payload: [0x00, 0x00, 0x80, 0x3f] },
  ]);
  const inspection = inspectWav(bytes);

  assert.equal(inspection.status, 'partial');
  assert.equal(inspection.complete, false);
  assert.ok(inspection.diagnostics.some((item) => item.code === 'missing_fact'));
  assert.ok(inspection.structures.some((item) => item.diagnosticCodes?.includes('missing_fact')));
  assertPublicSpans(bytes, inspection);
});

test('LIST/INFO identifiers are public Structures while unknown chunks remain generic', () => {
  const inspection = inspectWav(metadataWav);
  const list = inspection.structures.find((structure) => structure.name === 'list');
  const expected = new Map([
    ['INAM', 'Field note'],
    ['IART', 'HexLens'],
    ['ICMT', 'Opaque samples'],
    ['ICRD', '2026'],
    ['IGNR', 'Test'],
  ]);

  assert.equal(list?.fields.find((field) => field.name === 'listType')?.value, 'INFO');
  for (const [identifier, value] of expected) {
    const structure = inspection.structures.find((item) => item.name === identifier.toLowerCase());
    assert.ok(structure, `missing ${identifier}`);
    assert.equal(structure?.fields.find((field) => field.name === ({ INAM: 'name', IART: 'artist', ICMT: 'comment', ICRD: 'creationDate', IGNR: 'genre' } as Record<string, string>)[identifier])?.value, value);
  }
  const unknown = inspection.structures.find((structure) => structure.name === 'junk');
  assert.equal(unknown?.fields.find((field) => field.name === 'payload')?.value, 'opaque bytes');
  assert.equal(inspection.diagnostics.length, 0);
  assert.equal(list?.parentId, 'wav-riff');
  assert.ok(inspection.structures.filter((item) => item.id !== 'wav-riff').every((item) => item.parentId === 'wav-riff' || item.parentId === list?.id));
  assertPublicSpans(metadataWav, inspection);
});

test('WAV Field status distinguishes absent, opaque, and invalid values', () => {
  const absent = inspectWav(wav([{ id: 'fmt ', payload: [1, 0] }]));
  const opaque = inspectWav(metadataWav).structures.find((item) => item.name === 'junk')?.fields.find((item) => item.name === 'payload');
  const invalid = inspectWav(unsupportedTagWav).structures.find((item) => item.name === 'fmt')?.fields.find((item) => item.name === 'audioFormat');

  assert.equal(absent.structures.find((item) => item.name === 'fmt')?.fields.find((item) => item.name === 'channels')?.status, 'absent');
  assert.equal(opaque?.status, 'opaque');
  assert.equal(invalid?.status, 'invalid');
  assertPublicSpans(absent.bytes, absent);
});

test('nested LIST/INFO structure cap is explicit and incomplete', () => {
  const infoPrefix = Array.from('INFO', (character) => character.charCodeAt(0));
  const nestedChildren = Array.from({ length: WAV_LIMITS.maxStructures }, () => chunk('JUNK', [0])).flat();
  const bytes = wav([
    { id: 'fmt ', payload: fmtPayload({ bitsPerSample: 8 }) },
    { id: 'LIST', payload: [...infoPrefix, ...nestedChildren] },
    { id: 'data', payload: [0x01] },
  ]);
  const inspection = inspectWav(bytes);
  const list = inspection.structures.find((item) => item.name === 'list');

  assert.equal(inspection.status, 'limit-reached');
  assert.equal(inspection.complete, false);
  assert.equal(inspection.structures.length, WAV_LIMITS.maxStructures);
  assert.ok(inspection.diagnostics.some((item) => item.code === 'limit_reached'));
  assert.ok(list);
  assert.ok(inspection.structures.slice(0, 4).every((item) => item.id === 'wav-riff' || item.parentId === 'wav-riff' || item.parentId === list?.id));
  assert.ok(inspection.structures.some((item) => item.diagnosticCodes?.includes('limit_reached')));
  assertPublicSpans(bytes, inspection);
});

test('odd chunk sizes consume padding as an Unmapped span without a false error', () => {
  const inspection = inspectWav(oddPaddingWav);
  const padding = inspection.unmappedSpans?.filter((item) => item.reason?.includes('padding')) ?? [];

  assert.equal(inspection.state, 'ready');
  assert.equal(inspection.diagnostics.length, 0);
  assert.equal(padding.length, 2);
  assertPublicSpans(oddPaddingWav, inspection);
});

test('missing padding, declared-length mismatch, missing required chunks, and truncation stay distinct', () => {
  const missingPadding = inspectWav(missingPaddingWav);
  const mismatch = inspectWav(lengthMismatchWav);
  const missing = inspectWav(missingRequiredWav);
  const truncated = inspectWav(truncatedWav);

  assert.ok(missingPadding.diagnostics.some((item) => item.code === 'invalid_alignment'));
  assert.ok(mismatch.diagnostics.some((item) => item.code === 'invalid_length'));
  assert.ok(mismatch.unmappedSpans?.some((item) => item.span.length === 1));
  assert.ok(missing.diagnostics.some((item) => item.code === 'missing_fmt'));
  assert.ok(missing.diagnostics.some((item) => item.code === 'missing_data'));
  assert.ok(truncated.diagnostics.some((item) => item.code === 'truncated_riff'));
  assert.ok(truncated.diagnostics.some((item) => item.code === 'truncated_chunk'));
  assert.ok(truncated.structures.some((structure) => structure.name === 'fmt'));
  assertPublicSpans(missingPaddingWav, missingPadding);
  assertPublicSpans(lengthMismatchWav, mismatch);
  assertPublicSpans(missingRequiredWav, missing);
  assertPublicSpans(truncatedWav, truncated);
});

test('unsupported format tags and consistency failures are partial Diagnostics', () => {
  const unsupported = inspectWav(unsupportedTagWav);
  const extensible = inspectWav(extensibleWav);
  const inconsistentBytes = wav([
    { id: 'fmt ', payload: fmtPayload({ bitsPerSample: 16, byteRate: 1 }) },
    { id: 'data', payload: [0x00, 0x01] },
  ]);
  const inconsistent = inspectWav(inconsistentBytes);

  assert.equal(unsupported.state, 'partial');
  assert.ok(unsupported.diagnostics.some((item) => item.code === 'unsupported_format_tag' && item.span.offset === 20 && item.span.length === 2));
  assert.equal(extensible.state, 'partial');
  assert.match(extensible.diagnostics.find((item) => item.code === 'unsupported_format_tag')?.message ?? '', /WAVE_FORMAT_EXTENSIBLE/);
  assert.equal(inconsistent.state, 'partial');
  assert.ok(inconsistent.diagnostics.some((item) => item.code === 'invalid_consistency'));
  assertPublicSpans(unsupportedTagWav, unsupported);
  assertPublicSpans(extensibleWav, extensible);
  assertPublicSpans(inconsistentBytes, inconsistent);
});

test('content-first detection preserves the supported/unsupported RIFF boundary and extension note', () => {
  assert.equal(detectFormat(unsupportedRiff), 'unsupported_riff');
  assert.equal(detectFormat(unknownBytes), undefined);
  const unsupported = inspectWav(unsupportedRiff);
  const extensionMismatch = inspectWav(pcmWav, 'audio.bin');

  assert.equal(unsupported.state, 'partial');
  assert.equal(unsupported.diagnostics[0]?.code, 'unsupported_format');
  assert.match(unsupported.diagnostics[0]?.message ?? '', /RF64/);
  assert.equal(extensionMismatch.diagnostics[0]?.code, 'extension_mismatch');
  assert.equal(extensionMismatch.diagnostics[0]?.severity, 'note');
  assert.equal(extensionMismatch.state, 'ready');
  assertPublicSpans(unsupportedRiff, unsupported);
  assertPublicSpans(pcmWav, extensionMismatch);
});

test('the public INFO fixture helper uses the declared identifiers in source order', () => {
  const payload = infoPayload({ INAM: 'A', IART: 'B' });
  assert.deepEqual(Array.from(payload.slice(0, 4)), Array.from(new TextEncoder().encode('INFO')));
  assert.equal(payload.length % 2, 0);
});

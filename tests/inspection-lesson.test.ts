import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSelection } from '../src/domain/byte-grid.ts';
import { lessonFor } from '../src/inspection-lesson.ts';
import { sampleInspection, wavSampleInspection } from '../src/sample.ts';

test('PNG lessons follow the selected Structure and preserve its exact position', () => {
  const inspection = sampleInspection();
  const ihdr = inspection.structures.find((structure) => structure.type === 'IHDR');
  assert.ok(ihdr);

  const lesson = lessonFor(inspection, resolveSelection(inspection, ihdr.span));
  assert.equal(lesson.title, 'The image blueprint');
  assert.match(lesson.meaning, /width, height/);
  assert.match(lesson.why, /decoder needs these rules/);
  assert.match(lesson.position, /Offsets 8 through 32 of 68 bytes/);
});

test('WAV lessons explain format-specific Structures', () => {
  const inspection = wavSampleInspection();
  const format = inspection.structures.find((structure) => structure.name === 'fmt');
  assert.ok(format);

  const lesson = lessonFor(inspection, resolveSelection(inspection, format.span));
  assert.equal(lesson.title, 'The playback blueprint');
  assert.match(lesson.why, /Sample bytes have no useful sound meaning/);
  assert.match(lesson.reading, /little-endian/);
});

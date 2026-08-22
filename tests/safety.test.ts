import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRawInspection,
  detectFormat,
  inspectDetected,
  inspectPng,
  inspectWav,
  PNG_SIGNATURE,
  RIFF_SIGNATURE,
  WAV_LIMITS,
} from '../src/format.ts';
import { FileJobController, readLocalFile } from '../src/file-session.ts';
import { INSPECTION_LIMITS } from '../src/domain/inspection.ts';

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('unsupported input is a distinct raw-byte Inspection with bounded generic Diagnostics', () => {
  const bytes = Uint8Array.from([0x00, 0x01, 0x02, 0xff]);
  const inspection = inspectDetected(bytes, 'evil<script>alert(1)</script>.bin', { mimeType: 'application/octet-stream' });

  assert.equal(detectFormat(bytes), undefined);
  assert.equal(inspection.status, 'unsupported');
  assert.equal(inspection.termination, 'unsupported');
  assert.equal(inspection.structures.length, 0);
  assert.deepEqual(inspection.unmappedSpans[0]?.span, { offset: 0, length: bytes.length });
  assert.equal(inspection.diagnostics[0]?.code, 'unsupported_format');
  assert.equal(inspection.diagnostics[0]?.message.includes('evil'), false);
});

test('WAV hostile lengths stop at the unsafe boundary without recovery or a hang', () => {
  const bytes = Uint8Array.from([
    ...RIFF_SIGNATURE, 0xff, 0xff, 0xff, 0xff,
    0x57, 0x41, 0x56, 0x45,
    0x4a, 0x55, 0x4e, 0x4b, 0xff, 0xff, 0xff, 0xff,
  ]);
  const inspection = inspectWav(bytes);

  assert.equal(inspection.status, 'partial');
  assert.ok(inspection.diagnostics.some((item) => item.code === 'invalid_length'));
  assert.ok(inspection.diagnostics.some((item) => item.code === 'truncated_chunk'));
  assert.ok(inspection.diagnostics.every((item) => item.span.offset + item.span.length <= bytes.length));
});

test('an already-aborted PNG parser returns a distinct aborted status and span', () => {
  const controller = new AbortController();
  controller.abort();
  const bytes = Uint8Array.from([...PNG_SIGNATURE, 0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]);
  const inspection = inspectPng(bytes, 'cancelled.png', { signal: controller.signal });

  assert.equal(inspection.status, 'aborted');
  assert.equal(inspection.termination, 'aborted');
  assert.ok(inspection.diagnostics.some((item) => item.code === 'parse_aborted'));
  assert.ok(inspection.diagnostics.every((item) => item.span.offset <= bytes.length));
});

test('the release WAV byte cap returns an explicit limit result', () => {
  const bytes = new Uint8Array(WAV_LIMITS.maxBytes + 1);
  bytes.set(RIFF_SIGNATURE, 0);
  bytes.set([0x00, 0x00, 0x00, 0x00], 4);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  const inspection = inspectWav(bytes);

  assert.equal(inspection.status, 'limit-reached');
  assert.equal(inspection.termination, 'limit-reached');
  assert.equal(inspection.limitReached, true);
  assert.equal(inspection.structures.length, 1);
  assert.equal(inspection.diagnostics[0]?.code, 'limit_reached');
});

test('a parser failure exposes only bounded source bytes and never exception text', async () => {
  const errors: Array<{ id: number; bytes?: Uint8Array }> = [];
  const controller = new FileJobController<string>(
    async () => Uint8Array.from([0xde, 0xad, 0xbe, 0xef]).buffer,
    () => { throw new Error('hostile filename and bytes must not escape'); },
    async () => undefined,
    { slowNoticeMs: 20, terminationDeadlineMs: 5 },
  );
  const file = new File([Uint8Array.from([0xde, 0xad, 0xbe, 0xef])], 'name<script>.bin');
  controller.start(file, {
    onPhase: () => undefined,
    onAccepted: () => undefined,
    onRejected: () => undefined,
    onError: (id, _failedFile, bytes) => errors.push({ id, bytes }),
  });

  await delay(10);
  assert.equal(errors.length, 1);
  assert.deepEqual(Array.from(errors[0]?.bytes ?? []), [0xde, 0xad, 0xbe, 0xef]);
});

test('the default reader requests only the bounded prefix for an over-limit file', async () => {
  let requestedEnd = 0;
  const file = {
    size: INSPECTION_LIMITS.maxBytes + 10,
    slice: (_start: number, end: number) => {
      requestedEnd = end;
      return { arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
    },
    arrayBuffer: async () => Uint8Array.from([9]).buffer,
  } as unknown as File;
  const bytes = await readLocalFile(file, new AbortController().signal);

  assert.equal(requestedEnd, INSPECTION_LIMITS.maxBytes + 1);
  assert.deepEqual(Array.from(new Uint8Array(bytes)), [1, 2, 3]);
});

test('slow jobs expose abort and bounded termination without publishing a result', async () => {
  const events: string[] = [];
  const controller = new FileJobController<string>(
    async () => new Promise<ArrayBuffer>(() => undefined),
    () => ({ accepted: true as const, value: 'late' }),
    async () => undefined,
    { slowNoticeMs: 5, terminationDeadlineMs: 5 },
  );
  const file = new File([Uint8Array.from([1])], 'slow.png');
  controller.start(file, {
    onPhase: () => undefined,
    onAccepted: () => events.push('accepted'),
    onRejected: () => events.push('rejected'),
    onSlow: () => events.push('slow'),
    onAborted: () => events.push('aborted'),
    onTerminated: () => events.push('terminated'),
    onError: () => events.push('error'),
  });

  await delay(12);
  assert.deepEqual(events, ['slow']);
  controller.cancel();
  assert.deepEqual(events, ['slow', 'aborted']);
  await delay(12);
  assert.deepEqual(events, ['slow', 'aborted', 'terminated']);
});

test('superseded jobs receive unique identities and late results cannot publish', async () => {
  const accepted: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const controller = new FileJobController<string>(
    async (file) => file.name === 'first' ? new Promise<ArrayBuffer>((resolve) => { releaseFirst = () => resolve(Uint8Array.from([1]).buffer); }) : Uint8Array.from([2]).buffer,
    (bytes, file) => ({ accepted: true as const, value: `${file.name}:${bytes[0]}` }),
    async () => undefined,
    { slowNoticeMs: 20, terminationDeadlineMs: 5 },
  );
  const first = controller.start(new File([Uint8Array.from([1])], 'first'), { onPhase: () => undefined, onAccepted: (value) => accepted.push(value), onRejected: () => undefined, onError: () => undefined });
  const second = controller.start(new File([Uint8Array.from([2])], 'second'), { onPhase: () => undefined, onAccepted: (value) => accepted.push(value), onRejected: () => undefined, onError: () => undefined });
  releaseFirst?.();
  await delay(10);

  assert.notEqual(first, second);
  assert.deepEqual(accepted, ['second:2']);
});

test('application-error fallback has no semantic output', () => {
  const inspection = createRawInspection(Uint8Array.from([1, 2]), 'dangerous<script>.bin', 'application-error');
  assert.equal(inspection.status, 'application-error');
  assert.equal(inspection.diagnostics.length, 0);
  assert.equal(inspection.structures.length, 0);
  assert.equal(inspection.unmappedSpans[0]?.label, 'Unmapped span');
});

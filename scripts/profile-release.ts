import { performance } from 'node:perf_hooks';
import {
  PNG_LIMITS,
  PNG_SIGNATURE,
  WAV_LIMITS,
  inspectPng,
  inspectWav,
  RIFF_SIGNATURE,
} from '../src/format.ts';
import { FileJobController, FILE_JOB_LIMITS } from '../src/file-session.ts';
import { INSPECTION_LIMITS } from '../src/domain/inspection.ts';
import { PNG_SAMPLE_BASE64, WAV_SAMPLE_BASE64 } from '../src/sample.ts';
import { chunk, ihdrRgba, png, validEveryDeclaredChunk } from '../tests/fixtures/png-contract.ts';
import { fmtPayload, metadataWav, wav } from '../tests/wav-fixtures.ts';

interface MemorySnapshot {
  rss: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

interface InspectionProfile {
  label: string;
  bytes: number;
  elapsedMs: number;
  structures: number;
  diagnostics: number;
  status: string | undefined;
  termination: string;
  complete: boolean;
  memoryDelta: MemorySnapshot;
}

function decode(base64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

function memory(): MemorySnapshot {
  const usage = process.memoryUsage();
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function delta(before: MemorySnapshot, after: MemorySnapshot): MemorySnapshot {
  return {
    rss: after.rss - before.rss,
    heapUsed: after.heapUsed - before.heapUsed,
    external: after.external - before.external,
    arrayBuffers: after.arrayBuffers - before.arrayBuffers,
  };
}

function profile(label: string, bytes: Uint8Array, inspect: (input: Uint8Array) => ReturnType<typeof inspectPng>): InspectionProfile {
  if (typeof global.gc === 'function') global.gc();
  const before = memory();
  const start = performance.now();
  const inspection = inspect(bytes);
  const elapsedMs = performance.now() - start;
  const after = memory();
  return {
    label,
    bytes: bytes.length,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    structures: inspection.structures.length,
    diagnostics: inspection.diagnostics.length,
    status: inspection.status,
    termination: inspection.termination,
    complete: inspection.complete,
    memoryDelta: delta(before, after),
  };
}

function oversized(prefix: Uint8Array, size: number): Uint8Array {
  const bytes = new Uint8Array(size + 1);
  bytes.set(prefix);
  return bytes;
}

function pngStructureCapFixture(): Uint8Array {
  const chunks = Array.from({ length: PNG_LIMITS.maxStructures + 8 }, () => chunk('IDAT', [0]));
  return png([ihdrRgba, ...chunks, chunk('IEND')]);
}

function pngDiagnosticCapFixture(): Uint8Array {
  const chunks = Array.from({ length: PNG_LIMITS.maxDiagnostics + 8 }, () => chunk('zzZZ', [0]));
  return png([ihdrRgba, ...chunks, chunk('IEND')]);
}

function wavStructureCapFixture(): Uint8Array {
  const chunks = Array.from({ length: WAV_LIMITS.maxStructures + 8 }, () => ({ id: 'JUNK', payload: [0] }));
  return wav([{ id: 'fmt ', payload: fmtPayload({ bitsPerSample: 8 }) }, ...chunks, { id: 'data', payload: [0] }]);
}

function wavDiagnosticCapFixture(): Uint8Array {
  const chunks = Array.from({ length: WAV_LIMITS.maxDiagnostics + 8 }, () => ({ id: 'fmt ', payload: [0] }));
  return wav([...chunks, { id: 'data', payload: [0] }]);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function profileCancellation(): Promise<Record<string, number | string[]>> {
  const events: string[] = [];
  const controller = new FileJobController<void>(
    async () => new Uint8Array([0]).buffer,
    async () => new Promise(() => undefined),
    async () => undefined,
    {
      slowNoticeMs: INSPECTION_LIMITS.slowNoticeMs,
      terminationDeadlineMs: INSPECTION_LIMITS.cancellationDeadlineMs,
    },
  );
  const start = performance.now();
  controller.start(new File([new Uint8Array([0])], 'slow.png'), {
    onPhase: () => undefined,
    onAccepted: () => undefined,
    onRejected: () => undefined,
    onSlow: () => events.push(`slow:${Math.round(performance.now() - start)}`),
    onAborted: () => events.push(`aborted:${Math.round(performance.now() - start)}`),
    onTerminated: () => events.push(`terminated:${Math.round(performance.now() - start)}`),
    onError: () => events.push('error'),
  });
  await wait(INSPECTION_LIMITS.slowNoticeMs + 30);
  const cancelStart = performance.now();
  controller.cancel();
  await wait(INSPECTION_LIMITS.cancellationDeadlineMs + 30);
  return {
    configuredSlowNoticeMs: FILE_JOB_LIMITS.slowNoticeMs,
    configuredTerminationDeadlineMs: FILE_JOB_LIMITS.terminationDeadlineMs,
    observedCancellationWindowMs: Math.round(performance.now() - cancelStart),
    events,
  };
}

async function main(): Promise<void> {
  const pngSample = decode(PNG_SAMPLE_BASE64);
  const wavSample = decode(WAV_SAMPLE_BASE64);
  const oversizedPng = oversized(PNG_SIGNATURE, PNG_LIMITS.maxBytes);
  const oversizedWav = oversized(new Uint8Array([...RIFF_SIGNATURE, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]), WAV_LIMITS.maxBytes);
  const profiles: InspectionProfile[] = [
    profile('PNG sample', pngSample, (bytes) => inspectPng(bytes, 'hexlens-sample.png')),
    profile('PNG all declared chunks', validEveryDeclaredChunk(), (bytes) => inspectPng(bytes, 'all-chunks.png')),
    profile('PNG adversarial structure cap', pngStructureCapFixture(), (bytes) => inspectPng(bytes, 'structure-cap.png')),
    profile('PNG adversarial Diagnostic cap', pngDiagnosticCapFixture(), (bytes) => inspectPng(bytes, 'diagnostic-cap.png')),
    profile('PNG size cap', oversizedPng, (bytes) => inspectPng(bytes, 'oversized.png')),
    profile('WAV sample', wavSample, (bytes) => inspectWav(bytes, 'hexlens-sample.wav')),
    profile('WAV metadata', metadataWav, (bytes) => inspectWav(bytes, 'metadata.wav')),
    profile('WAV adversarial structure cap', wavStructureCapFixture(), (bytes) => inspectWav(bytes, 'structure-cap.wav')),
    profile('WAV adversarial Diagnostic cap', wavDiagnosticCapFixture(), (bytes) => inspectWav(bytes, 'diagnostic-cap.wav')),
    profile('WAV size cap', oversizedWav, (bytes) => inspectWav(bytes, 'oversized.wav')),
  ];
  const cancellation = await profileCancellation();
  process.stdout.write(`${JSON.stringify({
    generatedAt: new Date().toISOString(),
    limits: INSPECTION_LIMITS,
    profiles,
    cancellation,
  }, null, 2)}\n`);
}

void main();

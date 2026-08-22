import assert from 'node:assert/strict';
import test from 'node:test';
import { FileJobController, type FileJobCallbacks } from '../src/file-session.ts';

function callbacks<T>(accepted: T[], rejected: string[] = []): FileJobCallbacks<T> {
  return {
    onPhase: () => undefined,
    onAccepted: (value) => accepted.push(value),
    onRejected: (rejection) => rejected.push(rejection.code),
    onError: () => rejected.push('application-error'),
  };
}

test('a superseded local file job cannot publish a late result', async () => {
  const accepted: string[] = [];
  const rejected: string[] = [];
  let releaseFirst: ((buffer: ArrayBuffer) => void) | undefined;
  const reader = async (file: File): Promise<ArrayBuffer> => {
    if (file.name === 'first.png') {
      return new Promise((resolve) => { releaseFirst = resolve; });
    }
    return new Uint8Array([2]).buffer;
  };
  const parser = (bytes: Uint8Array, file: File) => ({ accepted: true as const, value: `${file.name}:${bytes[0]}` });
  const controller = new FileJobController<string>(reader, parser, async () => undefined);
  const first = new File([new Uint8Array([1])], 'first.png', { type: 'image/png' });
  const second = new File([new Uint8Array([2])], 'second.png', { type: 'image/png' });

  controller.start(first, callbacks(accepted, rejected));
  controller.start(second, callbacks(accepted, rejected));
  releaseFirst?.(new Uint8Array([1]).buffer);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(accepted, ['second.png:2']);
  assert.deepEqual(rejected, []);
});

test('cancel acknowledges without publishing a read failure', async () => {
  const accepted: string[] = [];
  const rejected: string[] = [];
  let release: ((buffer: ArrayBuffer) => void) | undefined;
  const reader = async (): Promise<ArrayBuffer> => new Promise((resolve) => { release = resolve; });
  const parser = () => ({ accepted: true as const, value: 'late result' });
  const controller = new FileJobController<string>(reader, parser, async () => undefined);
  const file = new File([new Uint8Array([1])], 'cancelled.png', { type: 'image/png' });

  controller.start(file, callbacks(accepted, rejected));
  assert.equal(controller.cancel(), 1);
  release?.(new Uint8Array([1]).buffer);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(accepted, []);
  assert.deepEqual(rejected, []);
  assert.equal(controller.activeJobId, undefined);
});

test('cancel escalates to parser termination after the bounded deadline', async () => {
  let cancelCalls = 0;
  let terminateCalls = 0;
  const parser = Object.assign(
    async () => new Promise<{ accepted: true; value: string }>(() => undefined),
    {
      cancelJob: () => { cancelCalls += 1; },
      terminateJob: () => { terminateCalls += 1; },
    },
  );
  const controller = new FileJobController<string>(
    async () => Uint8Array.from([1]).buffer,
    parser,
    async () => undefined,
    { slowNoticeMs: 5, terminationDeadlineMs: 5 },
  );
  const events: string[] = [];
  controller.start(new File([Uint8Array.from([1])], 'hung.png'), {
    onPhase: () => undefined,
    onAccepted: () => events.push('accepted'),
    onRejected: () => events.push('rejected'),
    onAborted: () => events.push('aborted'),
    onTerminated: () => events.push('terminated'),
    onError: () => events.push('error'),
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.cancel();
  await new Promise((resolve) => setTimeout(resolve, 12));
  assert.equal(cancelCalls, 1);
  assert.equal(terminateCalls, 1);
  assert.deepEqual(events, ['aborted', 'terminated']);
});

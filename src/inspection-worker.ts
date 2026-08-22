import { inspectDetected } from './format.ts';

interface ParseRequest {
  type: 'parse';
  jobId: number;
  bytes: Uint8Array;
  sourceName: string;
  mimeType?: string;
}

interface AbortRequest {
  type: 'abort';
  jobId: number;
}

type WorkerRequest = ParseRequest | AbortRequest;

const controllers = new Map<number, AbortController>();
const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};

workerScope.onmessage = (event): void => {
  const request = event.data;
  if (request.type === 'abort') {
    controllers.get(request.jobId)?.abort();
    return;
  }

  const controller = new AbortController();
  controllers.set(request.jobId, controller);
  try {
    const inspection = inspectDetected(request.bytes, request.sourceName, {
      mimeType: request.mimeType,
      signal: controller.signal,
    });
    workerScope.postMessage({ type: 'result', jobId: request.jobId, result: { accepted: true, value: inspection } });
  } catch {
    // The application boundary never sends exception details or file-derived
    // strings back to the interface thread.
    workerScope.postMessage({ type: 'error', jobId: request.jobId });
  } finally {
    controllers.delete(request.jobId);
  }
};

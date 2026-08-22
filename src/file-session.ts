/**
 * A deliberately small seam around local file jobs.
 *
 * The UI owns the current Inspection. This controller only owns the lifecycle
 * of a read/parse attempt, so a late callback can never publish into a newer
 * Inspection. It is intentionally independent of PNG (or any other Format).
 */

import { INSPECTION_LIMITS } from './domain/inspection.ts';

export type FileJobPhase = 'reading' | 'parsing';

export const FILE_JOB_LIMITS = Object.freeze({
  slowNoticeMs: INSPECTION_LIMITS.slowNoticeMs,
  terminationDeadlineMs: INSPECTION_LIMITS.cancellationDeadlineMs,
});

export interface FileJobControllerOptions {
  slowNoticeMs?: number;
  terminationDeadlineMs?: number;
}

export interface FileJobRejection {
  code: 'unsupported_format' | 'limit_reached' | 'invalid_input';
}

export type FileJobParseResult<T> =
  | { accepted: true; value: T }
  | { accepted: false; rejection: FileJobRejection };

export interface FileJobCallbacks<T> {
  onPhase: (phase: FileJobPhase, jobId: number) => void;
  onAccepted: (value: T, file: File, jobId: number) => void;
  onRejected: (rejection: FileJobRejection, file: File, jobId: number) => void;
  /** Called once when the active job crosses the slow-operation threshold. */
  onSlow?: (jobId: number) => void;
  /** Called when cooperative cancellation is requested. */
  onAborted?: (jobId: number) => void;
  /** Called after the measured deadline when a parser/worker has not settled. */
  onTerminated?: (jobId: number) => void;
  /** Error details are intentionally not passed through; bytes are bounded and optional. */
  onError: (jobId: number, file?: File, bytes?: Uint8Array) => void;
}

export type FileReader = (file: File, signal: AbortSignal) => Promise<ArrayBuffer>;
export type FileParser<T> = ((bytes: Uint8Array, file: File, signal: AbortSignal, jobId?: number) => Promise<FileJobParseResult<T>> | FileJobParseResult<T>) & {
  cancelJob?: (jobId: number) => void;
  terminateJob?: (jobId: number) => void;
};

interface ActiveJob {
  id: number;
  controller: AbortController;
  callbacks: FileJobCallbacks<unknown>;
  slowTimer?: ReturnType<typeof setTimeout>;
  terminationTimer?: ReturnType<typeof setTimeout>;
  canceled: boolean;
}

function abortError(): DOMException {
  return new DOMException('The file job was aborted.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError();
}

/**
 * Default browser reader. File.arrayBuffer() cannot be force-cancelled by all
 * browsers, so the signal is checked both before and after the read. That
 * publish guard is the important safety property for replacement races.
 */
export async function readLocalFile(file: File, signal: AbortSignal): Promise<ArrayBuffer> {
  throwIfAborted(signal);
  // Read only the bounded prefix plus one byte. Parsers can then distinguish
  // an exact in-budget source from an over-limit source without loading an
  // arbitrarily large local file into memory.
  const buffer = await (file.size > INSPECTION_LIMITS.maxBytes
    ? file.slice(0, INSPECTION_LIMITS.maxBytes + 1).arrayBuffer()
    : file.arrayBuffer());
  throwIfAborted(signal);
  return buffer;
}

interface WorkerResult<T> {
  type: 'result';
  jobId: number;
  result: FileJobParseResult<T>;
}

interface WorkerFailure {
  type: 'error';
  jobId: number;
}

interface WorkerParserHandle<T> {
  resolve: (result: FileJobParseResult<T>) => void;
  reject: (error: unknown) => void;
  signal: AbortSignal;
  onAbort: () => void;
}

/**
 * Parse local bytes in a module Worker. The returned callable is still a
 * FileParser so the lifecycle controller can be tested with a synchronous
 * parser, while cancelJob/terminateJob give the browser path an explicit hard
 * stop for replacement and unresponsive work.
 */
export function createWorkerFileParser<T>(): FileParser<T> {
  let worker: Worker | undefined;
  const pending = new Map<number, WorkerParserHandle<T>>();

  const ensureWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL('./inspection-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResult<T> | WorkerFailure>): void => {
      const message = event.data;
      const handle = pending.get(message.jobId);
      if (!handle) return;
      pending.delete(message.jobId);
      handle.signal.removeEventListener('abort', handle.onAbort);
      if (message.type === 'error') handle.reject(new Error('Inspection worker failed.'));
      else handle.resolve(message.result);
    };
    worker.onerror = (): void => {
      for (const handle of pending.values()) {
        handle.signal.removeEventListener('abort', handle.onAbort);
        handle.reject(new Error('Inspection worker failed.'));
      }
      pending.clear();
      worker = undefined;
    };
    return worker;
  };

  const parser = (async (bytes: Uint8Array, file: File, signal: AbortSignal, jobId = 0): Promise<FileJobParseResult<T>> => {
    const workerRef = ensureWorker();
    return new Promise<FileJobParseResult<T>>((resolve, reject) => {
      const onAbort = (): void => {
        workerRef.postMessage({ type: 'abort', jobId });
      };
      pending.set(jobId, { resolve, reject, signal, onAbort });
      signal.addEventListener('abort', onAbort, { once: true });
      workerRef.postMessage({
        type: 'parse',
        jobId,
        bytes: new Uint8Array(bytes),
        sourceName: file.name,
        mimeType: file.type,
      });
    });
  }) as FileParser<T>;

  parser.cancelJob = (jobId: number): void => {
    worker?.postMessage({ type: 'abort', jobId });
  };
  parser.terminateJob = (_jobId: number): void => {
    worker?.terminate();
    worker = undefined;
    for (const handle of pending.values()) {
      handle.signal.removeEventListener('abort', handle.onAbort);
      handle.reject(new DOMException('The inspection worker was terminated.', 'AbortError'));
    }
    pending.clear();
  };
  return parser;
}

/** Yield once so a visible parsing state can paint before synchronous parsers run. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export class FileJobController<T> {
  private nextJobId = 0;
  private activeJob: ActiveJob | undefined;
  private readonly limits: Required<FileJobControllerOptions>;

  public constructor(
    private readonly reader: FileReader = readLocalFile,
    private readonly parser: FileParser<T>,
    private readonly yieldBeforeParse: () => Promise<void> = yieldToBrowser,
    options: FileJobControllerOptions = {},
  ) {
    this.limits = {
      slowNoticeMs: options.slowNoticeMs ?? FILE_JOB_LIMITS.slowNoticeMs,
      terminationDeadlineMs: options.terminationDeadlineMs ?? FILE_JOB_LIMITS.terminationDeadlineMs,
    };
  }

  public get activeJobId(): number | undefined {
    return this.activeJob?.id;
  }

  public isActive(jobId: number): boolean {
    return this.activeJob?.id === jobId && !this.activeJob.controller.signal.aborted;
  }

  /** Abort the active attempt and schedule the bounded termination fallback. */
  public cancel(notify = true): number | undefined {
    const active = this.activeJob;
    if (!active) return undefined;
    active.controller.abort();
    active.canceled = true;
    if (active.slowTimer !== undefined) clearTimeout(active.slowTimer);
    this.parser.cancelJob?.(active.id);
    if (notify) active.callbacks.onAborted?.(active.id);
    if (notify) {
      active.terminationTimer = setTimeout(() => {
        this.parser.terminateJob?.(active.id);
        active.callbacks.onTerminated?.(active.id);
      }, this.limits.terminationDeadlineMs);
    } else {
      // A replacement must not leave a non-cooperative worker ahead of the
      // new job. The worker parser starts a fresh worker for the replacement.
      this.parser.terminateJob?.(active.id);
    }
    this.activeJob = undefined;
    return active.id;
  }

  public start(file: File, callbacks: FileJobCallbacks<T>): number {
    this.cancel(false);
    const jobId = ++this.nextJobId;
    const controller = new AbortController();
    const active: ActiveJob = {
      id: jobId,
      controller,
      callbacks: callbacks as FileJobCallbacks<unknown>,
      canceled: false,
    };
    active.slowTimer = setTimeout(() => {
      if (this.isActive(jobId)) callbacks.onSlow?.(jobId);
    }, this.limits.slowNoticeMs);
    this.activeJob = active;
    void this.run(file, jobId, controller, callbacks);
    return jobId;
  }

  private async run(file: File, jobId: number, controller: AbortController, callbacks: FileJobCallbacks<T>): Promise<void> {
    const { signal } = controller;
    const record = this.activeJob;
    let sourceBuffer: ArrayBuffer | undefined;
    try {
      callbacks.onPhase('reading', jobId);
      sourceBuffer = await this.reader(file, signal);
      if (!this.isActive(jobId)) {
        if (record?.terminationTimer !== undefined) clearTimeout(record.terminationTimer);
        return;
      }

      callbacks.onPhase('parsing', jobId);
      await this.yieldBeforeParse();
      if (!this.isActive(jobId)) {
        if (record?.terminationTimer !== undefined) clearTimeout(record.terminationTimer);
        return;
      }

      const result = await this.parser(new Uint8Array(sourceBuffer), file, signal, jobId);
      if (!this.isActive(jobId)) {
        if (record?.terminationTimer !== undefined) clearTimeout(record.terminationTimer);
        return;
      }

      if (result.accepted) callbacks.onAccepted(result.value, file, jobId);
      else callbacks.onRejected(result.rejection, file, jobId);
      const active = this.activeJob;
      if (this.isActive(jobId)) {
        if (active?.slowTimer !== undefined) clearTimeout(active.slowTimer);
        this.activeJob = undefined;
      }
    } catch (error) {
      // An aborted or superseded attempt has no visible error. In particular,
      // do not surface exception payloads that could contain file details.
      if (!this.isActive(jobId) || signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (record?.terminationTimer !== undefined) clearTimeout(record.terminationTimer);
        return;
      }
      const active = this.activeJob;
      if (active?.slowTimer !== undefined) clearTimeout(active.slowTimer);
      // A parser failure is application state, not a parser Diagnostic. Pass
      // only the bounded source bytes to the integration layer; never pass the
      // exception text, filename-derived details, or semantic partial result.
      const bytes = sourceBuffer ? new Uint8Array(sourceBuffer) : undefined;
      callbacks.onError(jobId, file, bytes);
      if (this.isActive(jobId)) this.activeJob = undefined;
    }
  }
}

/**
 * A deliberately small seam around local file jobs.
 *
 * The UI owns the current Inspection. This controller only owns the lifecycle
 * of a read/parse attempt, so a late callback can never publish into a newer
 * Inspection. It is intentionally independent of PNG (or any other Format).
 */

export type FileJobPhase = 'reading' | 'parsing';

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
  onError: (jobId: number) => void;
}

export type FileReader = (file: File, signal: AbortSignal) => Promise<ArrayBuffer>;
export type FileParser<T> = (bytes: Uint8Array, file: File, signal: AbortSignal) => Promise<FileJobParseResult<T>> | FileJobParseResult<T>;

interface ActiveJob {
  id: number;
  controller: AbortController;
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
  const buffer = await file.arrayBuffer();
  throwIfAborted(signal);
  return buffer;
}

/** Yield once so a visible parsing state can paint before synchronous parsers run. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export class FileJobController<T> {
  private nextJobId = 0;
  private activeJob: ActiveJob | undefined;

  public constructor(
    private readonly reader: FileReader = readLocalFile,
    private readonly parser: FileParser<T>,
    private readonly yieldBeforeParse: () => Promise<void> = yieldToBrowser,
  ) {}

  public get activeJobId(): number | undefined {
    return this.activeJob?.id;
  }

  public isActive(jobId: number): boolean {
    return this.activeJob?.id === jobId && !this.activeJob.controller.signal.aborted;
  }

  /** Abort the active attempt. Its callbacks are intentionally not replayed. */
  public cancel(): number | undefined {
    const active = this.activeJob;
    if (!active) return undefined;
    active.controller.abort();
    this.activeJob = undefined;
    return active.id;
  }

  public start(file: File, callbacks: FileJobCallbacks<T>): number {
    this.cancel();
    const jobId = ++this.nextJobId;
    const controller = new AbortController();
    this.activeJob = { id: jobId, controller };
    void this.run(file, jobId, controller, callbacks);
    return jobId;
  }

  private async run(file: File, jobId: number, controller: AbortController, callbacks: FileJobCallbacks<T>): Promise<void> {
    const { signal } = controller;
    try {
      callbacks.onPhase('reading', jobId);
      const buffer = await this.reader(file, signal);
      if (!this.isActive(jobId)) return;

      callbacks.onPhase('parsing', jobId);
      await this.yieldBeforeParse();
      if (!this.isActive(jobId)) return;

      const result = await this.parser(new Uint8Array(buffer), file, signal);
      if (!this.isActive(jobId)) return;

      if (result.accepted) callbacks.onAccepted(result.value, file, jobId);
      else callbacks.onRejected(result.rejection, file, jobId);
      if (this.isActive(jobId)) this.activeJob = undefined;
    } catch (error) {
      // An aborted or superseded attempt has no visible error. In particular,
      // do not surface exception payloads that could contain file details.
      if (!this.isActive(jobId) || signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      callbacks.onError(jobId);
      if (this.isActive(jobId)) this.activeJob = undefined;
    }
  }
}

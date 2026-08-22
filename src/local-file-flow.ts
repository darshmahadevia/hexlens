import type { Inspection } from './domain/inspection.ts';
import {
  createWorkerFileParser,
  FileJobController,
  FILE_JOB_LIMITS,
  type FileJobCallbacks,
  type FileJobPhase,
  type FileJobRejection,
} from './file-session.ts';
import { INSPECTION_LIMITS } from './domain/inspection.ts';

export type LocalFileOrigin = 'landing' | 'inspect';

export interface LocalFileFlowCallbacks {
  onOversize: (origin: LocalFileOrigin, file: File) => void;
  onPhase: (phase: FileJobPhase, jobId: number, origin: LocalFileOrigin) => void;
  onAccepted: (inspection: Inspection, file: File, jobId: number, origin: LocalFileOrigin) => void;
  onRejected: (rejection: FileJobRejection, file: File, jobId: number, origin: LocalFileOrigin) => void;
  onSlow: (jobId: number, origin: LocalFileOrigin) => void;
  onAborted: (jobId: number, origin: LocalFileOrigin) => void;
  onTerminated: (jobId: number, origin: LocalFileOrigin) => void;
  onError: (jobId: number, file: File | undefined, bytes: Uint8Array | undefined, origin: LocalFileOrigin) => void;
}

/** Browser-facing local file lifecycle. Parsing is always delegated to the Worker parser. */
export class LocalFileFlow {
  private readonly jobs: FileJobController<Inspection>;

  public constructor() {
    const parser = createWorkerFileParser<Inspection>();
    this.jobs = new FileJobController<Inspection>(undefined, parser);
  }

  public isActive(jobId: number): boolean {
    return this.jobs.isActive(jobId);
  }

  public start(file: File, origin: LocalFileOrigin, callbacks: LocalFileFlowCallbacks): number | undefined {
    // Selecting a new file supersedes any active read/parse attempt, even when
    // the replacement is rejected before it reaches the Worker.
    this.jobs.cancel(false);
    if (file.size > INSPECTION_LIMITS.maxBytes) {
      callbacks.onOversize(origin, file);
      return undefined;
    }

    const controllerCallbacks: FileJobCallbacks<Inspection> = {
      onPhase: (phase, jobId) => callbacks.onPhase(phase, jobId, origin),
      onAccepted: (inspection, acceptedFile, jobId) => callbacks.onAccepted(inspection, acceptedFile, jobId, origin),
      onRejected: (rejection, rejectedFile, jobId) => callbacks.onRejected(rejection, rejectedFile, jobId, origin),
      onSlow: (jobId) => callbacks.onSlow(jobId, origin),
      onAborted: (jobId) => callbacks.onAborted(jobId, origin),
      onTerminated: (jobId) => callbacks.onTerminated(jobId, origin),
      onError: (jobId, failedFile, bytes) => callbacks.onError(jobId, failedFile, bytes, origin),
    };
    return this.jobs.start(file, controllerCallbacks);
  }

  public cancel(): number | undefined {
    return this.jobs.cancel();
  }

  public static readonly limits = FILE_JOB_LIMITS;
}

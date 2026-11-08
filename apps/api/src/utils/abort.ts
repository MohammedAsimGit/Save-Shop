/**
 * Raised when a long-running job is asked to stop (SIGINT/SIGTERM).
 *
 * Distinct from a failure: the retention job records an `aborted` run rather than
 * a `failed` one, and nothing is deleted for the day that was interrupted.
 */
export class OperationAbortedError extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'OperationAbortedError';
  }
}

/** Throws `OperationAbortedError` if the signal has fired. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new OperationAbortedError();
}

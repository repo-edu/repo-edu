export function addCleanupCause(failure: Error, cleanupError: unknown): void {
  failure.cause =
    failure.cause === undefined
      ? cleanupError
      : new AggregateError([failure.cause, cleanupError])
}

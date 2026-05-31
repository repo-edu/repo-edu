export const defaultRetryDelaysMs = [300, 900, 2000] as const

export function isRetryableWorkflowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "retryable" in error &&
    (error as { retryable?: unknown }).retryable === true
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type RunWithRetryOptions = {
  retryDelaysMs?: readonly number[]
  shouldRetry?: (error: unknown) => boolean
  isCancelled?: () => boolean
}

function isCancelled(options: RunWithRetryOptions): boolean {
  return options.isCancelled?.() ?? false
}

// Retries a single workflow operation on retryable errors with the same delay
// schedule the snapshot persister uses, so one-shot detached writes (course
// create, duplicate, inactive rename) recover from transient failures on the
// same terms as the active course worker.
export async function runWithRetry<T>(
  operation: () => Promise<T>,
  options: RunWithRetryOptions = {},
): Promise<T> {
  const retryDelaysMs = options.retryDelaysMs ?? defaultRetryDelaysMs
  const shouldRetry = options.shouldRetry ?? isRetryableWorkflowError

  for (let attempt = 0; ; attempt += 1) {
    if (isCancelled(options)) {
      throw new Error("Retry operation was cancelled.")
    }
    try {
      return await operation()
    } catch (error) {
      if (
        attempt < retryDelaysMs.length &&
        shouldRetry(error) &&
        !isCancelled(options)
      ) {
        await delay(retryDelaysMs[attempt])
        if (isCancelled(options)) {
          throw error
        }
        continue
      }
      throw error
    }
  }
}

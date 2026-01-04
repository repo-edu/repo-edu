/**
 * Debounce utility for delaying function execution.
 * Used for validation calls after roster mutations.
 */

/**
 * Creates a debounced version of a function that delays execution
 * until after the specified wait time has elapsed since the last call.
 *
 * @param fn - The function to debounce
 * @param ms - The debounce delay in milliseconds (default: 200)
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  ms = 200,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      fn(...args)
      timeoutId = null
    }, ms)
  }
}

/**
 * Creates a debounced version of an async function.
 * Only the last call within the debounce window will execute.
 *
 * @param fn - The async function to debounce
 * @param ms - The debounce delay in milliseconds (default: 200)
 * @returns A debounced version of the async function
 */
export function debounceAsync<
  T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(fn: T, ms = 200): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      void fn(...args)
      timeoutId = null
    }, ms)
  }
}

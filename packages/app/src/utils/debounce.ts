export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  ms = 200,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, ms);
  };
}

export function debounceAsync<
  T extends (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>,
>(fn: T, ms = 200): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      void fn(...args);
      timeoutId = null;
    }, ms);
  };
}

import type { SessionOperationScope } from "./session-operations.js"

/** A caller that already owns a body awaits fetchQuery through publication.
 * Its signal alone cancels host work; removing an observer cannot cancel it.
 * Keep cancelled query functions in that body until their host work settles. */
export function scopedSessionQueryOptions<T>(
  scope: SessionOperationScope,
  signal: AbortSignal,
  fetch: (signal: AbortSignal) => Promise<T>,
) {
  return {
    retry: false as const,
    networkMode: "always" as const,
    queryFn: () =>
      scope.follow(async () => {
        signal.throwIfAborted()
        return await fetch(signal)
      }),
  }
}

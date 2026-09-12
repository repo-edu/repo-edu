import type { SessionOperationScope } from "./session-operations.js"

/** A caller that already owns a body awaits fetchQuery through publication.
 * Its optional signal alone cancels host work; observer removal never does.
 * Without a signal, host work runs to completion.
 * Keep cancelled query functions in that body until their host work settles. */
export function scopedSessionQueryOptions<T>(
  scope: SessionOperationScope,
  fetch: (signal: AbortSignal | undefined) => Promise<T>,
  signal?: AbortSignal,
) {
  return {
    retry: false as const,
    networkMode: "always" as const,
    queryFn: () =>
      scope.follow(async () => {
        signal?.throwIfAborted()
        return await fetch(signal)
      }),
  }
}

import type { QueryFunctionContext } from "@tanstack/react-query"
import type { SessionOperationScope } from "./session-operations.js"

/** A caller that already owns a body awaits fetchQuery through publication.
 * The reservation's stop alone cancels host work; observer removal never does.
 * A stop reverts the query rather than failing it, so a cancelled fetch shows
 * no error, and its query function stays in that body until the host settles. */
export function scopedSessionQueryOptions<T>(
  scope: SessionOperationScope,
  fetch: () => Promise<T>,
) {
  return {
    retry: false as const,
    networkMode: "always" as const,
    queryFn: ({ client, queryKey }: QueryFunctionContext) => {
      const revert = () => {
        void client.cancelQueries({ queryKey, exact: true })
      }
      scope.signal.addEventListener("abort", revert, { once: true })
      return scope.follow(async () => {
        try {
          scope.signal.throwIfAborted()
          return await fetch()
        } finally {
          scope.signal.removeEventListener("abort", revert)
        }
      })
    },
  }
}

import {
  CancelledError,
  type QueryFunctionContext,
} from "@tanstack/react-query"
import type { SessionQueryWorkflowId } from "./session-operation-inventory.js"
import type {
  SessionOperationGateway,
  SessionOperationScope,
} from "./session-operations.js"

/** Query owns its cache; the session owns the complete fetch and publication
 * interval. Resolving the query function is only the hand-off to publication,
 * never the end of the session body. */
export function sessionQueryOptions<T>(
  operations: SessionOperationGateway,
  operation: SessionQueryWorkflowId,
  fetch: (
    scope: SessionOperationScope,
    context: QueryFunctionContext,
  ) => Promise<T>,
  follow?: (scope: SessionOperationScope, result: T) => Promise<void>,
) {
  return {
    retry: false as const,
    networkMode: "always" as const,
    queryFn: (context: QueryFunctionContext): Promise<T> => {
      const reservation = operations.reserve<void>(operation)
      if (reservation === null) {
        // Admission can close after the render that enabled this query.
        // Revert the fetch so release can start it without a lasting error.
        void context.client.cancelQueries(
          { queryKey: context.queryKey, exact: true },
          { revert: true },
        )
        return Promise.reject(new CancelledError({ revert: true }))
      }

      const { client, queryKey, signal } = context
      const cache = client.getQueryCache()
      const query = cache.find({ queryKey, exact: true })
      if (query === undefined)
        return reservation.cancel(
          new Error("The session query has no cache owner."),
        ) as Promise<never>

      let resolve!: (result: T) => void
      let reject!: (error: unknown) => void
      const result = new Promise<T>((accept, refuse) => {
        resolve = accept
        reject = refuse
      })
      let published!: () => void
      const publication = new Promise<void>((accept) => {
        published = accept
      })
      const unsubscribe = cache.subscribe((event) => {
        if (event.query !== query || event.type !== "updated") return
        if (
          (event.action.type === "success" && !event.action.manual) ||
          event.action.type === "error"
        )
          published()
      })
      // Cancellation may revert or remove a cache entry without a success/error
      // publication. The body still awaits the host and all its callbacks.
      signal.addEventListener("abort", published, { once: true })
      if (signal.aborted) published()

      void reservation
        .run(async (scope) => {
          try {
            signal.throwIfAborted()
            const data = await fetch(scope, context)
            scope.publish(() => resolve(data))
            await publication
            if (!signal.aborted && follow !== undefined) {
              try {
                await scope.follow(() => follow(scope, data))
              } catch (error) {
                // Query has already published success. Do not hide a later
                // semantic failure in an already-resolved query promise.
                console.error("Session query follow-up failed", error)
                throw error
              }
            }
          } catch (error) {
            reject(error)
            await publication
            throw error
          } finally {
            unsubscribe()
            signal.removeEventListener("abort", published)
          }
        })
        .catch((error: unknown) => {
          // Also settle a query whose queued body was refused after disposal.
          reject(error)
          unsubscribe()
          signal.removeEventListener("abort", published)
        })
      return result
    },
  }
}

import type { CommitPersistencePreparation } from "@repo-edu/application-contract"
import type {
  RendererRequest,
  RendererRequestObserver,
} from "./preload-request-transport"
import type { RequestPersistenceResult } from "./request-port-wire"

/** Promise lifetime is the request's lifetime, never an ordinary save call. */
export function createRequestPersistenceExchange(
  request: Pick<RendererRequest, "persist">,
): {
  commit: CommitPersistencePreparation
  persisted: RendererRequestObserver["persisted"]
  failed: RendererRequestObserver["failed"]
} {
  let resolve!: (result: RequestPersistenceResult) => void
  let reject!: (error: Error) => void
  const result = new Promise<RequestPersistenceResult>((yes, no) => {
    resolve = yes
    reject = no
  })
  void result.catch(() => undefined)
  return {
    async commit(bundle) {
      request.persist(bundle)
      return await result
    },
    persisted: resolve,
    failed: (message) => reject(new Error(message)),
  }
}

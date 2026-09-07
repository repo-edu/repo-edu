import type {
  CommitPersistencePreparation,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import type { HostAdmission } from "./host-admission"
import type { HostRequest } from "./host-admission-model"
import type { createHostRequestTransport } from "./host-request-transport"
import type {
  RendererRequest,
  RendererRequestObserver,
} from "./preload-request-transport"
import type {
  RequestPersistenceBundle,
  RequestPersistenceResult,
} from "./request-port-wire"

export type PreparationHandlers = Pick<
  WorkflowHandlerMap,
  "course.save" | "settings.saveCredentials" | "settings.savePreferences"
>

/** The protocol has admitted exactly one bundle before this body starts. */
export async function commitRequestPersistence(options: {
  request: HostRequest
  bundle: RequestPersistenceBundle
  admission: HostAdmission
  handlers: PreparationHandlers
  transport: Pick<
    ReturnType<typeof createHostRequestTransport>,
    "persistenceCommitted"
  >
}): Promise<void> {
  const { request, bundle, admission, handlers, transport } = options
  const current = () => {
    const state = admission.getSnapshot()
    return (
      "request" in state &&
      state.request === request &&
      ((state.phase === "preparing" && state.stage === "bundle-pending") ||
        state.phase === "closing.preparing")
    )
  }
  try {
    if (!current()) return
    const result: RequestPersistenceResult = {}
    if (bundle.credentials) {
      await handlers["settings.saveCredentials"](bundle.credentials)
      if (!current()) return
    }
    if (bundle.preferences) {
      await handlers["settings.savePreferences"](bundle.preferences)
      if (!current()) return
    }
    if (bundle.course) {
      const stamp = await handlers["course.save"](bundle.course)
      if (!current()) return
      result.course = { courseId: bundle.course.id, ...stamp }
    }
    if (admission.getSnapshot().phase === "preparing")
      admission.dispatch({ type: "preparation-committed", request })
    transport.persistenceCommitted(request, result)
  } catch (error) {
    admission.dispatch({ type: "terminal", error })
  }
}

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

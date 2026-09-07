import type {
  WorkflowClient,
  WorkflowId,
  WorkflowInput,
  WorkflowResult,
} from "@repo-edu/application-contract"
import { HostAdmissionRefusedError } from "@repo-edu/application-contract"

export type PersistenceSyncStatus =
  | { state: "idle"; message: null }
  | { state: "saving"; message: null }
  | { state: "error"; message: string }

export const idleSyncStatus: PersistenceSyncStatus = {
  state: "idle",
  message: null,
}

export const savingSyncStatus: PersistenceSyncStatus = {
  state: "saving",
  message: null,
}

export type PersistenceClaim<TSnapshot, TResult> = {
  snapshot: TSnapshot
  apply(result: TResult): Promise<void>
}

export type WorkerStartGate = {
  canStart(): boolean
  subscribe(listener: () => void): () => void
  terminal(error: unknown): void
}

export type Persister<TSnapshot = unknown, TResult = unknown> = {
  flush: () => Promise<void>
  waitForIdle: () => Promise<void>
  claim: () => Promise<PersistenceClaim<TSnapshot, TResult> | null>
  dispose: () => void
}

export async function settlePersistenceOperations(
  operations: readonly Promise<void>[],
): Promise<void> {
  const outcomes = await Promise.allSettled(operations)
  const failure = outcomes.find(
    (outcome): outcome is PromiseRejectedResult =>
      outcome.status === "rejected",
  )
  if (failure !== undefined) throw failure.reason
}

type SaveWorkflowId<TSnapshot> = {
  [TId in WorkflowId]: WorkflowInput<TId> extends TSnapshot
    ? TSnapshot extends WorkflowInput<TId>
      ? TId
      : never
    : never
}[WorkflowId]

export type PersisterAdapter<
  TSnapshot,
  TWorkflowId extends SaveWorkflowId<TSnapshot>,
> = {
  workflowClient: WorkflowClient<TWorkflowId>
  workflowId: TWorkflowId
  startGate: WorkerStartGate
  getSnapshot: () => TSnapshot | null
  initialBaseline?: TSnapshot | null
  subscribe: (listener: () => void) => () => void
  setSyncStatus: (status: PersistenceSyncStatus) => void
  formatTerminalError: (error: unknown, snapshot: TSnapshot) => string
  applySaveResult?: (
    result: WorkflowResult<TWorkflowId>,
    snapshot: TSnapshot,
  ) => void | Promise<void>
  savedSnapshot?: (
    snapshot: TSnapshot,
    result: WorkflowResult<TWorkflowId>,
  ) => TSnapshot
  getSnapshotIdentity?: (snapshot: TSnapshot) => string
  snapshotsEqual?: (left: TSnapshot, right: TSnapshot) => boolean
  debounceMs?: number
}

function shallowSnapshotEqual<TSnapshot>(
  left: TSnapshot,
  right: TSnapshot,
): boolean {
  if (Object.is(left, right)) return true
  if (
    typeof left !== "object" ||
    left === null ||
    typeof right !== "object" ||
    right === null
  ) {
    return false
  }

  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every((key) => Object.is(leftRecord[key], rightRecord[key]))
}

export function createPersister<
  TSnapshot,
  TWorkflowId extends SaveWorkflowId<TSnapshot>,
>(
  adapter: PersisterAdapter<TSnapshot, TWorkflowId>,
): Persister<TSnapshot, WorkflowResult<TWorkflowId>> {
  const equal = adapter.snapshotsEqual ?? shallowSnapshotEqual
  const identity = (snapshot: TSnapshot | null) =>
    snapshot === null ? null : (adapter.getSnapshotIdentity?.(snapshot) ?? null)
  let baseline =
    adapter.initialBaseline === undefined
      ? adapter.getSnapshot()
      : adapter.initialBaseline
  let observed = baseline
  let timer: ReturnType<typeof setTimeout> | null = null
  let requested = false
  let worker: Promise<void> | null = null
  let lifetime: { kind: "live" } | { kind: "disposed"; error?: unknown } = {
    kind: "live",
  }
  let reporting = false
  const idleWaiters = new Set<() => void>()

  const mayStart = () =>
    lifetime.kind === "live" && adapter.startGate.canStart()
  const dirty = (snapshot: TSnapshot | null): snapshot is TSnapshot =>
    snapshot !== null && baseline !== null && !equal(snapshot, baseline)

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function resolveIdle() {
    if (timer !== null || requested || worker !== null) return
    for (const resolve of idleWaiters) resolve()
    idleWaiters.clear()
  }

  function report(status: PersistenceSyncStatus) {
    reporting = true
    try {
      adapter.setSyncStatus(status)
    } finally {
      reporting = false
    }
  }

  function adopt(snapshot: TSnapshot | null) {
    baseline = snapshot
    observed = snapshot
    requested = false
    clearTimer()
    report(idleSyncStatus)
    resolveIdle()
  }

  function schedule() {
    if (!mayStart()) return
    requested = true
    if (timer !== null || worker !== null) return
    timer = setTimeout(() => {
      timer = null
      void ensureWorker().catch(() => undefined)
    }, adapter.debounceMs ?? 300)
  }

  function changed() {
    if (lifetime.kind !== "live" || reporting) return
    const snapshot = adapter.getSnapshot()
    if (
      snapshot === observed ||
      (snapshot !== null && observed !== null && equal(snapshot, observed))
    )
      return
    observed = snapshot
    if (
      snapshot === null ||
      baseline === null ||
      identity(snapshot) !== identity(baseline)
    ) {
      adopt(snapshot)
    } else if (dirty(snapshot)) {
      schedule()
    }
  }

  function dispose() {
    if (lifetime.kind === "live") lifetime = { kind: "disposed" }
    clearTimer()
    requested = false
    unsubscribe()
    unsubscribeGate()
    resolveIdle()
  }

  function fail(error: unknown, snapshot: TSnapshot) {
    if (lifetime.kind !== "live") return
    lifetime = { kind: "disposed", error }
    dispose()
    report({
      state: "error",
      message: adapter.formatTerminalError(error, snapshot),
    })
    adapter.startGate.terminal(error)
  }

  async function apply(
    result: WorkflowResult<TWorkflowId>,
    snapshot: TSnapshot,
  ) {
    if (lifetime.kind !== "live") return
    if (identity(adapter.getSnapshot()) !== identity(snapshot)) return
    await adapter.applySaveResult?.(result, snapshot)
    if (lifetime.kind !== "live") return
    const current = adapter.getSnapshot()
    if (identity(current) !== identity(snapshot)) return
    // The saved baseline is the submitted document plus its host stamp.
    // Reading the current document here would consume edits made while awaiting
    // the renderer callback.
    baseline = adapter.savedSnapshot?.(snapshot, result) ?? snapshot
    observed = current
    report(idleSyncStatus)
    if (dirty(current)) schedule()
  }

  async function save(snapshot: TSnapshot) {
    report(savingSyncStatus)
    try {
      const result = await adapter.workflowClient.run(
        adapter.workflowId,
        snapshot as WorkflowInput<TWorkflowId>,
      )
      await apply(result, snapshot)
    } catch (error) {
      requested = false
      clearTimer()
      if (error instanceof HostAdmissionRefusedError) report(idleSyncStatus)
      else fail(error, snapshot)
      throw error
    }
  }

  async function runWorker() {
    try {
      while (requested && mayStart()) {
        requested = false
        const snapshot = adapter.getSnapshot()
        if (
          snapshot === null ||
          baseline === null ||
          identity(snapshot) !== identity(baseline)
        )
          adopt(snapshot)
        else if (dirty(snapshot)) await save(snapshot)
      }
    } finally {
      worker = null
      requested = false
      resolveIdle()
    }
  }

  function ensureWorker() {
    worker ??= Promise.resolve().then(runWorker)
    return worker
  }

  const unsubscribe = adapter.subscribe(changed)
  const unsubscribeGate = adapter.startGate.subscribe(() => {
    if (lifetime.kind !== "live" || reporting) return
    if (!mayStart()) {
      clearTimer()
      requested = false
      resolveIdle()
    } else if (dirty(adapter.getSnapshot())) schedule()
  })
  changed()

  return {
    async claim() {
      if (mayStart())
        throw new Error(
          "Persistence preparation requires a closed worker-start gate.",
        )
      clearTimer()
      requested = false
      try {
        await worker
      } catch (error) {
        if (!(error instanceof HostAdmissionRefusedError)) throw error
      }
      if (lifetime.kind !== "live")
        throw new Error("The persistence worker is disposed.")
      const snapshot = adapter.getSnapshot()
      if (!dirty(snapshot)) return null
      return {
        snapshot,
        async apply(result) {
          try {
            await apply(result, snapshot)
          } catch (error) {
            fail(error, snapshot)
            throw error
          }
        },
      }
    },
    async flush() {
      if (lifetime.kind === "disposed") {
        if (lifetime.error !== undefined) throw lifetime.error
        return
      }
      if (!mayStart()) {
        await worker
        if (dirty(adapter.getSnapshot())) throw new HostAdmissionRefusedError()
        return
      }
      clearTimer()
      if (dirty(adapter.getSnapshot())) requested = true
      if (requested || worker !== null) await ensureWorker()
    },
    async waitForIdle() {
      if (timer === null && !requested && worker === null) return
      await new Promise<void>((resolve) => {
        idleWaiters.add(resolve)
      })
    },
    dispose,
  }
}

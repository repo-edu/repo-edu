import type {
  WorkflowClient,
  WorkflowId,
  WorkflowInput,
  WorkflowResult,
} from "@repo-edu/application-contract"

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

export type Persister = {
  flush: () => Promise<void>
  waitForIdle: () => Promise<void>
  dispose: () => void
}

type SaveWorkflowId<TSnapshot> = {
  [TId in WorkflowId]: WorkflowInput<TId> extends TSnapshot
    ? TSnapshot extends WorkflowInput<TId>
      ? TId
      : never
    : never
}[WorkflowId]

type PersisterErrorDecision =
  | { kind: "retry" }
  | { kind: "terminal" }
  | { kind: "pause"; message?: string }

export type PersisterAdapter<
  TSnapshot,
  TWorkflowId extends SaveWorkflowId<TSnapshot>,
> = {
  workflowClient: WorkflowClient
  workflowId: TWorkflowId
  getSnapshot: () => TSnapshot | null
  initialBaseline?: TSnapshot | null
  subscribe: (listener: () => void) => () => void
  setSyncStatus: (status: PersistenceSyncStatus) => void
  formatTerminalError: (error: unknown, snapshot: TSnapshot) => string
  classifyError?: (
    error: unknown,
    snapshot: TSnapshot,
  ) => PersisterErrorDecision | null
  applySaveResult?: (
    result: WorkflowResult<TWorkflowId>,
    snapshot: TSnapshot,
  ) => void
  getSnapshotIdentity?: (snapshot: TSnapshot) => string
  snapshotsEqual?: (left: TSnapshot, right: TSnapshot) => boolean
  debounceMs?: number
  retryDelaysMs?: readonly number[]
}

const defaultRetryDelaysMs = [300, 900, 2000] as const

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

function defaultClassifyError(error: unknown): PersisterErrorDecision {
  if (typeof error === "object" && error !== null && "retryable" in error) {
    const retryable = (error as { retryable?: unknown }).retryable
    if (retryable === true) {
      return { kind: "retry" }
    }
  }

  return { kind: "terminal" }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createPersister<
  TSnapshot,
  TWorkflowId extends SaveWorkflowId<TSnapshot>,
>(adapter: PersisterAdapter<TSnapshot, TWorkflowId>): Persister {
  const debounceMs = adapter.debounceMs ?? 300
  const retryDelaysMs = adapter.retryDelaysMs ?? defaultRetryDelaysMs
  const snapshotsEqual = adapter.snapshotsEqual ?? shallowSnapshotEqual

  let baseline =
    adapter.initialBaseline === undefined
      ? adapter.getSnapshot()
      : adapter.initialBaseline
  let baselineIdentity = baseline ? getIdentity(baseline) : null
  let observedSnapshot = baseline
  let observedSnapshotIdentity = baselineIdentity
  let pausedIdentity: string | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let saveRequested = false
  let worker: Promise<void> | null = null
  let disposed = false
  let suppressSnapshotNotifications = false
  let terminalError: {
    identity: string | null
    error: unknown
  } | null = null
  const idleResolvers = new Set<() => void>()

  function getIdentity(snapshot: TSnapshot): string | null {
    return adapter.getSnapshotIdentity?.(snapshot) ?? null
  }

  function clearDebounceTimer() {
    if (debounceTimer === null) return
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  function resolveIdleWaiters() {
    if (debounceTimer !== null || saveRequested || worker !== null) {
      return
    }

    for (const resolve of idleResolvers) {
      resolve()
    }
    idleResolvers.clear()
  }

  function adoptSnapshot(snapshot: TSnapshot | null) {
    baseline = snapshot
    baselineIdentity = snapshot ? getIdentity(snapshot) : null
    observeSnapshot(snapshot)
    pausedIdentity = null
    saveRequested = false
    terminalError = null
    clearDebounceTimer()
    setSyncStatus(idleSyncStatus)
    resolveIdleWaiters()
  }

  function setSyncStatus(status: PersistenceSyncStatus) {
    suppressSnapshotNotifications = true
    try {
      adapter.setSyncStatus(status)
    } finally {
      suppressSnapshotNotifications = false
    }
  }

  function snapshotNeedsSave(
    snapshot: TSnapshot | null,
  ): snapshot is TSnapshot {
    if (snapshot === null) return false
    if (baseline === null) return false
    return !snapshotsEqual(snapshot, baseline)
  }

  function clearTerminalErrorForIdentity(identity: string | null) {
    if (terminalError?.identity === identity) {
      terminalError = null
    }
    if (pausedIdentity === identity) {
      pausedIdentity = null
    }
  }

  function terminalErrorAppliesTo(snapshot: TSnapshot | null): boolean {
    return (
      terminalError !== null &&
      snapshot !== null &&
      getIdentity(snapshot) === terminalError.identity &&
      snapshotNeedsSave(snapshot)
    )
  }

  function clearStaleTerminalError(snapshot: TSnapshot | null): boolean {
    if (terminalError === null || terminalErrorAppliesTo(snapshot)) {
      return false
    }

    clearTerminalErrorForIdentity(terminalError.identity)
    return true
  }

  function setIdleIfNoWork() {
    if (debounceTimer === null && !saveRequested && worker === null) {
      setSyncStatus(idleSyncStatus)
    }
  }

  function observeSnapshot(snapshot: TSnapshot | null) {
    observedSnapshot = snapshot
    observedSnapshotIdentity = snapshot ? getIdentity(snapshot) : null
  }

  function snapshotSelectionChanged(snapshot: TSnapshot | null): boolean {
    if (snapshot === null || observedSnapshot === null) {
      return snapshot !== observedSnapshot
    }

    const identity = getIdentity(snapshot)
    if (identity !== observedSnapshotIdentity) {
      return true
    }

    return !snapshotsEqual(snapshot, observedSnapshot)
  }

  function requestSave() {
    if (disposed) return
    saveRequested = true
    if (debounceTimer !== null || worker !== null) {
      return
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void ensureWorker().catch(() => {})
    }, debounceMs)
  }

  function handleSnapshotChange() {
    if (disposed || suppressSnapshotNotifications) return

    const snapshot = adapter.getSnapshot()
    if (!snapshotSelectionChanged(snapshot)) {
      return
    }
    observeSnapshot(snapshot)

    if (snapshot === null) {
      adoptSnapshot(null)
      return
    }

    const identity = getIdentity(snapshot)
    if (baseline === null || identity !== baselineIdentity) {
      adoptSnapshot(snapshot)
      return
    }

    if (clearStaleTerminalError(snapshot)) {
      setIdleIfNoWork()
    }

    if (!snapshotNeedsSave(snapshot)) {
      return
    }

    if (pausedIdentity !== null && identity === pausedIdentity) {
      return
    }

    requestSave()
  }

  async function saveSnapshot(snapshot: TSnapshot): Promise<void> {
    const identity = getIdentity(snapshot)
    setSyncStatus(savingSyncStatus)

    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await adapter.workflowClient.run(
          adapter.workflowId,
          snapshot as WorkflowInput<TWorkflowId>,
        )

        const snapshotAtCompletion = adapter.getSnapshot()
        const completionIdentity =
          getCurrentSnapshotIdentity(snapshotAtCompletion)
        const completionMatchesSavedIdentity =
          identity === null || completionIdentity === identity
        const applySaveResult = adapter.applySaveResult
        const snapshotStillMatchesSave =
          snapshotAtCompletion !== null &&
          snapshotsEqual(snapshotAtCompletion, snapshot)

        if (!completionMatchesSavedIdentity) {
          observeSnapshot(snapshotAtCompletion)
          clearTerminalErrorForIdentity(identity)
          setSyncStatus(idleSyncStatus)
          return
        }

        if (applySaveResult !== undefined) {
          suppressSnapshotNotifications = true
          try {
            applySaveResult(result, snapshot)
          } finally {
            suppressSnapshotNotifications = false
          }
          if (snapshotStillMatchesSave) {
            baseline = adapter.getSnapshot()
            baselineIdentity = baseline ? getIdentity(baseline) : null
          } else {
            baseline = snapshot
            baselineIdentity = identity
          }
        } else {
          baseline = snapshot
          baselineIdentity = identity
        }
        observeSnapshot(adapter.getSnapshot())

        clearTerminalErrorForIdentity(identity)
        setSyncStatus(idleSyncStatus)
        return
      } catch (error) {
        const decision =
          adapter.classifyError?.(error, snapshot) ??
          defaultClassifyError(error)
        if (
          decision.kind === "retry" &&
          attempt < retryDelaysMs.length &&
          !disposed
        ) {
          await delay(retryDelaysMs[attempt])
          continue
        }

        const currentSnapshot = adapter.getSnapshot()
        if (
          currentSnapshot === null ||
          getIdentity(currentSnapshot) !== identity ||
          !snapshotNeedsSave(currentSnapshot)
        ) {
          clearTerminalErrorForIdentity(identity)
          return
        }

        const message =
          decision.kind === "pause" && decision.message !== undefined
            ? decision.message
            : adapter.formatTerminalError(error, snapshot)
        if (decision.kind === "pause") {
          pausedIdentity = identity
        }
        terminalError = { identity, error }
        setSyncStatus({ state: "error", message })
        throw error
      }
    }
  }

  function getCurrentSnapshotIdentity(
    snapshot: TSnapshot | null,
  ): string | null {
    return snapshot === null ? null : getIdentity(snapshot)
  }

  async function runWorker(): Promise<void> {
    try {
      while (saveRequested && !disposed) {
        saveRequested = false
        const snapshot = adapter.getSnapshot()

        if (snapshot === null) {
          adoptSnapshot(null)
          continue
        }

        const identity = getIdentity(snapshot)
        if (baseline === null || identity !== baselineIdentity) {
          adoptSnapshot(snapshot)
          continue
        }

        if (clearStaleTerminalError(snapshot)) {
          setIdleIfNoWork()
        }

        if (!snapshotNeedsSave(snapshot)) {
          setSyncStatus(idleSyncStatus)
          continue
        }

        if (pausedIdentity !== null && identity === pausedIdentity) {
          if (terminalError?.identity === identity) {
            throw terminalError.error
          }
          continue
        }

        await saveSnapshot(snapshot)
      }
    } finally {
      worker = null
      resolveIdleWaiters()
    }
  }

  function ensureWorker(): Promise<void> {
    if (worker === null) {
      worker = Promise.resolve().then(runWorker)
    }
    return worker
  }

  const unsubscribe = adapter.subscribe(handleSnapshotChange)
  handleSnapshotChange()

  return {
    async flush() {
      if (disposed) return
      clearDebounceTimer()
      const snapshot = adapter.getSnapshot()
      if (clearStaleTerminalError(snapshot)) {
        setIdleIfNoWork()
      }
      if (snapshotNeedsSave(snapshot)) {
        saveRequested = true
      }
      if (saveRequested || worker !== null) {
        await ensureWorker()
        return
      }
      if (terminalErrorAppliesTo(snapshot) && terminalError !== null) {
        throw terminalError.error
      }
    },
    async waitForIdle() {
      if (debounceTimer === null && !saveRequested && worker === null) {
        return
      }

      await new Promise<void>((resolve) => {
        idleResolvers.add(resolve)
      })
    },
    dispose() {
      disposed = true
      clearDebounceTimer()
      unsubscribe()
      saveRequested = false
      resolveIdleWaiters()
    },
  }
}

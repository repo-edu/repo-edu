import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import type {
  CourseSaveStamp,
  WorkflowClient,
} from "@repo-edu/application-contract"
import {
  type PersistedCourse,
  persistedCourseKind,
} from "@repo-edu/domain/types"
import {
  createPersister,
  idleSyncStatus,
  type PersistenceSyncStatus,
} from "../create-persister.js"

function makeCourse(id = "course-1"): PersistedCourse {
  return {
    kind: persistedCourseKind,
    backing: "lms",
    revision: 0,
    id,
    displayName: "Test Course",
    lmsConnectionId: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [],
      staff: [],
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-03-05T00:00:00.000Z",
  }
}

function createCourseHarness(
  save: (course: PersistedCourse) => Promise<CourseSaveStamp>,
) {
  let snapshot: PersistedCourse | null = makeCourse()
  let status: PersistenceSyncStatus = idleSyncStatus
  const listeners = new Set<() => void>()
  const saved: PersistedCourse[] = []
  const workflowClient = {
    run: async (_workflowId: "course.save", input: PersistedCourse) => {
      saved.push(input)
      return await save(input)
    },
  } as unknown as WorkflowClient

  const setSnapshot = (next: PersistedCourse | null) => {
    snapshot = next
    for (const listener of listeners) {
      listener()
    }
  }

  const persister = createPersister<PersistedCourse, "course.save">({
    workflowClient,
    workflowId: "course.save",
    startGate: {
      canStart: () => true,
      subscribe: () => () => {},
      terminal() {},
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setSyncStatus: (next) => {
      status = next
      for (const listener of listeners) {
        listener()
      }
    },
    getSnapshotIdentity: (course) => course.id,
    formatTerminalError: (error) =>
      error instanceof Error ? error.message : String(error),
    applySaveResult: (result, course) => {
      if (snapshot?.id !== course.id) return
      setSnapshot({
        ...snapshot,
        revision: result.revision,
        updatedAt: result.updatedAt,
      })
    },
    savedSnapshot: (snapshot, stamp) => ({ ...snapshot, ...stamp }),
    debounceMs: 0,
  })

  return {
    get snapshot() {
      return snapshot
    },
    get status() {
      return status
    },
    saved,
    persister,
    setSnapshot,
    notifyUnrelatedStoreChange() {
      for (const listener of listeners) {
        listener()
      }
    },
  }
}

function requireSnapshot(snapshot: PersistedCourse | null): PersistedCourse {
  assert.ok(snapshot)
  return snapshot
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe("createPersister", () => {
  let nowSeq = 0

  beforeEach(() => {
    nowSeq = 0
  })

  const nextStamp = (course: PersistedCourse): CourseSaveStamp => {
    nowSeq += 1
    return {
      revision: course.revision + 1,
      updatedAt: `2026-03-05T00:00:0${nowSeq}.000Z`,
    }
  }

  it("adopts the startup snapshot as clean", async () => {
    const harness = createCourseHarness(async (course) => nextStamp(course))

    await harness.persister.flush()

    assert.equal(harness.saved.length, 0)
    assert.deepStrictEqual(harness.status, idleSyncStatus)
  })

  it("coalesces dirty snapshots and saves the latest one on flush", async () => {
    const harness = createCourseHarness(async (course) => nextStamp(course))
    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "First edit",
    })
    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "Second edit",
    })

    await harness.persister.flush()

    assert.equal(harness.saved.length, 1)
    assert.equal(harness.saved[0]?.displayName, "Second edit")
    assert.equal(harness.snapshot?.displayName, "Second edit")
    assert.equal(harness.snapshot?.revision, 1)
  })

  it("saves edits made while an earlier save is in flight", async () => {
    const firstSaveStarted = createDeferred<void>()
    const firstSave = createDeferred<CourseSaveStamp>()
    let calls = 0
    const harness = createCourseHarness(async (course) => {
      calls += 1
      if (calls === 1) {
        firstSaveStarted.resolve()
        return await firstSave.promise
      }
      return nextStamp(course)
    })

    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "First edit",
    })
    const flush = harness.persister.flush()
    await firstSaveStarted.promise

    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "Second edit",
    })
    firstSave.resolve({
      revision: 1,
      updatedAt: "2026-03-05T00:00:01.000Z",
    })
    await flush

    assert.equal(harness.saved.length, 2)
    assert.equal(harness.saved[0]?.displayName, "First edit")
    assert.equal(harness.saved[1]?.displayName, "Second edit")
    assert.equal(harness.snapshot?.displayName, "Second edit")
    assert.equal(harness.snapshot?.revision, 2)
  })

  it("does not let an old course save reset the new course baseline", async () => {
    const firstSaveStarted = createDeferred<void>()
    const firstSave = createDeferred<CourseSaveStamp>()
    let calls = 0
    const harness = createCourseHarness(async (course) => {
      calls += 1
      if (calls === 1) {
        firstSaveStarted.resolve()
        return await firstSave.promise
      }
      return nextStamp(course)
    })

    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "Course 1 edit",
    })
    const flush = harness.persister.flush()
    await firstSaveStarted.promise

    harness.setSnapshot(makeCourse("course-2"))
    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "Course 2 edit",
    })
    firstSave.resolve({
      revision: 1,
      updatedAt: "2026-03-05T00:00:01.000Z",
    })
    await flush

    assert.equal(harness.saved.length, 2)
    assert.equal(harness.saved[0]?.id, "course-1")
    assert.equal(harness.saved[1]?.id, "course-2")
    assert.equal(harness.saved[1]?.displayName, "Course 2 edit")
    assert.equal(harness.snapshot?.id, "course-2")
    assert.equal(harness.snapshot?.revision, 1)
  })

  it("terminates store failures without retrying even when an error claims retryability", async () => {
    const error = { type: "persistence", retryable: true }
    const harness = createCourseHarness(async () => {
      throw error
    })
    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "Dirty",
    })
    await assert.rejects(harness.persister.flush(), (value) => value === error)
    harness.setSnapshot({
      ...requireSnapshot(harness.snapshot),
      displayName: "Later",
    })
    await assert.rejects(harness.persister.flush(), (value) => value === error)
    assert.equal(harness.saved.length, 1)
    assert.equal(harness.status.state, "error")
  })
})

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type CourseSaveStamp,
  HostAdmissionRefusedError,
  type WorkflowClient,
} from "@repo-edu/application-contract"
import { createBlankCourse } from "@repo-edu/domain/types"
import { createPersister } from "../create-persister.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}

function harness(
  options: {
    save?: () => Promise<CourseSaveStamp>
    apply?: () => Promise<void>
  } = {},
) {
  let course = createBlankCourse("course", "2026-09-07T00:00:00.000Z", {
    backing: "repobee",
    displayName: "Original",
  })
  let open = true
  let saves = 0
  const listeners = new Set<() => void>()
  const gates = new Set<() => void>()
  const errors: unknown[] = []
  const worker = createPersister<typeof course, "course.save">({
    workflowClient: {
      run: async () => {
        saves++
        return options.save
          ? await options.save()
          : {
              revision: course.revision + 1,
              updatedAt: "2026-09-07T01:00:00.000Z",
            }
      },
    } as WorkflowClient<"course.save">,
    workflowId: "course.save",
    getSnapshot: () => course,
    getSnapshotIdentity: (value) => value.id,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    startGate: {
      canStart: () => open,
      subscribe(listener) {
        gates.add(listener)
        return () => {
          gates.delete(listener)
        }
      },
      terminal(error) {
        errors.push(error)
        worker.dispose()
      },
    },
    setSyncStatus() {},
    formatTerminalError: String,
    savedSnapshot: (snapshot, stamp) => ({ ...snapshot, ...stamp }),
    async applySaveResult(stamp) {
      await options.apply?.()
      course = { ...course, ...stamp }
      for (const listener of listeners) listener()
    },
    debounceMs: 0,
  })
  return {
    worker,
    errors,
    get course() {
      return course
    },
    get saves() {
      return saves
    },
    edit(name: string) {
      course = { ...course, displayName: name }
      for (const listener of listeners) listener()
    },
    gate(value: boolean) {
      open = value
      for (const listener of gates) listener()
    },
  }
}

describe("request-owned worker preparation", () => {
  it("finishes an admitted body's save after an earlier worker save without reopening background starts", async () => {
    const callbackStarted = deferred<void>()
    const callback = deferred<void>()
    const h = harness({
      apply: async () => {
        callbackStarted.resolve()
        await callback.promise
      },
    })
    h.edit("Earlier save")
    const earlier = h.worker.flush()
    await callbackStarted.promise
    h.edit("Body follow-up")
    h.gate(false)
    const body = h.worker.flush(() => true)
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(h.saves, 1)
    callback.resolve()
    await Promise.all([earlier, body])
    assert.equal(h.saves, 2)
    assert.equal(h.course.displayName, "Body follow-up")
    assert.equal(h.course.revision, 2)
    assert.equal(await h.worker.claim(), null)

    h.edit("Background edit")
    await h.worker.waitForIdle()
    assert.equal(h.saves, 2)
    await assert.rejects(h.worker.flush(), HostAdmissionRefusedError)
    assert.equal(
      (await h.worker.claim())?.snapshot.displayName,
      "Background edit",
    )
    h.worker.dispose()
  })

  it("refuses a retired body's save even when background starts are allowed", async () => {
    const h = harness()
    h.edit("Dirty")
    await assert.rejects(
      h.worker.flush(() => false),
      HostAdmissionRefusedError,
    )
    assert.equal(h.saves, 0)
    h.worker.dispose()
  })

  it("does not apply an admitted save after disposal", async () => {
    const saveStarted = deferred<void>()
    const save = deferred<CourseSaveStamp>()
    const h = harness({
      save: async () => {
        saveStarted.resolve()
        return await save.promise
      },
    })
    h.gate(false)
    h.edit("Dirty")
    const body = h.worker.flush(() => true)
    await saveStarted.promise
    h.worker.dispose()
    save.resolve({ revision: 1, updatedAt: "2026-09-11T00:00:00.000Z" })
    await body
    assert.equal(h.course.revision, 0)
    assert.equal(h.saves, 1)
  })

  it("blocks a scheduled save before intent and resumes dirty work after busy retirement", async () => {
    const h = harness()
    h.edit("Dirty")
    h.gate(false)
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(h.saves, 0)
    h.gate(true)
    await h.worker.flush()
    assert.equal(h.saves, 1)
    h.worker.dispose()
  })

  it("waits through a host-settled save's paused renderer stamp callback", async () => {
    const callbackStarted = deferred<void>()
    const callback = deferred<void>()
    const h = harness({
      apply: async () => {
        callbackStarted.resolve()
        await callback.promise
      },
    })
    h.edit("First")
    const save = h.worker.flush()
    await callbackStarted.promise
    h.edit("Later")
    h.gate(false)
    let claimed = false
    const claim = h.worker.claim().then((value) => {
      claimed = true
      return value
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(claimed, false)
    callback.resolve()
    await save
    const pending = await claim
    assert.equal(pending?.snapshot.displayName, "Later")
    assert.equal(pending?.snapshot.revision, 1)
    assert.equal(h.saves, 1)
    await pending?.apply({ revision: 2, updatedAt: "2026-09-07T02:00:00.000Z" })
    h.gate(true)
    await h.worker.flush()
    assert.equal(h.saves, 1)
    assert.equal(h.course.revision, 2)
    h.worker.dispose()
  })

  it("keeps an admission-refused snapshot eligible for the accepted request", async () => {
    const h = harness({
      save: async () => {
        throw new HostAdmissionRefusedError()
      },
    })
    h.edit("Dirty")
    await assert.rejects(h.worker.flush(), HostAdmissionRefusedError)
    assert.deepEqual(h.errors, [])
    h.gate(false)
    const claim = await h.worker.claim()
    assert.equal(claim?.snapshot.displayName, "Dirty")
    h.worker.dispose()
  })

  it("terminates a failed store without a paused or retrying writer", async () => {
    const error = { type: "course-storage", reason: "row-mismatch" }
    const h = harness({
      save: async () => {
        throw error
      },
    })
    h.edit("Dirty")
    await assert.rejects(h.worker.flush(), (value) => value === error)
    h.edit("Later")
    h.gate(false)
    await assert.rejects(h.worker.claim(), /disposed/)
    assert.deepEqual(h.errors, [error])
    assert.equal(h.saves, 1)
  })
})

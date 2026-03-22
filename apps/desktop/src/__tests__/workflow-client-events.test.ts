import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  AppError,
  DiagnosticOutput,
  MilestoneProgress,
  WorkflowEventFor,
} from "@repo-edu/application-contract"
import { runSubscriptionFromFactory } from "../workflow-client.js"

type CourseLoadEvent = WorkflowEventFor<"course.load">

describe("desktop workflow subscription event handling", () => {
  it("resolves with result data on completed event", async () => {
    const course = { id: "c1", displayName: "Test" }

    const result = await runSubscriptionFromFactory<"course.load">(
      (handlers) => {
        queueMicrotask(() => {
          handlers.onData({
            type: "completed",
            data: course,
          } as CourseLoadEvent)
        })
        return { unsubscribe() {} }
      },
    )

    assert.deepEqual(result, course)
  })

  it("dispatches progress events to the onProgress callback", async () => {
    const progressEvents: MilestoneProgress[] = []

    await runSubscriptionFromFactory<"course.load">(
      (handlers) => {
        queueMicrotask(() => {
          handlers.onData({
            type: "progress",
            data: { step: 1, totalSteps: 2, label: "Loading" },
          } as CourseLoadEvent)
          handlers.onData({
            type: "progress",
            data: { step: 2, totalSteps: 2, label: "Done" },
          } as CourseLoadEvent)
          handlers.onData({
            type: "completed",
            data: { id: "c1" },
          } as CourseLoadEvent)
        })
        return { unsubscribe() {} }
      },
      { onProgress: (p) => progressEvents.push(p) },
    )

    assert.equal(progressEvents.length, 2)
    assert.equal(progressEvents[0].step, 1)
    assert.equal(progressEvents[1].step, 2)
  })

  it("dispatches output events to the onOutput callback", async () => {
    const outputEvents: DiagnosticOutput[] = []

    await runSubscriptionFromFactory<"course.load">(
      (handlers) => {
        queueMicrotask(() => {
          handlers.onData({
            type: "output",
            data: { channel: "info", message: "Loading course data." },
          } as CourseLoadEvent)
          handlers.onData({
            type: "completed",
            data: { id: "c1" },
          } as CourseLoadEvent)
        })
        return { unsubscribe() {} }
      },
      { onOutput: (o) => outputEvents.push(o) },
    )

    assert.equal(outputEvents.length, 1)
    assert.equal(outputEvents[0].channel, "info")
  })

  it("rejects with AppError on failed event", async () => {
    const appError: AppError = {
      type: "not-found",
      message: "Course not found.",
      resource: "course",
    }

    await assert.rejects(
      runSubscriptionFromFactory<"course.load">((handlers) => {
        queueMicrotask(() => {
          handlers.onData({
            type: "failed",
            error: appError,
          } as CourseLoadEvent)
        })
        return { unsubscribe() {} }
      }),
      (error: unknown) => {
        const err = error as AppError
        assert.equal(err.type, "not-found")
        assert.equal(err.message, "Course not found.")
        return true
      },
    )
  })
})

describe("desktop workflow transport error handling", () => {
  it("rejects with ipc-disconnected transport error on generic Error", async () => {
    await assert.rejects(
      runSubscriptionFromFactory<"course.load">((handlers) => {
        queueMicrotask(() => {
          handlers.onError(new Error("Connection reset by peer"))
        })
        return { unsubscribe() {} }
      }),
      (error: unknown) => {
        const err = error as AppError
        assert.equal(err.type, "transport")
        assert.equal(err.reason, "ipc-disconnected")
        return true
      },
    )
  })

  it("rejects with timeout transport error when message contains timeout", async () => {
    await assert.rejects(
      runSubscriptionFromFactory<"course.load">((handlers) => {
        queueMicrotask(() => {
          handlers.onError(new Error("Request timeout after 30000ms"))
        })
        return { unsubscribe() {} }
      }),
      (error: unknown) => {
        const err = error as AppError
        assert.equal(err.type, "transport")
        assert.equal(err.reason, "timeout")
        return true
      },
    )
  })

  it("rejects with host-crash when subscription completes without terminal event", async () => {
    await assert.rejects(
      runSubscriptionFromFactory<"course.load">((handlers) => {
        queueMicrotask(() => {
          handlers.onComplete()
        })
        return { unsubscribe() {} }
      }),
      (error: unknown) => {
        const err = error as AppError
        assert.equal(err.type, "transport")
        assert.equal(err.reason, "host-crash")
        assert.equal(err.retryable, false)
        return true
      },
    )
  })

  it("ignores onComplete after a completed event (no double-resolve)", async () => {
    const result = await runSubscriptionFromFactory<"course.load">(
      (handlers) => {
        queueMicrotask(() => {
          handlers.onData({
            type: "completed",
            data: { id: "c1" },
          } as CourseLoadEvent)
          handlers.onComplete()
        })
        return { unsubscribe() {} }
      },
    )

    assert.deepEqual(result, { id: "c1" })
  })

  it("ignores abort after completion (no unsubscribe call)", async () => {
    const controller = new AbortController()
    let unsubscribeCalls = 0

    const result = await runSubscriptionFromFactory<"course.load">(
      (handlers) => {
        queueMicrotask(() => {
          handlers.onData({
            type: "completed",
            data: { id: "c1" },
          } as CourseLoadEvent)
        })
        return {
          unsubscribe() {
            unsubscribeCalls++
          },
        }
      },
      { signal: controller.signal },
    )

    controller.abort()
    assert.deepEqual(result, { id: "c1" })
    assert.equal(unsubscribeCalls, 0)
  })
})

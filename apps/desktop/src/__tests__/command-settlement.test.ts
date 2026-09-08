import assert from "node:assert/strict"
import { it } from "node:test"
import {
  CommandOutcomeError,
  type ExclusiveRequestOperation,
  type WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { makeCourse } from "../../../../packages/renderer-app/src/__tests__/session-controller.test-support"
import { HostAdmission } from "../host-admission"
import { executeHostCommand } from "../host-command-execution"
import { createHostRequestTransport } from "../host-request-transport"
import { createPreloadRequestTransport } from "../preload-request-transport"
import { createRendererCommandClient } from "../renderer-command-client"
import { commitRequestPersistence } from "../request-persistence"
import type { RequestPersistenceBundle } from "../request-port-wire"
import { requestChannel, until } from "./request-port-harness"

const file = {
  kind: "user-file-ref" as const,
  referenceId: "file",
  displayName: "archive.json",
  mediaType: "application/json",
  byteLength: 0,
}
const result = {
  totalInBundle: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
  rejected: 0,
  rejections: [],
}

function harness(overrides: Partial<WorkflowHandlerMap> = {}) {
  const channel = requestChannel()
  const order: string[] = []
  const admission = new HostAdmission((effect) => {
    if (effect.type === "release-command") {
      order.push("release")
      host.release(effect.request)
    }
  })
  const handlers = {
    "examination.archive.import": async () => {
      order.push("commit")
      return result
    },
    "examination.lookupQuestionSummaries": async () => {
      order.push("read")
      return { summaries: [] }
    },
    ...overrides,
  } as WorkflowHandlerMap
  const host = createHostRequestTransport({
    admission,
    receive(request, message, signal) {
      if (message.type === "bundle")
        void commitRequestPersistence({
          request,
          bundle: message.bundle,
          admission,
          handlers,
          transport: host,
        })
      if (message.type === "input")
        void executeHostCommand({
          request,
          operation: message.input as ExclusiveRequestOperation,
          signal: signal!,
          admission,
          handlers,
          transport: host,
        })
      if (message.type === "acknowledged") {
        order.push("acknowledge")
        admission.dispatch({ type: "settlement-acknowledged", request })
      }
    },
  })
  const preload = createPreloadRequestTransport({
    channel(command) {
      return {
        renderer: channel.renderer,
        transfer() {
          host.acceptCommand(command, channel.host)
        },
      }
    },
    terminal() {},
  })
  admission.dispatch({ type: "bootstrap-acknowledged" })
  const client = createRendererCommandClient(preload.bridge)
  return {
    admission,
    order,
    run(
      options: {
        signal?: AbortSignal
        publish?: () => Promise<void>
        prepare?: () => Promise<void>
        bundle?: RequestPersistenceBundle
        output?: () => void
      } = {},
    ) {
      const running = client
        .runBody(
          "examination.archive.import",
          async (commit) => {
            await options.prepare?.()
            await commit(options.bundle ?? {})
            order.push("stamps")
          },
          async (body) =>
            body.run("examination.archive.import", () => file, {
              signal: options.signal,
              onOutput: options.output,
              settlementInput: { summaries: { subjects: [] }, questions: [] },
              async applyAuthoritative(values) {
                assert.deepEqual(values, {
                  questionSummaries: { summaries: [] },
                  questions: [],
                })
                await options.publish?.()
                order.push("apply")
              },
            }),
          async () => {
            order.push("settle")
          },
        )
        .finally(() => {
          order.push("retire")
        })
      void running.catch(() => undefined)
      return running
    },
    dispose() {
      preload.dispose()
      host.dispose()
      channel.dispose()
    },
  }
}

it("holds admission through paused authoritative application before acknowledgement and release", {
  timeout: 5000,
}, async () => {
  const h = harness()
  const publication = Promise.withResolvers<void>()
  try {
    const running = h.run({ publish: () => publication.promise })
    await until(() => h.order.includes("read"))
    assert.equal(h.admission.getSnapshot().phase, "executing.settling")
    assert.equal(h.order.includes("acknowledge"), false)
    publication.resolve()
    assert.deepEqual(await running, result)
    assert.deepEqual(h.order, [
      "stamps",
      "commit",
      "read",
      "apply",
      "settle",
      "acknowledge",
      "release",
      "retire",
    ])
  } finally {
    h.dispose()
  }
})

it("forwards running cancellation once while preserving a completed result and streamed output", {
  timeout: 5000,
}, async () => {
  const effect = Promise.withResolvers<void>()
  let cancellations = 0
  let outputs = 0
  const h = harness({
    "examination.archive.import": async (_input, options) => {
      options?.signal?.addEventListener("abort", () => {
        cancellations += 1
      })
      options?.onOutput?.({ channel: "info", message: "Working." })
      await effect.promise
      return result
    },
  })
  const abort = new AbortController()
  try {
    const running = h.run({
      signal: abort.signal,
      output: () => {
        outputs += 1
      },
    })
    await until(() => outputs === 1)
    abort.abort()
    abort.abort()
    await until(() => cancellations === 1)
    effect.resolve()
    assert.deepEqual(await running, result)
    assert.equal(cancellations, 1)
    assert.equal(h.admission.getSnapshot().phase, "interactive")
  } finally {
    h.dispose()
  }
})

it("ignores cancellation after the official outcome while settlement reads are pending", {
  timeout: 5000,
}, async () => {
  const read = Promise.withResolvers<void>()
  let cancellations = 0
  let reading = false
  const h = harness({
    "examination.archive.import": async (_input, options) => {
      options?.signal?.addEventListener("abort", () => {
        cancellations += 1
      })
      return result
    },
    "examination.lookupQuestionSummaries": async (_input, options) => {
      assert.equal(options?.signal, undefined)
      reading = true
      await read.promise
      return { summaries: [] }
    },
  })
  const abort = new AbortController()
  try {
    const running = h.run({ signal: abort.signal })
    await until(() => reading)
    abort.abort()
    read.resolve()
    assert.deepEqual(await running, result)
    assert.equal(cancellations, 0)
    assert.equal(h.admission.getSnapshot().phase, "interactive")
  } finally {
    h.dispose()
  }
})

for (const outcome of [
  {
    disposition: "refused",
    error: { type: "effect", message: "Refused before mutation." },
  },
  { disposition: "stopped", result: null },
  {
    disposition: "completed",
    completion: {
      status: "failed",
      error: { type: "effect", message: "Known failure." },
      result: null,
    },
  },
  {
    disposition: "uncertain",
    reason: "confirmation-expired",
    message: "Outside outcome unknown.",
  },
] as const) {
  it(`settles ${outcome.disposition} without inventing results or issuing reads`, {
    timeout: 5000,
  }, async () => {
    const h = harness({
      "examination.archive.import": async () => {
        throw new CommandOutcomeError(outcome)
      },
    })
    try {
      await assert.rejects(h.run())
      assert.equal(h.order.includes("read"), false)
      assert.equal(h.order.includes("apply"), false)
      assert.ok(h.order.indexOf("stamps") < h.order.indexOf("acknowledge"))
      assert.ok(h.order.indexOf("release") < h.order.indexOf("retire"))
      assert.equal(h.admission.getSnapshot().phase, "interactive")
      const settle = h.admission.startWorkflow("course.list", { cancel() {} })
      settle()
    } finally {
      h.dispose()
    }
  })
}

it("finishes preparation stamps and prevents input capture when cancelled during preparation", {
  timeout: 5000,
}, async () => {
  const h = harness()
  const prepared = Promise.withResolvers<void>()
  const abort = new AbortController()
  try {
    const running = h.run({
      signal: abort.signal,
      prepare: () => prepared.promise,
    })
    await until(() => h.admission.getSnapshot().phase === "preparing")
    abort.abort()
    prepared.resolve()
    await assert.rejects(running)
    assert.equal(h.order.includes("commit"), false)
    assert.equal(h.order.includes("stamps"), true)
    assert.equal(h.admission.getSnapshot().phase, "interactive")
  } finally {
    h.dispose()
  }
})

it("finishes an accepted durable write before settling preparation cancellation", {
  timeout: 5000,
}, async () => {
  const commit = Promise.withResolvers<void>()
  const writing = Promise.withResolvers<void>()
  let writes = 0
  const h = harness({
    "course.save": async () => {
      writing.resolve()
      await commit.promise
      writes += 1
      return { revision: 1, updatedAt: "2026-09-08T12:00:00.000Z" }
    },
  })
  const abort = new AbortController()
  try {
    const running = h.run({
      signal: abort.signal,
      bundle: { course: makeCourse("course") },
    })
    const rejected = assert.rejects(running)
    await writing.promise
    abort.abort()
    await until(() => {
      const state = h.admission.getSnapshot()
      return state.phase === "preparing" && state.cancellationAccepted
    })
    assert.deepEqual(h.order, [])
    assert.equal(writes, 0)
    commit.resolve()
    await rejected
    assert.equal(writes, 1)
    assert.deepEqual(h.order, [
      "stamps",
      "settle",
      "acknowledge",
      "release",
      "retire",
    ])
    assert.equal(h.admission.getSnapshot().phase, "interactive")
  } finally {
    h.dispose()
  }
})

for (const failure of [
  new CommandOutcomeError({
    disposition: "uncertain",
    reason: "proof-lost",
    message: "Proof lost.",
  }),
  {
    type: "course-storage",
    message: "Row mismatch.",
    reason: "storage-failure",
  },
  {
    type: "provider",
    message: "Category without proof.",
    provider: "git",
    operation: "create",
    retryable: false,
  },
]) {
  it("does not settle an unproven or durable-owner failure", {
    timeout: 5000,
  }, async () => {
    const h = harness({
      "examination.archive.import": async () => {
        throw failure
      },
    })
    try {
      void h.run()
      await until(() => h.admission.getSnapshot().phase === "terminal")
      assert.equal(h.order.includes("acknowledge"), false)
      assert.equal(h.order.includes("read"), false)
    } finally {
      h.dispose()
    }
  })
}

it("enters terminal when a declared settlement read fails after durable completion", {
  timeout: 5000,
}, async () => {
  const h = harness({
    "examination.lookupQuestionSummaries": async () => {
      throw new Error("Archive unavailable.")
    },
  })
  try {
    void h.run()
    await until(() => h.admission.getSnapshot().phase === "terminal")
    assert.equal(h.order.includes("commit"), true)
    assert.equal(h.order.includes("acknowledge"), false)
  } finally {
    h.dispose()
  }
})

for (const boundary of ["before", "after"] as const) {
  it(`terminates ${boundary} the archive commit without reading or publishing settlement`, {
    timeout: 5000,
  }, async () => {
    const committed: (typeof result)[] = []
    let starts = 0
    const h = harness({
      "examination.archive.import": async () => {
        starts += 1
        if (boundary === "after") committed.push(result)
        throw {
          type: "examination-archive-storage",
          message: `Archive write failed ${boundary} commit.`,
        }
      },
    })
    try {
      void h.run()
      await until(() => h.admission.getSnapshot().phase === "terminal")
      assert.deepEqual(committed, boundary === "after" ? [result] : [])
      assert.equal(starts, 1)
      assert.deepEqual(h.order, ["stamps"])
      assert.throws(() =>
        h.admission.startWorkflow("course.list", { cancel() {} }),
      )
    } finally {
      h.dispose()
    }
  })
}

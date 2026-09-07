import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  exclusiveCommandDeclarations,
  type WorkflowClient,
  workflowCatalog,
} from "@repo-edu/application-contract"
import {
  sessionDirectClasses,
  sessionWorkflowClasses,
} from "../session/session-operation-inventory.js"
import {
  type SessionOperationScope,
  SessionOperations,
} from "../session/session-operations.js"
import {
  canAdmitSessionChange,
  canContinueTransaction,
  createInitialSessionSnapshot,
  type SessionReducerEvent,
  sessionReducer,
} from "../session/session-reducer.js"
import { deferred, workflowClient } from "./session-controller.test-support.js"

function harness(
  client: WorkflowClient = workflowClient(async () => undefined),
) {
  let snapshot = createInitialSessionSnapshot()
  const dispatch = (event: SessionReducerEvent) => {
    const next = sessionReducer(snapshot, event)
    const accepted = next !== snapshot
    snapshot = next
    return accepted
  }
  const owner = new SessionOperations(
    client,
    {
      enter: (turnId, descriptor) =>
        dispatch({ type: "transaction-enter", turnId, descriptor }),
      start: (turnId, descriptor) =>
        dispatch({ type: "transaction-start", turnId, descriptor }),
      canContinue: (turnId) => canContinueTransaction(snapshot, turnId),
      retire: (turnId) => {
        dispatch({ type: "transaction-retire", turnId })
      },
    },
    () => snapshot,
  )
  return { owner, gateway: owner.gateway, dispatch, snapshot: () => snapshot }
}

describe("session operation ownership", () => {
  it("refuses a host result that arrives after disposal", async () => {
    const started = deferred<void>()
    const host = deferred<void>()
    const { gateway, dispatch } = harness(
      workflowClient(async () => {
        started.resolve()
        await host.promise
      }),
    )
    const result = gateway.run("course.list", undefined)
    await started.promise
    dispatch({ type: "dispose" })
    host.resolve()
    await assert.rejects(result, /retired/)
  })

  it("classifies every workflow and direct entry from Decision 21", () => {
    const members = (classification: string) =>
      Object.entries(sessionWorkflowClasses)
        .filter(([, value]) => value === classification)
        .map(([id]) => id)
        .sort()
    assert.deepEqual(
      Object.keys(sessionWorkflowClasses).sort(),
      Object.keys(workflowCatalog).sort(),
    )
    assert.deepEqual(
      members("command"),
      Object.keys(exclusiveCommandDeclarations).sort(),
    )
    assert.deepEqual(members("presentation-only"), [
      "connection.listLmsCoursesDraft",
      "connection.verifyGitDraft",
      "connection.verifyLlmDraft",
      "connection.verifyLmsDraft",
      "validation.assignment",
      "validation.roster",
    ])
    assert.deepEqual(members("request-control"), ["examination.stopGeneration"])
    assert.deepEqual(sessionDirectClasses, {
      pickUserFile: "session-changing",
      pickSaveTarget: "session-changing",
      pickDirectory: "session-changing",
      setNativeTheme: "presentation-only",
      downloadUpdate: "presentation-only",
      quitAndInstall: "session-changing",
      bootstrapReady: "session-changing",
    })
  })
  it("freezes at reservation while earlier publication finishes before command start", async () => {
    const { owner, gateway, snapshot } = harness()
    const publication = deferred<void>()
    const started = deferred<void>()
    const released = deferred<void>()
    const order: string[] = []
    const first = gateway.reserve<void>("course.list")
    assert.ok(first)
    const firstRun = first.run(async (scope) => {
      started.resolve()
      await publication.promise
      scope.publish(() => order.push("publish"))
    })
    await started.promise
    const command = gateway.reserve<void>("repo.clone")
    assert.ok(command)
    assert.equal(canAdmitSessionChange(snapshot()), false)
    assert.equal(
      gateway.change(() => order.push("edit")),
      false,
    )
    assert.equal(gateway.reserve("course.list"), null)
    assert.equal(gateway.reserve("repo.update"), null)
    let savedScope: SessionOperationScope | undefined
    const commandRun = command.run(async (scope) => {
      savedScope = scope
      order.push("command")
      await released.promise
      scope.publish(() => order.push("release"))
    })
    publication.resolve()
    await firstRun
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.deepEqual(order, ["publish", "command"])
    assert.equal(
      gateway.change(() => order.push("early-edit")),
      false,
    )
    released.resolve()
    await commandRun
    assert.equal(
      gateway.change(() => order.push("edit")),
      true,
    )
    assert.throws(
      () => savedScope?.publish(() => order.push("late")),
      /retired/,
    )
    await owner.flush()
    assert.deepEqual(order, ["publish", "command", "release", "edit"])
  })

  it("retains async progress callbacks after the host promise completes", async () => {
    const callbackStarted = deferred<void>()
    const callbackRelease = deferred<void>()
    const order: string[] = []
    const client: WorkflowClient = {
      run: async (_id, _input, options) => {
        options?.onProgress?.({} as never)
        return undefined as never
      },
    }
    const { gateway } = harness(client)
    const operation = gateway.reserve<void>("analysis.run")
    assert.ok(operation)
    const running = operation.run(async (scope) => {
      await scope.run("analysis.run", {} as never, {
        onProgress: async () => {
          callbackStarted.resolve()
          await callbackRelease.promise
          scope.publish(() => order.push("callback"))
        },
      })
      order.push("host-result")
    })
    await callbackStarted.promise
    const command = gateway.reserve<void>("repo.clone")
    assert.ok(command)
    const next = command.run(async () => {
      order.push("command")
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.deepEqual(order, ["host-result"])
    callbackRelease.resolve()
    await Promise.all([running, next])
    assert.deepEqual(order, ["host-result", "callback", "command"])
  })

  it("queues close behind reserved publication and refuses later bodies", async () => {
    const { owner, gateway, dispatch } = harness()
    const release = deferred<void>()
    const order: string[] = []
    const operation = gateway.reserve<void>("pickDirectory")
    assert.ok(operation)
    dispatch({ type: "close-start", attemptId: "close" })
    const closing = owner.enqueue(
      { kind: "close", attemptId: "close" },
      async () => {
        order.push("close")
      },
    )
    assert.equal(gateway.reserve("course.list"), null)
    assert.equal(
      gateway.change(() => order.push("edit")),
      false,
    )
    const running = operation.run(async (scope) => {
      await scope.direct("pickDirectory", async () => {
        await release.promise
      })
      scope.publish(() => order.push("publish"))
    })
    release.resolve()
    await Promise.all([running, closing])
    assert.deepEqual(order, ["publish", "close"])
  })

  it("retires cancellation and failure without running another command early", async () => {
    const { gateway, snapshot } = harness()
    const cancelled = gateway.reserve<void>("repo.clone")
    assert.ok(cancelled)
    const cancellation = cancelled.cancel(new Error("cancelled"))
    assert.equal(gateway.reserve("repo.clone"), null)
    await assert.rejects(cancellation, /cancelled/)
    assert.equal(canAdmitSessionChange(snapshot()), true)
    const failed = gateway.reserve<void>("repo.clone")
    assert.ok(failed)
    await assert.rejects(
      failed.run(async () => {
        throw new Error("failed")
      }),
      /failed/,
    )
    assert.equal(snapshot().transactions.admitted.size, 0)
  })

  it("refuses queued and retained work after disposal", async () => {
    const { gateway, dispatch } = harness()
    const operation = gateway.reserve<void>("course.list")
    assert.ok(operation)
    dispatch({ type: "dispose" })
    let ran = false
    await assert.rejects(
      operation.run(async () => {
        ran = true
      }),
      /disposed/,
    )
    assert.equal(ran, false)
    await assert.rejects(
      gateway.presentation("validation.roster", {} as never),
      /not accepting/,
    )
  })

  it("keeps presentation outside the semantic queue and prevents class substitution", async () => {
    const calls: string[] = []
    const { gateway, snapshot } = harness(
      workflowClient(async (id) => {
        calls.push(id)
      }),
    )
    await gateway.presentation("validation.roster", {} as never)
    await gateway.presentationDirect("setNativeTheme", async () => {
      calls.push("theme")
    })
    assert.equal(snapshot().transactions.admitted.size, 0)
    await assert.rejects(
      gateway.presentation("repo.clone" as never, {} as never),
      /not presentation/,
    )
    await assert.rejects(
      gateway.run("examination.stopGeneration", {} as never),
      /request port/,
    )
    assert.throws(
      () => gateway.reserve("validation.roster" as never),
      /not a session-changing/,
    )
    assert.throws(
      () => gateway.reserve("unknown" as never),
      /not a session-changing/,
    )
    const ordinary = gateway.reserve<void>("course.list")
    assert.ok(ordinary)
    await assert.rejects(
      ordinary.run(async (scope) => {
        await scope.run("repo.clone", {} as never)
      }),
      /does not belong/,
    )
    assert.deepEqual(calls, ["validation.roster", "theme"])
  })
})

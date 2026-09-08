import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  exclusiveCommandDeclarations,
  type WorkflowClient,
  workflowCatalog,
} from "@repo-edu/application-contract"
import { createBlankCourse } from "@repo-edu/domain/types"
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
import { useCourseStore } from "../stores/course-store.js"
import {
  commandClient,
  deferred,
  workflowClient,
} from "./session-controller.test-support.js"

function harness(
  client: WorkflowClient = workflowClient(async () => undefined),
  enterSurface?: ConstructorParameters<typeof SessionOperations>[7],
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
    commandClient(client),
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
    undefined,
    async () => {},
    undefined,
    enterSurface,
  )
  return { owner, gateway: owner.gateway, dispatch, snapshot: () => snapshot }
}

describe("session operation ownership", () => {
  it("retains a directory choice through surface application before a waiting command", async () => {
    const opened = deferred<void>()
    const picked = deferred<string>()
    const entering = deferred<void>()
    const applied = deferred<void>()
    const order: string[] = []
    const { gateway } = harness(undefined, async (scope, surface) => {
      assert.equal(scope.canContinue(), true)
      assert.deepEqual(surface, { kind: "folder", path: "/chosen" })
      entering.resolve()
      await applied.promise
      order.push("surface")
      return true
    })
    const running = gateway.execute("pickDirectory", async (scope) => {
      const path = await scope.direct("pickDirectory", () => {
        opened.resolve()
        return picked.promise
      })
      await scope.activateSurface({ kind: "folder", path })
      scope.publish(() => order.push("published"))
    })
    await opened.promise
    const command = gateway.execute("repo.clone", async () => {
      order.push("command")
    })
    assert.equal(
      gateway.change(() => order.push("unowned edit")),
      false,
    )
    picked.resolve("/chosen")
    await entering.promise
    assert.deepEqual(order, [])
    applied.resolve()
    await Promise.all([running, command])
    assert.deepEqual(order, ["surface", "published", "command"])
  })

  it("does not grant command bodies an independent surface transition", async () => {
    let entered = false
    const { gateway } = harness(undefined, async () => {
      entered = true
      return true
    })
    await assert.rejects(
      gateway.execute("repo.clone", (scope) =>
        scope.activateSurface({ kind: "home" }),
      ),
      /cannot enter a surface/,
    )
    assert.equal(entered, false)
  })
  it("refuses a picker result after disposal", async () => {
    const opened = deferred<void>()
    const picked = deferred<string>()
    const { gateway, dispatch } = harness()
    let published = false
    const running = gateway.execute("pickUserFile", async (scope) => {
      await scope.direct("pickUserFile", () => {
        opened.resolve()
        return picked.promise
      })
      published = true
    })
    await opened.promise
    dispatch({ type: "dispose" })
    picked.resolve("file")
    await assert.rejects(running, /retired/)
    assert.equal(published, false)
  })

  it("retains a callback failure until its asynchronous work ends", async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    const { gateway } = harness({
      run: async (_id, _input, options) => {
        options?.onOutput?.({} as never)
        return undefined as never
      },
    })
    const running = gateway.execute("analysis.run", async (scope) => {
      await scope.run("analysis.run", {} as never, {
        onOutput: async () => {
          entered.resolve()
          await release.promise
          throw new Error("output publication failed")
        },
      })
    })
    await entered.promise
    let nextStarted = false
    const next = gateway.execute("repo.clone", async () => {
      nextStarted = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(nextStarted, false)
    const rejected = assert.rejects(running, /output publication failed/)
    release.resolve()
    await Promise.all([rejected, next])
    assert.equal(nextStarted, true)
  })

  for (const stage of [
    "host",
    "progress",
    "output",
    "publication",
    "follow-up",
  ] as const) {
    for (const successor of ["command", "close"] as const) {
      it(`holds ${successor} behind a paused direct ${stage} stage`, async () => {
        const paused = deferred<void>()
        const release = deferred<void>()
        const order: string[] = []
        const pause = async () => {
          paused.resolve()
          await release.promise
        }
        const client: WorkflowClient = {
          run: async (_id, _input, options) => {
            if (stage === "host") await pause()
            options?.onProgress?.({} as never)
            options?.onOutput?.({} as never)
            return undefined as never
          },
        }
        const { owner, gateway, dispatch } = harness(client)
        const running = gateway.execute("analysis.run", async (scope) => {
          await scope.run("analysis.run", {} as never, {
            onProgress: async () => {
              if (stage === "progress") {
                await pause()
                scope.publish(() => order.push("progress"))
              }
            },
            onOutput: async () => {
              if (stage === "output") {
                await pause()
                scope.publish(() => order.push("output"))
              }
            },
          })
          if (stage === "publication") await pause()
          scope.publish(() => order.push("publication"))
          await scope.follow(async () => {
            if (stage === "follow-up") await pause()
            scope.publish(() => order.push("follow-up"))
          })
        })
        await paused.promise
        let next: Promise<unknown>
        if (successor === "command") {
          next = gateway.execute("repo.clone", async () => {
            order.push(successor)
          })
        } else {
          dispatch({ type: "close-start", attemptId: "close" })
          next = owner.enqueue(
            { kind: "close", attemptId: "close" },
            async () => {
              order.push(successor)
            },
          )
        }
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.equal(order.includes(successor), false)
        release.resolve()
        await Promise.all([running, next])
        assert.equal(order.at(-1), successor)
        assert.ok(order.includes("publication"))
        assert.ok(order.includes("follow-up"))
      })
    }
  }

  it("owns picker publication and the preview follow-up in one body", async () => {
    const picked = deferred<void>()
    const release = deferred<void>()
    const order: string[] = []
    const { gateway } = harness(
      workflowClient(async () => {
        order.push("preview")
      }),
    )
    const body = gateway.execute("pickUserFile", async (scope) => {
      await scope.direct("pickUserFile", async () => {
        picked.resolve()
        await release.promise
      })
      scope.publish(() => order.push("file"))
      await scope.run("groupSet.previewImportFromFile", {} as never)
      scope.publish(() => order.push("result"))
    })
    await picked.promise
    const command = gateway.execute("repo.clone", async () => {
      order.push("command")
    })
    release.resolve()
    await Promise.all([body, command])
    assert.deepEqual(order, ["file", "preview", "result", "command"])
  })

  it("refuses partial command mutations while unrelated course edits stay frozen", async () => {
    const course = createBlankCourse("course", "2026-09-07T00:00:00Z", {
      backing: "lms",
      displayName: "Original",
    })
    useCourseStore.getState().hydrate(course)
    const { gateway } = harness()
    let retained: SessionOperationScope | undefined
    await gateway.execute("roster.importFromFile", async (scope) => {
      retained = scope
      assert.equal(
        gateway.change(() =>
          useCourseStore.getState().setDisplayName("Unrelated"),
        ),
        false,
      )
      assert.throws(
        () =>
          scope.mutateCourse(course.id, (actions) =>
            actions.setDisplayName("Imported"),
          ),
        /partial course mutations/,
      )
      assert.equal(useCourseStore.getState().course?.displayName, "Original")
    })
    assert.throws(
      () =>
        retained?.mutateCourse(course.id, (actions) =>
          actions.setDisplayName("Late"),
        ),
      /retired/,
    )
    useCourseStore.getState().clear()
  })

  it("keeps handled host refusal publication inside the body", async () => {
    const { gateway } = harness(
      workflowClient(async () => {
        throw new Error("refused")
      }),
    )
    const order: string[] = []
    await gateway.execute("roster.importFromFile", async (scope) => {
      try {
        await scope.run("roster.importFromFile", {} as never)
      } catch {
        scope.publish(() => order.push("refusal"))
      }
    })
    await gateway.execute("repo.clone", async () => {
      order.push("next")
    })
    assert.deepEqual(order, ["refusal", "next"])
  })

  it("refuses a host result that arrives after disposal", async () => {
    const started = deferred<void>()
    const host = deferred<void>()
    const { gateway, dispatch } = harness(
      workflowClient(async () => {
        started.resolve()
        await host.promise
      }),
    )
    const result = gateway.execute("course.list", (scope) =>
      scope.run("course.list", undefined),
    )
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

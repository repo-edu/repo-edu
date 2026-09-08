import assert from "node:assert/strict"
import { it } from "node:test"
import { SessionController } from "../session/session-controller.js"
import {
  runSessionOperationBestEffort,
  SessionControllerProvider,
} from "../session/session-controller-context.js"
import { deferred, workflowClient } from "./session-controller.test-support.js"

it("refuses every native input route from reservation through retirement without rerendering", async () => {
  const publication = deferred<void>()
  const acknowledgement = deferred<void>()
  const release = deferred<void>()
  const controller = new SessionController({
    workflowClient: workflowClient(async () => undefined),
    commandClient: {
      async runBody(_command, _preparation, body, settle) {
        const result = await body({ run: async () => undefined as never })
        await settle()
        acknowledgement.resolve()
        await release.promise
        return result
      },
    },
    onBootstrapReady: async () => {},
  })
  const provider = SessionControllerProvider({ controller, children: null })
  const boundary = provider.props.children
  const handlers = Object.entries(boundary.props).filter(([name]) =>
    name.endsWith("Capture"),
  )
  assert.ok(handlers.length > 0)
  function assertInput(frozen: boolean) {
    for (const [name, handler] of handlers) {
      const calls: string[] = []
      const capture = handler as (event: unknown) => void
      capture({
        preventDefault: () => calls.push("prevented"),
        stopPropagation: () => calls.push("stopped"),
      })
      assert.deepEqual(calls, frozen ? ["prevented", "stopped"] : [], name)
    }
  }
  assertInput(false)
  const command = controller.operations.reserve<void>("repo.clone")
  assert.ok(command)
  assertInput(true)
  const running = command.run(async () => {
    assertInput(true)
    await publication.promise
    assertInput(true)
  })
  publication.resolve()
  await acknowledgement.promise
  assertInput(true)
  release.resolve()
  assertInput(true)
  await running
  assertInput(false)
  controller.dispose()
})

it("reports rejected best-effort session operations", async () => {
  const originalError = console.error
  const reported: unknown[][] = []
  console.error = (...args: unknown[]) => {
    reported.push(args)
  }
  try {
    const failure = new Error("operation failed")
    runSessionOperationBestEffort(Promise.reject(failure), "test operation")
    await new Promise<void>((resolve) => setImmediate(resolve))

    assert.deepStrictEqual(reported, [
      ["Session test operation failed", failure],
    ])
  } finally {
    console.error = originalError
  }
})

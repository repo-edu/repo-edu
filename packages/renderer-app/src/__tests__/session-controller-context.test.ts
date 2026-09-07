import assert from "node:assert/strict"
import { it } from "node:test"
import { SessionController } from "../session/session-controller.js"
import {
  runSessionOperationBestEffort,
  SessionControllerProvider,
} from "../session/session-controller-context.js"
import { workflowClient } from "./session-controller.test-support.js"

it("refuses native editing and component input immediately after command reservation", async () => {
  const controller = new SessionController({
    workflowClient: workflowClient(async () => undefined),
    onBootstrapReady: async () => {},
  })
  const provider = SessionControllerProvider({ controller, children: null })
  const boundary = provider.props.children
  for (const eventName of [
    "onBeforeInputCapture",
    "onChangeCapture",
    "onPasteCapture",
    "onCutCapture",
    "onClickCapture",
    "onKeyDownCapture",
    "onBlurCapture",
    "onDropCapture",
  ]) {
    let refused = 0
    const event = {
      preventDefault: () => {
        refused++
      },
      stopPropagation: () => {
        refused++
      },
    }
    const handler = boundary.props[eventName]
    handler(event)
    assert.equal(refused, 0)
    const command = controller.operations.reserve<void>("repo.clone")
    assert.ok(command)
    handler(event)
    assert.equal(refused, 2)
    await command.run(async () => {})
    handler(event)
    assert.equal(refused, 2)
  }
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

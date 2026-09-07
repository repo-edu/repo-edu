import assert from "node:assert/strict"
import { it } from "node:test"
import type {
  ExclusiveRequestOperation,
  WorkflowHandlerMap,
} from "@repo-edu/application-contract"
import { HostAdmissionRefusedError } from "@repo-edu/application-contract"
import { workflowInputs } from "../../../../packages/application-contract/src/__tests__/workflow-input-fixtures"
import { makeCourse } from "../../../../packages/renderer-app/src/__tests__/session-controller.test-support"
import { HostAdmission } from "../host-admission"
import { executeHostCommand } from "../host-command-execution"
import { createHostRequestTransport } from "../host-request-transport"
import { createPreloadRequestTransport } from "../preload-request-transport"
import { createRendererCommandClient } from "../renderer-command-client"
import { commitRequestPersistence } from "../request-persistence"
import { requestChannel, until } from "./request-port-harness"

const input = workflowInputs["userFile.exportPreview"]

function harness(options: { storageFailure?: boolean } = {}) {
  const channel = requestChannel()
  let starts = 0
  let endings = 0
  let late: (() => void) | undefined
  const admission = new HostAdmission((effect) => {
    if (effect.type === "end-host") {
      endings++
      host.dispose()
    }
  })
  const handlers = {
    "course.save": async () => {
      assert.ok(options.storageFailure)
      throw { type: "course-storage", message: "row mismatch" }
    },
    "userFile.exportPreview": async (_input, callbacks) => {
      starts++
      late = () => callbacks?.onOutput?.({ channel: "info", message: "late" })
      return {
        workflowId: "userFile.exportPreview",
        displayName: "preview.txt",
        preview: "text",
        savedAt: "now",
      }
    },
  } as WorkflowHandlerMap
  const host = createHostRequestTransport({
    admission,
    receive(request, message, signal) {
      if (message.type === "bundle") {
        void commitRequestPersistence({
          request,
          bundle: message.bundle,
          admission,
          handlers,
          transport: host,
        })
      } else if (message.type === "input") {
        void executeHostCommand({
          request,
          operation: message.input as ExclusiveRequestOperation,
          signal: signal!,
          admission,
          handlers,
          transport: host,
        })
      }
    },
  })
  const preload = createPreloadRequestTransport({
    channel(command) {
      return {
        renderer: channel.renderer,
        transfer: () => {
          host.acceptCommand(command, channel.host)
        },
      }
    },
    terminal() {},
  })
  admission.dispatch({ type: "bootstrap-acknowledged" })
  return {
    admission,
    client: createRendererCommandClient(preload.bridge),
    starts: () => starts,
    endings: () => endings,
    late: () => late?.(),
    dispose() {
      preload.dispose()
      host.dispose()
      channel.dispose()
    },
  }
}

it("retires busy admission before persistence or input capture", {
  timeout: 3000,
}, async () => {
  const h = harness()
  let prepared = false
  let captured = false
  const settleCall = h.admission.startWorkflow("course.list", { cancel() {} })
  try {
    await assert.rejects(
      h.client.runBody(
        "userFile.exportPreview",
        async () => {
          prepared = true
        },
        (client) =>
          client.run("userFile.exportPreview", () => {
            captured = true
            return input
          }),
        async () => {},
      ),
      HostAdmissionRefusedError,
    )
    assert.equal(prepared, false)
    assert.equal(captured, false)
    assert.equal(h.starts(), 0)
    assert.equal(h.endings(), 0)
    assert.equal(h.admission.getSnapshot().phase, "interactive")
  } finally {
    settleCall()
    h.dispose()
  }
})

it("rejects output from a handler after the official result is fixed", {
  timeout: 3000,
}, async () => {
  const h = harness()
  try {
    const running = h.client.runBody(
      "userFile.exportPreview",
      async (commit) => {
        await commit({})
      },
      (client) => client.run("userFile.exportPreview", () => input),
      async () => {},
    )
    const failed = assert.rejects(running)
    await until(() => h.admission.getSnapshot().phase === "executing.settling")
    h.late()
    await failed
    assert.equal(h.admission.getSnapshot().phase, "terminal")
    assert.equal(h.endings(), 1)
  } finally {
    h.dispose()
  }
})

it("terminates malformed immutable input before the handler starts", {
  timeout: 3000,
}, async () => {
  const h = harness()
  try {
    await assert.rejects(
      h.client.runBody(
        "userFile.exportPreview",
        async (commit) => {
          await commit({})
        },
        (client) =>
          client.run(
            "userFile.exportPreview",
            () => ({ ...input, kind: "invalid" }) as never,
          ),
        async () => {},
      ),
    )
    await until(() => h.admission.getSnapshot().phase === "terminal")
    assert.equal(h.starts(), 0)
    assert.equal(h.endings(), 1)
  } finally {
    h.dispose()
  }
})

it("terminates course-storage failure during preparation without executing", {
  timeout: 3000,
}, async () => {
  const h = harness({ storageFailure: true })
  try {
    await assert.rejects(
      h.client.runBody(
        "userFile.exportPreview",
        async (commit) => {
          await commit({ course: makeCourse("course") })
        },
        (client) => client.run("userFile.exportPreview", () => input),
        async () => {},
      ),
    )
    assert.equal(h.admission.getSnapshot().phase, "terminal")
    assert.equal(h.starts(), 0)
    assert.equal(h.endings(), 1)
  } finally {
    h.dispose()
  }
})

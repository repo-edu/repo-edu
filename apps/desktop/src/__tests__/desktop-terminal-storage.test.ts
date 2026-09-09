import assert from "node:assert/strict"
import { it } from "node:test"
import type { ExaminationArchiveStoragePort } from "@repo-edu/host-runtime-contract"
import { workflowInputs } from "../../../../packages/application-contract/src/__tests__/workflow-input-fixtures"
import { observeDesktopExaminationStorage } from "../desktop-terminal-sources"
import { HostAdmission } from "../host-admission"
import {
  flushTransport,
  startMessage,
  transportHarness,
} from "./desktop-transport-harness"

const entry = { storageKey: "key", createdAtMs: 1, payloadJson: "{}" }
const summary = {
  totalInBundle: 1,
  inserted: 1,
  updated: 0,
  skipped: 0,
  rejected: 0,
  rejections: [],
}
const operations = {
  get: { args: ["key"], result: entry },
  put: { args: [entry], result: undefined },
  remove: { args: ["key"], result: undefined },
  exportAll: { args: [], result: [entry] },
  importAll: { args: [[entry]], result: summary },
} satisfies Record<
  keyof ExaminationArchiveStoragePort,
  { args: unknown[]; result: unknown }
>

for (const [operation, { args, result }] of Object.entries(operations)) {
  it(`archive ${operation} preserves the successful call without terminal entry`, () => {
    const storage = {
      [operation](...received: unknown[]) {
        assert.equal(this, storage)
        assert.deepEqual(received, args)
        return result
      },
    } as unknown as ExaminationArchiveStoragePort
    const observed = observeDesktopExaminationStorage(storage, () =>
      assert.fail("Unexpected failure"),
    )
    const call = observed[operation as keyof ExaminationArchiveStoragePort] as (
      ...args: unknown[]
    ) => unknown
    assert.equal(call(...args), result)
  })

  it(`archive ${operation} reports its failure before rethrowing without shutdown work`, () => {
    const error = new Error("storage unavailable")
    const trace: string[] = []
    const storage = {
      [operation]() {
        throw error
      },
    } as unknown as ExaminationArchiveStoragePort
    const observed = observeDesktopExaminationStorage(storage, (reported) => {
      assert.equal(reported, error)
      trace.push("terminal")
    })
    const call = observed[operation as keyof ExaminationArchiveStoragePort] as (
      ...args: unknown[]
    ) => unknown
    assert.throws(
      () => call(...args),
      (thrown) => {
        assert.equal(thrown, error)
        trace.push("rethrow")
        return true
      },
    )
    assert.deepEqual(trace, ["terminal", "rethrow"])
  })
}

it("an archive read failure cannot become an ordinary workflow error or start close preparation", async () => {
  const error = new Error("archive unavailable")
  const h = transportHarness(async () => {
    archive.exportAll()
  })
  const archive = observeDesktopExaminationStorage(
    {
      exportAll() {
        throw error
      },
    } as ExaminationArchiveStoragePort,
    h.admission.terminal,
  )
  h.admission.dispatch({ type: "bootstrap-acknowledged" })
  h.receive(
    startMessage(
      "examination.lookupQuestionSummaries",
      workflowInputs["examination.lookupQuestionSummaries"],
    ),
  )
  h.admission.dispatch({
    type: "host-start",
    source: "window-close",
    request: { cancel() {} },
  })
  await flushTransport()
  assert.deepEqual(h.admission.getSnapshot(), { phase: "terminal", error })
  assert.deepEqual(h.terminalTrace, [
    "disable",
    "stop",
    "close-storage",
    "exit:1",
  ])
  assert.deepEqual(h.effects, [
    { type: "disable-input" },
    { type: "end-host", reason: "failure" },
  ])
  assert.equal(
    h.responses.some(
      (response) => "result" in response && response.result.type === "data",
    ),
    false,
  )
  h.gateway.dispose()
})

it("rethrowing an archive failure through outer owners starts shutdown once", () => {
  const effects: string[] = []
  const admission = new HostAdmission((effect) => effects.push(effect.type))
  const error = new Error("archive unavailable")
  const archive = observeDesktopExaminationStorage(
    {
      exportAll() {
        throw error
      },
    } as ExaminationArchiveStoragePort,
    admission.terminal,
  )
  try {
    archive.exportAll()
  } catch (caught) {
    admission.terminal(caught)
  }
  assert.deepEqual(effects, ["disable-input", "end-host"])
  assert.deepEqual(admission.getSnapshot(), { phase: "terminal", error })
})

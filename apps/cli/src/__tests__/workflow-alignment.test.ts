import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { workflowCatalog } from "@repo-edu/application-contract"
import { createCliWorkflowHandlers } from "../workflow-runtime.js"

describe("cli workflow alignment", () => {
  it("wires every workflow that is marked cli-deliverable in workflowCatalog", () => {
    const handlers = createCliWorkflowHandlers()
    const actual = Object.keys(handlers).sort()
    const expected = Object.entries(workflowCatalog)
      .filter(([, metadata]) => metadata.delivery.includes("cli"))
      .map(([workflowId]) => workflowId)
      .sort()

    assert.ok(expected.length > 0, "Expected at least one cli workflow.")
    assert.deepEqual(actual, expected)
  })

  it("every wired workflow id exists in the catalog", () => {
    const handlers = createCliWorkflowHandlers()
    const wiredIds = Object.keys(handlers)

    for (const workflowId of wiredIds) {
      assert.equal(
        Object.hasOwn(workflowCatalog, workflowId),
        true,
        `CLI wires unknown workflow '${workflowId}' not in catalog.`,
      )
    }
  })
})

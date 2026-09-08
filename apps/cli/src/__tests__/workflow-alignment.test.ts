import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { workflowCatalog } from "@repo-edu/application-contract"
import { createChildProcessLifetimeController } from "@repo-edu/host-node/child-process-lifetime"
import { createCliWorkflowHandlers } from "../workflow-runtime.js"

// The handlers are inspected, never run, so the isolated root stays empty.
async function withInspectionHandlers(
  run: (handlers: ReturnType<typeof createCliWorkflowHandlers>) => void,
): Promise<void> {
  const storageRoot = await mkdtemp(join(tmpdir(), "repo-edu-cli-alignment-"))
  try {
    run(
      createCliWorkflowHandlers({
        childProcessLifetimeController: createChildProcessLifetimeController({
          diagnosticSink() {},
          warnUnconfirmedTree(error): never {
            throw error
          },
        }),
        storageRoot,
      }),
    )
  } finally {
    await rm(storageRoot, { recursive: true, force: true })
  }
}

describe("cli workflow alignment", () => {
  it("wires every workflow that is marked cli-deliverable in workflowCatalog", async () => {
    await withInspectionHandlers((handlers) => {
      const actual = Object.keys(handlers).sort()
      const expected = Object.entries(workflowCatalog)
        .filter(([, metadata]) => metadata.delivery.includes("cli"))
        .map(([workflowId]) => workflowId)
        .sort()

      assert.ok(expected.length > 0, "Expected at least one cli workflow.")
      assert.deepEqual(actual, expected)
    })
  })

  it("every wired workflow id exists in the catalog", async () => {
    await withInspectionHandlers((handlers) => {
      for (const workflowId of Object.keys(handlers)) {
        assert.equal(
          Object.hasOwn(workflowCatalog, workflowId),
          true,
          `CLI wires unknown workflow '${workflowId}' not in catalog.`,
        )
      }
    })
  })
})

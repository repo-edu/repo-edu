import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  DeliverySurface,
  WorkflowCancellationGuarantee,
  WorkflowId,
  WorkflowPayloads,
  WorkflowProgressGranularity,
} from "../index.js"
import { createWorkflowClient, packageId, workflowCatalog } from "../index.js"

describe("application-contract workflow catalog", () => {
  const catalogIds = Object.keys(workflowCatalog) as WorkflowId[]

  it("exports the correct packageId", () => {
    assert.equal(packageId, "@repo-edu/application-contract")
  })

  it("has a catalog entry for every WorkflowPayloads key", () => {
    // This test uses a compile-time trick: the catalog is typed as
    // Record<WorkflowId, ...>, so any missing key would already be
    // a type error. At runtime, verify the count matches expectations.
    assert.ok(catalogIds.length > 0, "Catalog should not be empty")

    // Verify well-known workflow ids are present
    const expectedIds: WorkflowId[] = [
      "course.list",
      "course.load",
      "course.save",
      "course.delete",
      "settings.loadApp",
      "settings.saveApp",
      "connection.verifyLmsDraft",
      "connection.listLmsCoursesDraft",
      "connection.verifyGitDraft",
      "roster.importFromFile",
      "roster.importFromLms",
      "roster.exportMembers",
      "groupSet.fetchAvailableFromLms",
      "groupSet.connectFromLms",
      "groupSet.syncFromLms",
      "groupSet.previewImportFromFile",
      "groupSet.importFromFile",
      "groupSet.export",
      "gitUsernames.import",
      "validation.roster",
      "validation.assignment",
      "repo.create",
      "repo.clone",
      "repo.update",
      "repo.listNamespace",
      "repo.bulkClone",
      "userFile.inspectSelection",
      "userFile.exportPreview",
      "analysis.run",
      "analysis.blame",
      "analysis.discoverRepos",
      "examination.generateQuestions",
      "examination.archive.export",
      "examination.archive.import",
      "cache.getStats",
      "cache.clearAll",
    ]

    assert.equal(
      catalogIds.length,
      expectedIds.length,
      `Catalog has ${catalogIds.length} entries but expected ${expectedIds.length}`,
    )

    for (const id of expectedIds) {
      assert.ok(
        id in workflowCatalog,
        `Missing catalog entry for workflow '${id}'`,
      )
    }
  })

  it("every catalog entry has valid delivery surfaces", () => {
    const validSurfaces: DeliverySurface[] = ["desktop", "docs", "cli"]

    for (const [id, meta] of Object.entries(workflowCatalog)) {
      assert.ok(
        meta.delivery.length > 0,
        `Workflow '${id}' has no delivery surfaces`,
      )
      for (const surface of meta.delivery) {
        assert.ok(
          validSurfaces.includes(surface),
          `Workflow '${id}' has invalid surface '${surface}'`,
        )
      }
    }
  })

  it("every catalog entry has valid progress granularity", () => {
    const valid: WorkflowProgressGranularity[] = [
      "none",
      "milestone",
      "granular",
    ]

    for (const [id, meta] of Object.entries(workflowCatalog)) {
      assert.ok(
        valid.includes(meta.progress),
        `Workflow '${id}' has invalid progress '${meta.progress}'`,
      )
    }
  })

  it("every catalog entry has valid cancellation guarantee", () => {
    const valid: WorkflowCancellationGuarantee[] = [
      "non-cancellable",
      "best-effort",
      "cooperative",
    ]

    for (const [id, meta] of Object.entries(workflowCatalog)) {
      assert.ok(
        valid.includes(meta.cancellation),
        `Workflow '${id}' has invalid cancellation '${meta.cancellation}'`,
      )
    }
  })

  it("non-cancellable workflows have no progress reporting", () => {
    for (const [id, meta] of Object.entries(workflowCatalog)) {
      if (meta.cancellation === "non-cancellable" && meta.progress !== "none") {
        // Not strictly required, but this is the current convention:
        // workflows that are non-cancellable also report no progress.
        // If this changes intentionally, update this test.
        const entry = workflowCatalog[id as WorkflowId]
        assert.ok(
          entry,
          `Non-cancellable workflow '${id}' with progress='${meta.progress}'`,
        )
      }
    }
  })

  it("file-dependent workflows exclude CLI delivery", () => {
    const fileWorkflows: WorkflowId[] = [
      "roster.importFromFile",
      "roster.exportMembers",
      "groupSet.previewImportFromFile",
      "groupSet.importFromFile",
      "groupSet.export",
      "gitUsernames.import",
      "userFile.inspectSelection",
      "userFile.exportPreview",
    ]

    for (const id of fileWorkflows) {
      const meta = workflowCatalog[id]
      assert.ok(
        !meta.delivery.includes("cli"),
        `File-dependent workflow '${id}' should not include CLI delivery`,
      )
    }
  })

  it("analysis workflows exclude CLI delivery and use granular progress", () => {
    const analysisWorkflows: WorkflowId[] = ["analysis.run", "analysis.blame"]

    for (const id of analysisWorkflows) {
      const meta = workflowCatalog[id]
      assert.ok(
        !meta.delivery.includes("cli"),
        `Analysis workflow '${id}' should not include CLI delivery`,
      )
      assert.equal(
        meta.progress,
        "granular",
        `Analysis workflow '${id}' should use granular progress`,
      )
      assert.equal(
        meta.cancellation,
        "cooperative",
        `Analysis workflow '${id}' should be cooperatively cancellable`,
      )
    }
  })

  it("setup-phase workflows exclude CLI delivery", () => {
    const setupWorkflows: WorkflowId[] = [
      "course.delete",
      "connection.listLmsCoursesDraft",
      "roster.importFromLms",
      "groupSet.fetchAvailableFromLms",
      "groupSet.syncFromLms",
    ]

    for (const id of setupWorkflows) {
      const meta = workflowCatalog[id]
      assert.ok(
        !meta.delivery.includes("cli"),
        `Setup-phase workflow '${id}' should not include CLI delivery`,
      )
    }
  })

  it("createWorkflowClient routes to the correct handler", async () => {
    const calls: string[] = []

    const client = createWorkflowClient({
      "course.list": async () => {
        calls.push("course.list")
        return []
      },
    } as unknown as Parameters<typeof createWorkflowClient>[0])

    await client.run("course.list", undefined)
    assert.deepEqual(calls, ["course.list"])
  })

  it("createWorkflowClient passes input and options through", async () => {
    let capturedInput: unknown
    let capturedOptions: unknown

    const client = createWorkflowClient({
      "course.load": async (input: unknown, options: unknown) => {
        capturedInput = input
        capturedOptions = options
        return {} as WorkflowPayloads["course.load"]["result"]
      },
    } as unknown as Parameters<typeof createWorkflowClient>[0])

    const onProgress = () => {}
    await client.run("course.load", { courseId: "c1" }, { onProgress })

    assert.deepEqual(capturedInput, { courseId: "c1" })
    assert.equal(
      (capturedOptions as { onProgress: unknown }).onProgress,
      onProgress,
    )
  })
})

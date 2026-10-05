import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { AppError } from "@repo-edu/application-contract"
import { CommandOutcomeError } from "@repo-edu/application-contract"
import type {
  UserFilePort,
  UserFileReadRef,
  UserFileText,
  UserFileWriteReceipt,
  UserSaveTargetWriteRef,
} from "@repo-edu/host-runtime-contract"
import {
  runInspectUserFileWorkflow,
  runUserFileExportPreviewWorkflow,
} from "../user-file-workflows.js"

function createMockUserFilePort(
  overrides?: Partial<UserFilePort>,
): UserFilePort {
  return {
    async readText(
      _ref: UserFileReadRef,
      _signal?: AbortSignal,
    ): Promise<UserFileText> {
      return {
        displayName: "test.csv",
        mediaType: "text/csv",
        text: "col1,col2\nval1,val2\nval3,val4",
        byteLength: 30,
      }
    },
    async writeText(
      ref: UserSaveTargetWriteRef,
      _text: string,
      _signal?: AbortSignal,
    ): Promise<UserFileWriteReceipt> {
      return {
        displayName: ref.displayName,
        mediaType: "text/csv",
        byteLength: 100,
        savedAt: "2026-01-01T00:00:00Z",
      }
    },
    ...overrides,
  }
}

describe("userFile.inspectSelection workflow", () => {
  it("reads a file and returns line count and first line", async () => {
    const port = createMockUserFilePort()
    const result = await runInspectUserFileWorkflow(port, {
      kind: "user-file-ref",
      referenceId: "f1",
      displayName: "test.csv",
      mediaType: "text/csv",
      byteLength: 30,
    })

    assert.equal(result.workflowId, "userFile.inspectSelection")
    assert.equal(result.displayName, "test.csv")
    assert.equal(result.byteLength, 30)
    assert.equal(result.lineCount, 3)
    assert.equal(result.firstLine, "col1,col2")
  })

  it("emits progress events", async () => {
    const progress: unknown[] = []
    const port = createMockUserFilePort()

    await runInspectUserFileWorkflow(
      port,
      {
        kind: "user-file-ref",
        referenceId: "f1",
        displayName: "test.csv",
        mediaType: "text/csv",
        byteLength: 30,
      },
      { onProgress: (p) => progress.push(p) },
    )

    assert.equal(progress.length, 2)
  })

  it("throws a cancelled AppError when signal is already aborted", async () => {
    const port = createMockUserFilePort()
    const controller = new AbortController()
    controller.abort()

    await assert.rejects(
      runInspectUserFileWorkflow(
        port,
        {
          kind: "user-file-ref",
          referenceId: "f1",
          displayName: "test.csv",
          mediaType: "text/csv",
          byteLength: 30,
        },
        { signal: controller.signal },
      ),
      (error: unknown) => {
        const appError = error as AppError
        assert.equal(appError.type, "cancelled")
        return true
      },
    )
  })

  it("passes the port's read failure through unchanged", async () => {
    const failure = new CommandOutcomeError({
      disposition: "refused",
      error: { type: "effect", message: "Unknown user-file reference: f1" },
    })
    const port = createMockUserFilePort({
      async readText() {
        throw failure
      },
    })

    await assert.rejects(
      runInspectUserFileWorkflow(port, {
        kind: "user-file-ref",
        referenceId: "f1",
        displayName: "test.csv",
        mediaType: null,
        byteLength: null,
      }),
      (error: unknown) => error === failure,
    )
  })

  it("handles files with trailing newlines correctly", async () => {
    const port = createMockUserFilePort({
      async readText(): Promise<UserFileText> {
        return {
          displayName: "trailing.csv",
          mediaType: "text/csv",
          text: "header\nrow1\nrow2\n",
          byteLength: 18,
        }
      },
    })

    const result = await runInspectUserFileWorkflow(port, {
      kind: "user-file-ref",
      referenceId: "f1",
      displayName: "trailing.csv",
      mediaType: "text/csv",
      byteLength: 18,
    })

    assert.equal(result.lineCount, 3)
    assert.equal(result.firstLine, "header")
  })
})

describe("userFile.exportPreview workflow", () => {
  it("writes a preview and returns the result", async () => {
    const port = createMockUserFilePort()
    const result = await runUserFileExportPreviewWorkflow(port, {
      kind: "user-save-target-ref",
      referenceId: "t1",
      displayName: "preview.csv",
      suggestedFormat: "csv",
    })

    assert.equal(result.workflowId, "userFile.exportPreview")
    assert.equal(result.displayName, "preview.csv")
    assert.ok(result.preview.includes("student_id"))
    assert.equal(result.savedAt, "2026-01-01T00:00:00Z")
  })

  it("emits progress and output events", async () => {
    const progress: unknown[] = []
    const outputs: unknown[] = []
    const port = createMockUserFilePort()

    await runUserFileExportPreviewWorkflow(
      port,
      {
        kind: "user-save-target-ref",
        referenceId: "t1",
        displayName: "preview.csv",
        suggestedFormat: "csv",
      },
      {
        onProgress: (p) => progress.push(p),
        onOutput: (o) => outputs.push(o),
      },
    )

    assert.equal(progress.length, 2)
    assert.equal(outputs.length, 1)
  })
})

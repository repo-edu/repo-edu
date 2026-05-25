import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { AppError } from "@repo-edu/application-contract"
import type { FileSystemPort } from "@repo-edu/host-runtime-contract"
import { createAnalysisWorkflowHandlers } from "../analysis-workflows/analysis-workflows.js"

function createFileSystemPort(
  overrides: Partial<FileSystemPort> = {},
): FileSystemPort {
  return {
    userHomeSystemDirectories: [],
    inspect: async () => [],
    stat: async () => ({ kind: "directory", size: null }),
    applyBatch: async () => ({ completed: [] }),
    createTempDirectory: async () => "/tmp/repo-edu-test",
    listDirectory: async () => [],
    listFiles: async () => [],
    readFileInsideRoot: async () => ({
      relativePath: "main.ts",
      bytes: new TextEncoder().encode("const answer = 42\n"),
    }),
    ...overrides,
  }
}

function createHandlers(fileSystem: FileSystemPort) {
  return createAnalysisWorkflowHandlers({
    gitCommand: {
      cancellation: "best-effort",
      run: async () => ({ exitCode: 0, signal: null, stdout: "", stderr: "" }),
    },
    fileSystem,
  })
}

async function assertValidationError(action: () => Promise<unknown>) {
  await assert.rejects(action, (error) => {
    assert.equal((error as AppError).type, "validation")
    return true
  })
}

describe("submission folder analysis workflows", () => {
  it("normalizes extension filters before listing files", async () => {
    const handlers = createHandlers(
      createFileSystemPort({
        listFiles: async (request) => {
          assert.deepStrictEqual(request.extensions, ["ts", "js"])
          return [
            { relativePath: "b.ts", size: 2 },
            { relativePath: "a.ts", size: 1 },
          ]
        },
      }),
    )

    const result = await handlers["analysis.listFolderFiles"]({
      folderPath: "/tmp/submission",
      extensions: [" .TS ", "js", "ts"],
    })

    assert.deepStrictEqual(result.files, [
      { relativePath: "a.ts", size: 1 },
      { relativePath: "b.ts", size: 2 },
    ])
  })

  it("rejects invalid roots and escaping relative paths", async () => {
    const handlers = createHandlers(createFileSystemPort())

    await assertValidationError(() =>
      handlers["analysis.listFolderFiles"]({
        folderPath: "relative",
        extensions: ["ts"],
      }),
    )
    await assertValidationError(() =>
      handlers["analysis.readFolderFile"]({
        folderPath: "/tmp/submission",
        relativePath: "../main.ts",
      }),
    )
    await assertValidationError(() =>
      handlers["analysis.readFolderFile"]({
        folderPath: "/tmp/submission",
        relativePath: "C:main.ts",
      }),
    )
  })

  it("reads selected files as base64 through the filesystem port", async () => {
    const handlers = createHandlers(
      createFileSystemPort({
        readFileInsideRoot: async (request) => {
          assert.equal(request.relativePath, " main.ts ")
          return {
            relativePath: request.relativePath,
            bytes: new TextEncoder().encode("const answer = 42\n"),
          }
        },
      }),
    )

    const result = await handlers["analysis.readFolderFile"]({
      folderPath: "/tmp/submission",
      relativePath: " main.ts ",
    })

    assert.equal(result.relativePath, " main.ts ")
    assert.equal(result.byteLength, "const answer = 42\n".length)
    assert.equal(atob(result.base64), "const answer = 42\n")
  })
})

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  createCancelledAppError,
  isAppError,
} from "@repo-edu/application-contract"
import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"
import { createAnalysisWorkflowHandlers } from "../analysis-workflows/analysis-workflows.js"

function createMockGitCommandPort(
  repositoryPaths: readonly string[],
): GitCommandPort {
  const repos = new Set(repositoryPaths)
  return {
    cancellation: "cooperative",
    async run(request) {
      if (request.signal?.aborted) {
        throw Object.assign(new DOMException("Aborted", "AbortError"))
      }
      const isRepo =
        request.args[0] === "-C" &&
        request.args[2] === "rev-parse" &&
        request.args[3] === "--is-inside-work-tree" &&
        repos.has(request.args[1] ?? "")
      return {
        exitCode: isRepo ? 0 : 128,
        signal: null,
        stdout: isRepo ? "true\n" : "",
        stderr: isRepo ? "" : "fatal: not a git repository",
      }
    },
  }
}

function createStubFileSystemPort(
  listDirectory: FileSystemPort["listDirectory"],
): FileSystemPort {
  return {
    userHomeSystemDirectories: [],
    async inspect(request) {
      return request.paths.map((path) => ({ path, kind: "missing" as const }))
    },
    async applyBatch(request) {
      return { completed: request.operations }
    },
    async createTempDirectory() {
      return "/tmp/test"
    },
    listDirectory,
  }
}

describe("analysis.discoverRepos handler", () => {
  it("continues discovery when one nested directory is unreadable", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort([
        "/root/repo-a",
        "/root/nested/repo-b",
      ]),
      fileSystem: createStubFileSystemPort(async (request) => {
        if (request.path === "/root") {
          return [
            { name: "repo-a", kind: "directory" as const },
            { name: "nested", kind: "directory" as const },
            { name: "blocked", kind: "directory" as const },
          ]
        }
        if (request.path === "/root/nested") {
          return [{ name: "repo-b", kind: "directory" as const }]
        }
        if (request.path === "/root/blocked") {
          throw new Error("EACCES: permission denied")
        }
        return []
      }),
    })

    const result = await handlers["analysis.discoverRepos"]({
      searchFolder: "/root",
      maxDepth: 2,
    })

    assert.deepEqual(result.repos, [
      { name: "repo-a", path: "/root/repo-a" },
      { name: "repo-b", path: "/root/nested/repo-b" },
    ])
  })

  it("rethrows cancellation instead of swallowing it", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort([]),
      fileSystem: createStubFileSystemPort(async (request) => {
        if (request.path === "/root") {
          return [{ name: "blocked", kind: "directory" as const }]
        }
        if (request.path === "/root/blocked") {
          throw createCancelledAppError("Workflow was cancelled.")
        }
        return []
      }),
    })

    try {
      await handlers["analysis.discoverRepos"]({
        searchFolder: "/root",
        maxDepth: 2,
      })
      assert.fail("Expected cancellation error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal(error.type, "cancelled")
    }
  })
})

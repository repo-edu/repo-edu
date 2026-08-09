import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
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

const discoveryRoot = join(tmpdir(), "repo-edu-analysis-discovery")
const repoAPath = join(discoveryRoot, "repo-a")
const nestedPath = join(discoveryRoot, "nested")
const repoBPath = join(nestedPath, "repo-b")
const blockedPath = join(discoveryRoot, "blocked")

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
      const queryPath = request.args[1] ?? ""
      const isRevParse =
        request.args[0] === "-C" && request.args[2] === "rev-parse"
      if (isRevParse && request.args[3] === "--show-toplevel") {
        const match = repos.has(queryPath)
          ? queryPath
          : [...repos].find(
              (r) => queryPath === r || queryPath.startsWith(`${r}${sep}`),
            )
        if (match) {
          return {
            exitCode: 0,
            signal: null,
            stdout: `${match}\n`,
            stderr: "",
          }
        }
        return {
          exitCode: 128,
          signal: null,
          stdout: "",
          stderr: "fatal: not a git repository",
        }
      }
      const isRepo =
        isRevParse &&
        request.args[3] === "--is-inside-work-tree" &&
        repos.has(queryPath)
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
    async stat() {
      return { kind: "missing", size: null }
    },
    async applyBatch(request) {
      return { completed: request.operations }
    },
    async createTempDirectory() {
      return join(tmpdir(), "repo-edu-analysis-test")
    },
    listDirectory,
    async listFiles() {
      return []
    },
    async readFileInsideRoot() {
      throw new Error("readFileInsideRoot not implemented in this test")
    },
  }
}

describe("analysis.discoverRepos handler", () => {
  it("continues discovery when one nested directory is unreadable", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort([repoAPath, repoBPath]),
      fileSystem: createStubFileSystemPort(async (request) => {
        if (request.path === discoveryRoot) {
          return [
            { name: "repo-a", kind: "directory" as const },
            { name: "nested", kind: "directory" as const },
            { name: "blocked", kind: "directory" as const },
          ]
        }
        if (request.path === nestedPath) {
          return [{ name: "repo-b", kind: "directory" as const }]
        }
        if (request.path === blockedPath) {
          throw new Error("EACCES: permission denied")
        }
        return []
      }),
    })

    const result = await handlers["analysis.discoverRepos"]({
      searchFolder: discoveryRoot,
      maxDepth: 2,
    })

    assert.deepEqual(result.repos, [
      { name: "repo-a", path: repoAPath },
      { name: "repo-b", path: repoBPath },
    ])
  })

  it("returns the enclosing repo root when the search folder is inside a repo", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort([repoAPath]),
      fileSystem: createStubFileSystemPort(async () => []),
    })

    const result = await handlers["analysis.discoverRepos"]({
      searchFolder: join(repoAPath, "src", "nested"),
      maxDepth: 2,
    })

    assert.deepEqual(result.repos, [{ name: "repo-a", path: repoAPath }])
  })

  it("rethrows cancellation instead of swallowing it", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort([]),
      fileSystem: createStubFileSystemPort(async (request) => {
        if (request.path === discoveryRoot) {
          return [{ name: "blocked", kind: "directory" as const }]
        }
        if (request.path === blockedPath) {
          throw createCancelledAppError("Workflow was cancelled.")
        }
        return []
      }),
    })

    try {
      await handlers["analysis.discoverRepos"]({
        searchFolder: discoveryRoot,
        maxDepth: 2,
      })
      assert.fail("Expected cancellation error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal(error.type, "cancelled")
    }
  })
})

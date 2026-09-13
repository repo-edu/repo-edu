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
): GitCommandPort & { readonly queriedPaths: string[] } {
  const repos = new Set(repositoryPaths)
  const queriedPaths: string[] = []
  return {
    cancellation: "cooperative",
    queriedPaths,
    async run(request) {
      if (request.signal?.aborted) {
        throw Object.assign(new DOMException("Aborted", "AbortError"))
      }
      const queryPath = request.args[1] ?? ""
      assert.deepEqual(request.args.slice(2), ["rev-parse", "--show-toplevel"])
      queriedPaths.push(queryPath)
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
    },
  }
}

const gitDirectory = { name: ".git", kind: "directory" as const }
const gitFile = { name: ".git", kind: "file" as const }
const directory = (name: string) => ({ name, kind: "directory" as const })

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
  it("validates .git candidates without asking Git about ordinary folders", async () => {
    const worktreePath = join(nestedPath, "worktree")
    const gitCommand = createMockGitCommandPort([
      repoAPath,
      repoBPath,
      worktreePath,
    ])
    const listedPaths: string[] = []
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: createStubFileSystemPort(async (request) => {
        listedPaths.push(request.path)
        if (request.path === discoveryRoot) {
          return [
            directory("repo-a"),
            directory("nested"),
            directory("blocked"),
            directory(".hidden"),
          ]
        }
        if (request.path === repoAPath) {
          return [gitDirectory, directory("src")]
        }
        if (request.path === nestedPath) {
          return [directory("repo-b"), directory("worktree")]
        }
        if (request.path === repoBPath) return [gitDirectory]
        if (request.path === worktreePath) return [gitFile]
        if (request.path === blockedPath) {
          throw new Error("EACCES: permission denied")
        }
        assert.fail(`Unexpected listing: ${request.path}`)
      }),
    })

    const result = await handlers["analysis.discoverRepos"]({
      searchFolder: discoveryRoot,
      maxDepth: 2,
    })

    assert.deepEqual(result.repos, [
      { name: "repo-a", path: repoAPath },
      { name: "repo-b", path: repoBPath },
      { name: "worktree", path: worktreePath },
    ])
    assert.deepEqual(gitCommand.queriedPaths, [
      discoveryRoot,
      repoAPath,
      repoBPath,
      worktreePath,
    ])
    assert.deepEqual(listedPaths, [
      discoveryRoot,
      repoAPath,
      nestedPath,
      repoBPath,
      worktreePath,
      blockedPath,
    ])
  })

  it("stops at the depth limit without listing deeper folders", async () => {
    const listedPaths: string[] = []
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort([]),
      fileSystem: createStubFileSystemPort(async (request) => {
        listedPaths.push(request.path)
        if (request.path === discoveryRoot) return [directory("nested")]
        if (request.path === nestedPath) return [directory("repo-b")]
        return []
      }),
    })

    const result = await handlers["analysis.discoverRepos"]({
      searchFolder: discoveryRoot,
      maxDepth: 1,
    })

    assert.deepEqual(result.repos, [])
    assert.deepEqual(listedPaths, [discoveryRoot, nestedPath])
  })

  for (const invalidEntry of [gitDirectory, gitFile]) {
    it(`continues below an invalid .git ${invalidEntry.kind}`, async () => {
      const gitCommand = createMockGitCommandPort([repoBPath])
      const handlers = createAnalysisWorkflowHandlers({
        gitCommand,
        fileSystem: createStubFileSystemPort(async (request) => {
          if (request.path === discoveryRoot) return [directory("nested")]
          if (request.path === nestedPath)
            return [invalidEntry, directory("repo-b")]
          if (request.path === repoBPath) return [gitDirectory]
          return []
        }),
      })

      const result = await handlers["analysis.discoverRepos"]({
        searchFolder: discoveryRoot,
        maxDepth: 2,
      })

      assert.deepEqual(result.repos, [{ name: "repo-b", path: repoBPath }])
      assert.deepEqual(gitCommand.queriedPaths, [
        discoveryRoot,
        nestedPath,
        repoBPath,
      ])
    })
  }

  it("propagates cancellation while validating a candidate", async () => {
    const gitCommand = createMockGitCommandPort([])
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: {
        ...gitCommand,
        async run(request) {
          if (request.args[1] === nestedPath)
            throw createCancelledAppError("Workflow was cancelled.")
          return gitCommand.run(request)
        },
      },
      fileSystem: createStubFileSystemPort(async (request) =>
        request.path === discoveryRoot ? [directory("nested")] : [gitDirectory],
      ),
    })

    await assert.rejects(
      handlers["analysis.discoverRepos"]({ searchFolder: discoveryRoot }),
      (error: unknown) => isAppError(error) && error.type === "cancelled",
    )
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
        if (request.path === discoveryRoot) return [directory("blocked")]
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

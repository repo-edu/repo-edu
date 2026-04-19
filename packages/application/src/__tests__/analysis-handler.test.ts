import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  AnalysisProgress,
  AnalysisRunInput,
  AppError,
} from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import type {
  FileSystemPort,
  GitCommandPort,
} from "@repo-edu/host-runtime-contract"
import { createAnalysisWorkflowHandlers } from "../analysis-workflows/analysis-workflows.js"
import { createLruAnalysisCache } from "../analysis-workflows/cache.js"
import { COMMIT_DELIMITER } from "../analysis-workflows/log-parser.js"

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockCourse(
  overrides: Partial<PersistedCourse> = {},
): PersistedCourse {
  return {
    id: "course-1",
    name: "Test Course",
    repositoryCloneTargetDirectory: "/tmp/repos",
    repositoryCloneDirectoryLayout: "flat",
    ...overrides,
  } as PersistedCourse
}

function createMockGitCommandPort(
  responses: Record<
    string,
    { exitCode: number; stdout: string; stderr: string }
  >,
): GitCommandPort {
  return {
    cancellation: "cooperative",
    async run(request) {
      if (request.signal?.aborted) {
        throw Object.assign(new DOMException("Aborted", "AbortError"))
      }

      const key = request.args.join(" ")

      // Match by prefix for flexibility
      for (const [pattern, response] of Object.entries(responses)) {
        if (key.startsWith(pattern) || key.includes(pattern)) {
          return { ...response, signal: null }
        }
      }

      return { exitCode: 0, stdout: "", stderr: "", signal: null }
    },
  }
}

const stubFileSystem: FileSystemPort = {
  async inspect(request) {
    return request.paths.map((path) => ({
      path,
      kind: "missing" as const,
    }))
  },
  async applyBatch(request) {
    return { completed: request.operations }
  },
  async createTempDirectory() {
    return "/tmp/test"
  },
  async listDirectory() {
    return []
  },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analysis.run handler", () => {
  it("validates config and rejects invalid input", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    const input: AnalysisRunInput = {
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: {
        since: "invalid-date",
      },
    }

    try {
      await handlers["analysis.run"](input)
      assert.fail("Should have thrown validation error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "validation")
    }
  })

  it("rejects missing repositoryCloneTargetDirectory", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    const input: AnalysisRunInput = {
      course: createMockCourse({
        repositoryCloneTargetDirectory: undefined,
      }),
      repositoryRelativePath: "test-repo",
      config: {},
    }

    try {
      await handlers["analysis.run"](input)
      assert.fail("Should have thrown")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "validation")
    }
  })

  it("returns empty result for repos with no matching files", async () => {
    const gitCommand = createMockGitCommandPort({
      "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
      "rev-parse HEAD": { exitCode: 0, stdout: "abc123def456", stderr: "" },
      "ls-tree": { exitCode: 0, stdout: "", stderr: "" },
    })

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.run"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { nFiles: 0 },
    })

    assert.equal(result.authorStats.length, 0)
    assert.equal(result.fileStats.length, 0)
    assert.equal(result.authorDailyActivity.length, 0)
    assert.equal(result.resolvedAsOfOid, "abc123def456")
  })

  it("caches empty analysis results and skips repeated tree scans", async () => {
    const calls: string[] = []
    const gitCommand: GitCommandPort = {
      cancellation: "cooperative",
      async run(request) {
        const key = request.args.join(" ")
        calls.push(key)

        if (key.startsWith("rev-parse --git-dir")) {
          return { exitCode: 0, stdout: ".git", stderr: "", signal: null }
        }
        if (key.startsWith("rev-parse HEAD")) {
          return {
            exitCode: 0,
            stdout: "abc123def456",
            stderr: "",
            signal: null,
          }
        }
        if (key.startsWith("ls-tree")) {
          return { exitCode: 0, stdout: "", stderr: "", signal: null }
        }
        return { exitCode: 0, stdout: "", stderr: "", signal: null }
      },
    }

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
      cache: createLruAnalysisCache(8),
    })

    const input: AnalysisRunInput = {
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { nFiles: 0 },
    }

    const first = await handlers["analysis.run"](input)
    const second = await handlers["analysis.run"](input)

    assert.deepEqual(first, second)
    assert.equal(
      calls.filter((call) => call.startsWith("ls-tree")).length,
      1,
      "second run should hit cache before ls-tree",
    )
  })

  it("emits progress events through all phases", async () => {
    const gitCommand = createMockGitCommandPort({
      "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
      "rev-parse HEAD": { exitCode: 0, stdout: "abc123", stderr: "" },
      "ls-tree": {
        exitCode: 0,
        stdout: "100644 blob abc123 100\tsrc/main.ts\n",
        stderr: "",
      },
      log: {
        exitCode: 0,
        stdout: [
          `${COMMIT_DELIMITER}`,
          "\0sha1234\x001700000000\0Alice\0alice@example.com\0init",
          "\0" + "10\t0\0src/main.ts\0",
        ].join(""),
        stderr: "",
      },
    })

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })
    const phases: string[] = []

    await handlers["analysis.run"](
      {
        course: createMockCourse(),
        repositoryRelativePath: "test-repo",
        config: { nFiles: 0 },
      },
      {
        onProgress(event: AnalysisProgress) {
          phases.push(event.phase)
        },
      },
    )

    assert.ok(phases.includes("init"))
    assert.ok(phases.includes("log"))
    assert.ok(phases.includes("done"))
  })

  it("respects AbortSignal for cooperative cancellation", async () => {
    const controller = new AbortController()
    controller.abort()

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    try {
      await handlers["analysis.run"](
        {
          course: createMockCourse(),
          repositoryRelativePath: "test-repo",
          config: {},
        },
        { signal: controller.signal },
      )
      assert.fail("Should have thrown cancelled error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "cancelled")
    }
  })

  it("resolves asOfCommit when explicitly provided", async () => {
    const gitCommand = createMockGitCommandPort({
      "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
      "rev-parse --verify": {
        exitCode: 0,
        stdout: "explicit-oid-resolved",
        stderr: "",
      },
      "ls-tree": { exitCode: 0, stdout: "", stderr: "" },
    })

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.run"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { nFiles: 0 },
      asOfCommit: "v1.0",
    })

    assert.equal(result.resolvedAsOfOid, "explicit-oid-resolved")
  })

  it("runs roster bridge when rosterContext is provided", async () => {
    const gitCommand = createMockGitCommandPort({
      "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
      "rev-parse HEAD": { exitCode: 0, stdout: "abc123", stderr: "" },
      "ls-tree": {
        exitCode: 0,
        stdout: "100644 blob abc123 100\tsrc/main.ts\n",
        stderr: "",
      },
      log: {
        exitCode: 0,
        stdout: [
          `${COMMIT_DELIMITER}`,
          "\0sha1234\x001700000000\0Alice\0alice@example.com\0init",
          "\0" + "10\t0\0src/main.ts\0",
        ].join(""),
        stderr: "",
      },
    })

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.run"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { nFiles: 0 },
      rosterContext: {
        members: [
          {
            id: "m1",
            name: "Alice",
            email: "alice@example.com",
            studentNumber: null,
            gitUsername: null,
            gitUsernameStatus: "unknown",
            status: "active",
            lmsStatus: null,
            lmsUserId: null,
            enrollmentType: "student",
            enrollmentDisplay: null,
            department: null,
            institution: null,
            source: "import",
          },
        ],
      },
    })

    assert.ok(result.rosterMatches !== undefined)
    assert.ok(result.rosterMatches.matches.length > 0)
  })

  it("rejects repositoryRelativePath path traversal", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    try {
      await handlers["analysis.run"]({
        course: createMockCourse(),
        repositoryRelativePath: "../outside",
        config: {},
      })
      assert.fail("Should have thrown validation error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "validation")
    }
  })

  it("assigns person ids and applies author exclusions to file stats", async () => {
    const gitCommand = createMockGitCommandPort({
      "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
      "rev-parse HEAD": { exitCode: 0, stdout: "abc123", stderr: "" },
      "ls-tree": {
        exitCode: 0,
        stdout: "100644 blob abc123 100\tsrc/main.ts\n",
        stderr: "",
      },
      log: {
        exitCode: 0,
        stdout: [
          `${COMMIT_DELIMITER}`,
          "\0sha1111\x001700000000\0Alice\0alice@school.edu\0first",
          "\0" + "5\t0\0src/main.ts\0",
          `${COMMIT_DELIMITER}`,
          "\0sha2222\x001700000100\0Alice\0alice@work.edu\0second",
          "\0" + "4\t0\0src/main.ts\0",
          `${COMMIT_DELIMITER}`,
          "\0sha3333\x001700000200\0Bob\0bob@example.com\0third",
          "\0" + "3\t0\0src/main.ts\0",
        ].join(""),
        stderr: "",
      },
    })

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })
    const result = await handlers["analysis.run"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { nFiles: 0, excludeAuthors: ["alice"] },
    })

    assert.equal(result.authorStats.length, 1)
    assert.equal(result.authorStats[0].canonicalName, "Bob")
    assert.ok(result.authorStats[0].personId.length > 0)

    assert.equal(result.fileStats.length, 1)
    assert.equal(result.fileStats[0].insertions, 3)
    assert.equal(result.fileStats[0].commits, 1)
    assert.equal(result.fileStats[0].lastModified, 1700000200)
    assert.equal(result.authorDailyActivity.length, 1)
    assert.equal(
      result.authorDailyActivity[0].personId,
      result.authorStats[0].personId,
    )
    assert.equal(result.authorDailyActivity[0].insertions, 3)
  })
})

describe("analysis.blame handler", () => {
  it("returns empty result for empty files list", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-parse --verify": {
          exitCode: 0,
          stdout: "resolved-oid",
          stderr: "",
        },
      }),
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.blame"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: {},
      personDbBaseline: { persons: [], identityIndex: new Map() },
      files: [],
      asOfCommit: "abc123",
    })

    assert.equal(result.fileBlames.length, 0)
    assert.equal(result.authorSummaries.length, 0)
    assert.deepEqual(result.delta.newPersons, [])
  })

  it("respects AbortSignal", async () => {
    const controller = new AbortController()
    controller.abort()

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    try {
      await handlers["analysis.blame"](
        {
          course: createMockCourse(),
          repositoryRelativePath: "test-repo",
          config: {},
          personDbBaseline: { persons: [], identityIndex: new Map() },
          files: ["src/main.ts"],
          asOfCommit: "abc123",
        },
        { signal: controller.signal },
      )
      assert.fail("Should have thrown cancelled error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "cancelled")
    }
  })

  it("parses blame output and builds author summaries", async () => {
    const oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const blameOutput = [
      `${oid} 1 1 2`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-mail <alice@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary Init",
      "filename src/main.ts",
      "\tconst x = 1",
      `${oid} 2 2`,
      "filename src/main.ts",
      "\tconst y = 2",
    ].join("\n")

    const gitCommand = createMockGitCommandPort({
      "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
      "rev-parse --verify": {
        exitCode: 0,
        stdout: "resolved-oid",
        stderr: "",
      },
      "cat-file": { exitCode: 1, stdout: "", stderr: "" },
      blame: { exitCode: 0, stdout: blameOutput, stderr: "" },
    })

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.blame"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: {},
      personDbBaseline: { persons: [], identityIndex: new Map() },
      files: ["src/main.ts"],
      asOfCommit: "abc123",
    })

    assert.equal(result.fileBlames.length, 1)
    assert.equal(result.fileBlames[0].lines.length, 2)
    assert.equal(result.authorSummaries.length, 1)
    assert.equal(result.authorSummaries[0].canonicalName, "Alice")
    assert.equal(result.authorSummaries[0].lines, 2)
    assert.equal(result.authorSummaries[0].linesPercent, 100)
  })

  it("keeps full blame lines for display while summaries honor exclusion config", async () => {
    const aliceOid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const bobOid = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    const blameOutput = [
      `${aliceOid} 1 1 1`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-mail <alice@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary Skeleton",
      "filename src/main.ts",
      "\tconst x = 1",
      `${bobOid} 2 2 1`,
      "author Bob",
      "author-mail <bob@example.com>",
      "author-time 1700000001",
      "author-tz +0000",
      "committer Bob",
      "committer-mail <bob@example.com>",
      "committer-time 1700000001",
      "committer-tz +0000",
      "summary Student work",
      "filename src/main.ts",
      "\tconst y = 2",
    ].join("\n")

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-parse --verify": {
          exitCode: 0,
          stdout: "resolved-oid",
          stderr: "",
        },
        "cat-file": { exitCode: 1, stdout: "", stderr: "" },
        blame: { exitCode: 0, stdout: blameOutput, stderr: "" },
      }),
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.blame"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { excludeAuthors: ["Alice"] },
      personDbBaseline: { persons: [], identityIndex: new Map() },
      files: ["src/main.ts"],
      asOfCommit: "abc123",
    })

    assert.equal(result.fileBlames.length, 1)
    assert.equal(result.fileBlames[0].lines.length, 2)
    assert.equal(result.authorSummaries.length, 1)
    assert.equal(result.authorSummaries[0].canonicalName, "Bob")
    assert.equal(result.authorSummaries[0].lines, 1)
    assert.equal(result.authorSummaries[0].linesPercent, 100)
  })

  it("rejects invalid asOfCommit", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-parse --verify": {
          exitCode: 1,
          stdout: "",
          stderr: "unknown revision",
        },
      }),
      fileSystem: stubFileSystem,
    })

    try {
      await handlers["analysis.blame"]({
        course: createMockCourse(),
        repositoryRelativePath: "test-repo",
        config: {},
        personDbBaseline: { persons: [], identityIndex: new Map() },
        files: ["src/main.ts"],
        asOfCommit: "missing-sha",
      })
      assert.fail("Should have thrown validation error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "validation")
    }
  })

  it("rejects repositoryRelativePath path traversal", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    try {
      await handlers["analysis.blame"]({
        course: createMockCourse(),
        repositoryRelativePath: "../outside",
        config: {},
        personDbBaseline: { persons: [], identityIndex: new Map() },
        files: ["src/main.ts"],
        asOfCommit: "abc123",
      })
      assert.fail("Should have thrown validation error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "validation")
    }
  })

  it("applies blame file filters from AnalysisBlameConfig", async () => {
    const oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const blameOutput = [
      `${oid} 1 1 1`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "summary Init",
      "filename src/main.ts",
      "\tconst x = 1",
    ].join("\n")

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-parse --verify": {
          exitCode: 0,
          stdout: "resolved-oid",
          stderr: "",
        },
        "cat-file": { exitCode: 1, stdout: "", stderr: "" },
        "src/main.md": {
          exitCode: 1,
          stdout: "",
          stderr: "should not be called",
        },
        "src/main.ts": { exitCode: 0, stdout: blameOutput, stderr: "" },
      }),
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.blame"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: {
        subfolder: "src",
        extensions: ["ts"],
        includeFiles: ["*.ts"],
      },
      personDbBaseline: { persons: [], identityIndex: new Map() },
      files: ["main.ts", "main.md"],
      asOfCommit: "abc123",
    })

    assert.equal(result.fileBlames.length, 1)
    assert.equal(result.fileBlames[0].path, "main.ts")
  })

  it("builds per-file summaries with per-author line counts resolved through personDb", async () => {
    const oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const blameMain = [
      `${oid} 1 1 2`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-mail <alice@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary Init",
      "filename src/main.ts",
      "\tconst x = 1",
      `${oid} 2 2`,
      "filename src/main.ts",
      "\tconst y = 2",
    ].join("\n")

    const bobOid = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    const blameUtil = [
      `${oid} 1 1 1`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "author-tz +0000",
      "committer Alice",
      "committer-mail <alice@example.com>",
      "committer-time 1700000000",
      "committer-tz +0000",
      "summary Init",
      "filename src/util.ts",
      "\tconst a = 1",
      `${bobOid} 2 2 2`,
      "author Bob",
      "author-mail <bob@example.com>",
      "author-time 1700000100",
      "author-tz +0000",
      "committer Bob",
      "committer-mail <bob@example.com>",
      "committer-time 1700000100",
      "committer-tz +0000",
      "summary More",
      "filename src/util.ts",
      "\tconst b = 2",
      `${bobOid} 3 3`,
      "filename src/util.ts",
      "\tconst c = 3",
    ].join("\n")

    const gitCommand: GitCommandPort = {
      cancellation: "cooperative",
      async run(request) {
        const args = request.args.join(" ")
        if (args.startsWith("rev-parse --git-dir")) {
          return { exitCode: 0, stdout: ".git", stderr: "", signal: null }
        }
        if (args.startsWith("rev-parse --verify")) {
          return {
            exitCode: 0,
            stdout: "resolved-oid",
            stderr: "",
            signal: null,
          }
        }
        if (args.startsWith("cat-file")) {
          return { exitCode: 1, stdout: "", stderr: "", signal: null }
        }
        if (args.includes("src/main.ts")) {
          return { exitCode: 0, stdout: blameMain, stderr: "", signal: null }
        }
        if (args.includes("src/util.ts")) {
          return { exitCode: 0, stdout: blameUtil, stderr: "", signal: null }
        }
        return { exitCode: 0, stdout: "", stderr: "", signal: null }
      },
    }

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.blame"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: {},
      personDbBaseline: { persons: [], identityIndex: new Map() },
      files: ["src/main.ts", "src/util.ts"],
      asOfCommit: "abc123",
    })

    assert.equal(result.fileSummaries.length, 2)

    const main = result.fileSummaries.find((f) => f.path === "src/main.ts")
    const util = result.fileSummaries.find((f) => f.path === "src/util.ts")
    assert.ok(main)
    assert.ok(util)
    assert.equal(main.lines, 2)
    assert.equal(util.lines, 3)

    const alice = result.authorSummaries.find(
      (s) => s.canonicalName === "Alice",
    )
    const bob = result.authorSummaries.find((s) => s.canonicalName === "Bob")
    assert.ok(alice && alice.personId.length > 0)
    assert.ok(bob && bob.personId.length > 0)

    assert.equal(main.authorLines.get(alice.personId), 2)
    assert.equal(main.authorLines.has(bob.personId), false)
    assert.equal(util.authorLines.get(alice.personId), 1)
    assert.equal(util.authorLines.get(bob.personId), 2)
  })

  it("fails instead of silently swallowing git blame command errors", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-parse --verify": {
          exitCode: 0,
          stdout: "resolved-oid",
          stderr: "",
        },
        "cat-file": { exitCode: 1, stdout: "", stderr: "" },
        blame: { exitCode: 1, stdout: "", stderr: "fatal: failed" },
      }),
      fileSystem: stubFileSystem,
    })

    try {
      await handlers["analysis.blame"]({
        course: createMockCourse(),
        repositoryRelativePath: "test-repo",
        config: {},
        personDbBaseline: { persons: [], identityIndex: new Map() },
        files: ["src/main.ts"],
        asOfCommit: "abc123",
      })
      assert.fail("Should have thrown provider error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "provider")
    }
  })
})

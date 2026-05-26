import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  AnalysisProgress,
  AnalysisRunInput,
  AppError,
} from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import type { GitCommandPort } from "@repo-edu/host-runtime-contract"
import { createAnalysisWorkflowHandlers } from "../analysis-workflows/analysis-workflows.js"
import { COMMIT_DELIMITER } from "../analysis-workflows/log-parser.js"
import {
  assertValidationError,
  createMockCourse,
  createMockGitCommandPort,
  stubFileSystem,
} from "./analysis-test-helpers.js"

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
      config: {},
    })

    assert.equal(result.authorStats.length, 0)
    assert.equal(result.fileStats.length, 0)
    assert.equal(result.authorDailyActivity.length, 0)
    assert.equal(result.resolvedAsOfOid, "abc123def456")
  })

  it("accepts absolute repository paths without course source data", async () => {
    const cwds: string[] = []
    const gitCommand: GitCommandPort = {
      cancellation: "cooperative",
      async run(request) {
        cwds.push(request.cwd ?? "")
        const args = request.args.join(" ")
        if (args.startsWith("rev-parse --git-dir")) {
          return { exitCode: 0, stdout: ".git", stderr: "", signal: null }
        }
        if (args.startsWith("rev-parse HEAD")) {
          return { exitCode: 0, stdout: "abc123", stderr: "", signal: null }
        }
        if (args.startsWith("ls-tree")) {
          return { exitCode: 0, stdout: "", stderr: "", signal: null }
        }
        return { exitCode: 0, stdout: "", stderr: "", signal: null }
      },
    }
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.run"]({
      repositoryAbsolutePath: "/tmp/repos/absolute-repo",
      config: {},
      analysisSource: { kind: "folder" },
    })

    assert.equal(result.authorStats.length, 0)
    assert.equal(result.resolvedAsOfOid, "abc123")
    assert.ok(cwds.every((cwd) => cwd === "/tmp/repos/absolute-repo"))
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
        config: {},
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
      config: {},
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
      config: {},
      analysisSource: {
        kind: "course",
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

  it("rejects relative repository paths without course source data", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    await assertValidationError(() =>
      handlers["analysis.run"]({
        repositoryRelativePath: "test-repo",
        config: {},
      } as unknown as AnalysisRunInput),
    )
  })

  it("rejects inputs that set both repository path variants", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    await assertValidationError(() =>
      handlers["analysis.run"]({
        course: createMockCourse(),
        repositoryRelativePath: "test-repo",
        repositoryAbsolutePath: "/tmp/repos/test-repo",
        config: {},
      } as unknown as AnalysisRunInput),
    )
  })

  it("rejects legacy top-level roster context", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    await assertValidationError(() =>
      handlers["analysis.run"]({
        repositoryAbsolutePath: "/tmp/repos/test-repo",
        config: {},
        rosterContext: { members: [] },
      } as unknown as AnalysisRunInput),
    )
  })

  it("rejects folder analysis source with roster context", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    await assertValidationError(() =>
      handlers["analysis.run"]({
        repositoryAbsolutePath: "/tmp/repos/test-repo",
        config: {},
        analysisSource: {
          kind: "folder",
          rosterContext: { members: [] },
        },
      } as unknown as AnalysisRunInput),
    )
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
      config: { excludeAuthors: ["alice"] },
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

  it("includes commits that touch only non-top-N files in author stats", async () => {
    // Regression: when nFiles caps the per-file scan, author/commit/insertion
    // totals must still reflect the full repo. Here the snapshot has a large
    // and a small file; nFiles=1 keeps only the large one for per-file work,
    // but every commit must still feed authorStats and authorDailyActivity.
    const gitCommand: GitCommandPort = {
      cancellation: "cooperative",
      async run(request) {
        const args = request.args.join(" ")
        if (args.startsWith("rev-parse --git-dir")) {
          return { exitCode: 0, stdout: ".git", stderr: "", signal: null }
        }
        if (args.startsWith("rev-parse HEAD")) {
          return { exitCode: 0, stdout: "abc123", stderr: "", signal: null }
        }
        if (args.startsWith("ls-tree")) {
          return {
            exitCode: 0,
            stdout: [
              "100644 blob deadbeef 500\tlarge.ts",
              "100644 blob deadbeef 100\tsmall.ts",
              "",
            ].join("\n"),
            stderr: "",
            signal: null,
          }
        }
        // Repo-wide: no `--follow` and no `--` pathspec separator.
        if (args.includes("--follow")) {
          // Per-file pass for "large.ts" only (top-1).
          return {
            exitCode: 0,
            stdout: [
              `${COMMIT_DELIMITER}`,
              "\0commitL\x001700000200\0Mira\0mira@example.com\0big",
              "\0" + "20\t0\0large.ts\0",
            ].join(""),
            stderr: "",
            signal: null,
          }
        }
        if (args.startsWith("log")) {
          // Repo-wide pass returns both commits.
          return {
            exitCode: 0,
            stdout: [
              `${COMMIT_DELIMITER}`,
              "\0commitL\x001700000200\0Mira\0mira@example.com\0big",
              "\0" + "20\t0\0large.ts\0",
              `${COMMIT_DELIMITER}`,
              "\0commitS\x001700000100\0Theo\0theo@example.com\0small",
              "\0" + "7\t0\0small.ts\0",
            ].join(""),
            stderr: "",
            signal: null,
          }
        }
        return { exitCode: 0, stdout: "", stderr: "", signal: null }
      },
    }

    const handlers = createAnalysisWorkflowHandlers({
      gitCommand,
      fileSystem: stubFileSystem,
    })

    const result = await handlers["analysis.run"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { nFiles: 1 },
    })

    // fileStats is per-file scoped: only the top-1 file is present.
    assert.equal(result.fileStats.length, 1)
    assert.equal(result.fileStats[0].path, "large.ts")

    // authorStats must include both authors despite the nFiles=1 cap.
    const names = result.authorStats.map((s) => s.canonicalName).sort()
    assert.deepEqual(names, ["Mira", "Theo"])
    const theo = result.authorStats.find((s) => s.canonicalName === "Theo")
    assert.ok(theo)
    assert.equal(theo.commits, 1)
    assert.equal(theo.insertions, 7)

    // authorDailyActivity must include Theo's commit too.
    const theoActivity = result.authorDailyActivity.filter(
      (row) => row.personId === theo.personId,
    )
    assert.equal(theoActivity.length, 1)
    assert.equal(theoActivity[0].insertions, 7)
  })
})

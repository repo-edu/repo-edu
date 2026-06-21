import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  AnalysisBlameInput,
  AppError,
} from "@repo-edu/application-contract"
import { isAppError } from "@repo-edu/application-contract"
import type { GitCommandPort } from "@repo-edu/host-runtime-contract"
import { createAnalysisWorkflowHandlers } from "../analysis-workflows/analysis-workflows.js"
import {
  assertValidationError,
  createMockCourse,
  createMockGitCommandPort,
  emptyPersonDb,
  stubFileSystem,
} from "./analysis-test-helpers.js"

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
      snapshotCommitOid: "abc123",
    })

    assert.equal(result.fileBlames.length, 0)
    assert.equal(result.authorSummaries.length, 0)
    assert.deepEqual(result.delta.newPersons, [])
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
        if (args.startsWith("rev-parse --verify")) {
          return {
            exitCode: 0,
            stdout: "resolved-oid",
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

    const result = await handlers["analysis.blame"]({
      repositoryAbsolutePath: "/tmp/repos/absolute-repo",
      config: {},
      personDbBaseline: emptyPersonDb(),
      files: [],
      snapshotCommitOid: "abc123",
    })

    assert.equal(result.fileBlames.length, 0)
    assert.ok(cwds.every((cwd) => cwd === "/tmp/repos/absolute-repo"))
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
          snapshotCommitOid: "abc123",
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
      snapshotCommitOid: "abc123",
    })

    assert.equal(result.fileBlames.length, 1)
    assert.equal(result.fileBlames[0].lines.length, 2)
    assert.equal(result.authorSummaries.length, 1)
    assert.equal(result.authorSummaries[0].canonicalName, "Alice")
    assert.equal(result.authorSummaries[0].lines, 2)
    assert.equal(result.authorSummaries[0].linesPercent, 100)
  })

  it("aggregates blame author summaries by merged PersonDB identity", async () => {
    const blameOutput = [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa 1 1 1",
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
      "\tconst a = 1",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb 2 2 1",
      "author Alice S.",
      "author-mail <alice@example.com>",
      "author-time 1700000001",
      "author-tz +0000",
      "committer Alice S.",
      "committer-mail <alice@example.com>",
      "committer-time 1700000001",
      "committer-tz +0000",
      "summary Alias",
      "filename src/main.ts",
      "\tconst b = 2",
      "cccccccccccccccccccccccccccccccccccccccc 3 3 1",
      "author Bob Jones",
      "author-mail <bob@example.com>",
      "author-time 1700000002",
      "author-tz +0000",
      "committer Bob Jones",
      "committer-mail <bob@example.com>",
      "committer-time 1700000002",
      "committer-tz +0000",
      "summary Other",
      "filename src/main.ts",
      "\tconst c = 3",
      "dddddddddddddddddddddddddddddddddddddddd 4 4 1",
      "author Bob   Jones",
      "author-mail <robert@example.com>",
      "author-time 1700000003",
      "author-tz +0000",
      "committer Bob   Jones",
      "committer-mail <robert@example.com>",
      "committer-time 1700000003",
      "committer-tz +0000",
      "summary Name alias",
      "filename src/main.ts",
      "\tconst d = 4",
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
      config: {},
      personDbBaseline: emptyPersonDb(),
      files: ["src/main.ts"],
      snapshotCommitOid: "abc123",
    })

    assert.equal(result.authorSummaries.length, 2)
    const byName = new Map(
      result.authorSummaries.map((summary) => [summary.canonicalName, summary]),
    )
    assert.equal(byName.get("Alice")?.lines, 2)
    assert.equal(byName.get("Bob Jones")?.lines, 2)
    assert.deepEqual(
      result.authorSummaries.map((summary) => summary.linesPercent).sort(),
      [50, 50],
    )
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
      snapshotCommitOid: "abc123",
    })

    assert.equal(result.fileBlames.length, 1)
    assert.equal(result.fileBlames[0].lines.length, 2)
    assert.equal(result.authorSummaries.length, 1)
    assert.equal(result.authorSummaries[0].canonicalName, "Bob")
    assert.equal(result.authorSummaries[0].lines, 1)
    assert.equal(result.authorSummaries[0].linesPercent, 100)
  })

  it("rejects invalid snapshotCommitOid", async () => {
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
        snapshotCommitOid: "missing-sha",
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
        snapshotCommitOid: "abc123",
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
      handlers["analysis.blame"]({
        repositoryRelativePath: "test-repo",
        config: {},
        personDbBaseline: emptyPersonDb(),
        files: ["src/main.ts"],
        snapshotCommitOid: "abc123",
      } as unknown as AnalysisBlameInput),
    )
  })

  it("rejects inputs that set both repository path variants", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    await assertValidationError(() =>
      handlers["analysis.blame"]({
        course: createMockCourse(),
        repositoryRelativePath: "test-repo",
        repositoryAbsolutePath: "/tmp/repos/test-repo",
        config: {},
        personDbBaseline: emptyPersonDb(),
        files: ["src/main.ts"],
        snapshotCommitOid: "abc123",
      } as unknown as AnalysisBlameInput),
    )
  })

  it("rejects top-level roster context and analysis source enrichment", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({}),
      fileSystem: stubFileSystem,
    })

    await assertValidationError(() =>
      handlers["analysis.blame"]({
        repositoryAbsolutePath: "/tmp/repos/test-repo",
        config: {},
        personDbBaseline: emptyPersonDb(),
        files: ["src/main.ts"],
        snapshotCommitOid: "abc123",
        rosterContext: { members: [] },
      } as unknown as AnalysisBlameInput),
    )
    await assertValidationError(() =>
      handlers["analysis.blame"]({
        repositoryAbsolutePath: "/tmp/repos/test-repo",
        config: {},
        personDbBaseline: emptyPersonDb(),
        files: ["src/main.ts"],
        snapshotCommitOid: "abc123",
        analysisSource: { kind: "folder" },
      } as unknown as AnalysisBlameInput),
    )
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
      snapshotCommitOid: "abc123",
    })

    assert.equal(result.fileBlames.length, 1)
    assert.equal(result.fileBlames[0].path, "main.ts")
  })

  it("resolves subfolder display paths as paths inside that subfolder", async () => {
    const oid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const blameOutput = [
      `${oid} 1 1 1`,
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "summary Nested",
      "filename src/src/main.ts",
      "\tconst nested = true",
    ].join("\n")
    const blameArgs: string[][] = []
    const gitCommand: GitCommandPort = {
      cancellation: "cooperative",
      async run(request) {
        if (request.args[0] === "rev-parse") {
          return request.args.includes("--git-dir")
            ? { exitCode: 0, stdout: ".git", stderr: "", signal: null }
            : {
                exitCode: 0,
                stdout: "resolved-oid",
                stderr: "",
                signal: null,
              }
        }
        if (request.args[0] === "blame") {
          blameArgs.push(request.args)
          return request.args.at(-1) === "src/src/main.ts"
            ? { exitCode: 0, stdout: blameOutput, stderr: "", signal: null }
            : {
                exitCode: 1,
                stdout: "",
                stderr: "unexpected path",
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

    const result = await handlers["analysis.blame"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      config: { subfolder: "src" },
      personDbBaseline: emptyPersonDb(),
      files: ["src/main.ts"],
      snapshotCommitOid: "abc123",
    })

    assert.deepEqual(
      blameArgs.map((args) => args.at(-1)),
      ["src/src/main.ts"],
    )
    assert.equal(result.fileBlames.length, 1)
    assert.equal(result.fileBlames[0].path, "src/main.ts")
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
      snapshotCommitOid: "abc123",
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
        snapshotCommitOid: "abc123",
      })
      assert.fail("Should have thrown provider error")
    } catch (error) {
      assert.ok(isAppError(error))
      assert.equal((error as AppError).type, "provider")
    }
  })
})

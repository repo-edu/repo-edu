import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createAnalysisWorkflowHandlers } from "../analysis-workflows/analysis-workflows.js"
import {
  createMockCourse,
  createMockGitCommandPort,
  stubFileSystem,
} from "./analysis-test-helpers.js"

describe("analysis.resolveSnapshotHead handler", () => {
  it("resolves an explicit commit reference", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-parse --verify": {
          exitCode: 0,
          stdout: "explicit-oid-resolved",
          stderr: "",
        },
      }),
      fileSystem: stubFileSystem,
    })

    const oid = await handlers["analysis.resolveSnapshotHead"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      asOfCommit: "v1.0",
    })

    assert.equal(oid, "explicit-oid-resolved")
  })

  it("uses the latest commit before until when one exists", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-list -1": {
          exitCode: 0,
          stdout: "until-oid",
          stderr: "",
        },
      }),
      fileSystem: stubFileSystem,
    })

    const oid = await handlers["analysis.resolveSnapshotHead"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      until: "2026-12-31",
    })

    assert.equal(oid, "until-oid")
  })

  it("falls back to HEAD when until finds no commit", async () => {
    const handlers = createAnalysisWorkflowHandlers({
      gitCommand: createMockGitCommandPort({
        "rev-parse --git-dir": { exitCode: 0, stdout: ".git", stderr: "" },
        "rev-list -1": { exitCode: 0, stdout: "", stderr: "" },
        "rev-parse HEAD": { exitCode: 0, stdout: "head-oid", stderr: "" },
      }),
      fileSystem: stubFileSystem,
    })

    const oid = await handlers["analysis.resolveSnapshotHead"]({
      course: createMockCourse(),
      repositoryRelativePath: "test-repo",
      until: "2020-01-01",
    })

    assert.equal(oid, "head-oid")
  })
})

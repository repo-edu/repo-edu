import assert from "node:assert/strict"
import { posix, win32 } from "node:path"
import { describe, it } from "node:test"
import type { AppError } from "@repo-edu/application-contract"
import { resolveAnalysisRepoRoot } from "../analysis-workflows/repo-root.js"

describe("analysis repository root", () => {
  it("joins POSIX course roots with admitted repository paths", () => {
    assert.equal(
      resolveAnalysisRepoRoot(
        {
          course: { repositoryCloneTargetDirectory: "/srv/courses" },
          repositoryRelativePath: "group/repository",
        },
        posix,
      ),
      "/srv/courses/group/repository",
    )
  })

  it("joins Windows course roots with admitted repository paths", () => {
    assert.equal(
      resolveAnalysisRepoRoot(
        {
          course: {
            repositoryCloneTargetDirectory: "C:\\Courses\\Repositories",
          },
          repositoryRelativePath: "group/repository",
        },
        win32,
      ),
      "C:\\Courses\\Repositories\\group\\repository",
    )
  })

  it("uses the selected host path vocabulary for absolute roots", () => {
    assert.equal(
      resolveAnalysisRepoRoot(
        { repositoryAbsolutePath: "C:\\Courses\\repo" },
        win32,
      ),
      "C:\\Courses\\repo",
    )
    assert.throws(
      () =>
        resolveAnalysisRepoRoot(
          { repositoryAbsolutePath: "C:\\Courses\\repo" },
          posix,
        ),
      (error) => (error as AppError).type === "validation",
    )
  })
})

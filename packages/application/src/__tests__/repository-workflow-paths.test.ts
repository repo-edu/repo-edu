import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { join, posix, win32 } from "node:path"
import { describe, it } from "node:test"
import type { PlannedRepositoryGroup } from "@repo-edu/domain/types"
import {
  findRepositoryClonePathCollisions,
  normalizeTargetDirectory,
  repositoryCloneLeafPath,
  repositoryClonePath,
  repositoryPathSegment,
} from "../repository-workflows/paths.js"

const plannedGroup: PlannedRepositoryGroup = {
  assignmentId: "a_0001",
  assignmentName: "Assignment 1",
  groupId: "g_0001",
  groupName: "Team 1",
  repoName: "assignment-1-team-1",
  activeMemberIds: [],
  gitUsernames: [],
  isRecorded: false,
}
const safeRepositoriesPath = join(tmpdir(), "repo-edu-safe-repositories")

describe("normalizeTargetDirectory", () => {
  it("rejects empty input", () => {
    assert.equal(
      normalizeTargetDirectory(undefined, "/home/teacher", posix),
      null,
    )
    assert.equal(normalizeTargetDirectory("   ", "/home/teacher", posix), null)
  })

  it("expands a leading tilde with the POSIX home directory", () => {
    assert.equal(
      normalizeTargetDirectory("~/x2021", "/Users/teacher", posix),
      "/Users/teacher/x2021",
    )
    assert.equal(
      normalizeTargetDirectory("~", "/Users/teacher", posix),
      "/Users/teacher",
    )
  })

  it("expands a leading tilde with the Windows home directory", () => {
    assert.equal(
      normalizeTargetDirectory("~\\repos", "C:\\Users\\teacher", win32),
      "C:\\Users\\teacher\\repos",
    )
  })

  it("keeps non-leading-tilde names untouched", () => {
    assert.equal(
      normalizeTargetDirectory("~other/x2021", "/Users/teacher", posix),
      null,
    )
  })

  it("rejects relative paths", () => {
    assert.equal(
      normalizeTargetDirectory("repos", "/home/teacher", posix),
      null,
    )
    assert.equal(
      normalizeTargetDirectory("./repos", "/home/teacher", posix),
      null,
    )
    assert.equal(
      normalizeTargetDirectory("../repos", "/home/teacher", posix),
      null,
    )
  })

  it("accepts absolute paths", () => {
    assert.equal(
      normalizeTargetDirectory("/work/repos", "/home/teacher", posix),
      "/work/repos",
    )
    assert.equal(
      normalizeTargetDirectory(
        "C:\\Users\\teacher\\repos",
        "C:\\Users\\teacher",
        win32,
      ),
      "C:\\Users\\teacher\\repos",
    )
  })
})

describe("repository clone paths", () => {
  it("normalizes local names with cross-platform filename rules", () => {
    assert.equal(repositoryPathSegment("../team"), "_team")
    assert.equal(repositoryPathSegment("CON"), "CON_")
    assert.equal(repositoryPathSegment("team. "), "team")
  })

  it("keeps clone paths beneath their selected target", () => {
    const traversalName = { ...plannedGroup, groupName: ".." }

    assert.equal(
      repositoryClonePath(safeRepositoriesPath, "by-team", traversalName),
      join(safeRepositoriesPath, "_", "assignment-1-team-1"),
    )
    assert.equal(
      repositoryCloneLeafPath(safeRepositoriesPath, "../repository"),
      join(safeRepositoriesPath, "_repository"),
    )
  })

  it("finds clone targets that collide after portable path normalization", () => {
    const collisions = findRepositoryClonePathCollisions([
      {
        path: repositoryCloneLeafPath(safeRepositoriesPath, "CON"),
        label: "reserved-name",
      },
      {
        path: repositoryCloneLeafPath(safeRepositoriesPath, "CON_"),
        label: "literal-name",
      },
      { path: join(safeRepositoriesPath, "Team"), label: "upper-case" },
      { path: join(safeRepositoriesPath, "team"), label: "lower-case" },
      { path: join(safeRepositoriesPath, "other"), label: "unique" },
    ])

    assert.deepEqual(collisions, [
      {
        path: join(safeRepositoriesPath, "CON_"),
        labels: ["reserved-name", "literal-name"],
      },
      {
        path: join(safeRepositoriesPath, "Team"),
        labels: ["upper-case", "lower-case"],
      },
    ])
  })
})

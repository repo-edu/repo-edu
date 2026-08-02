import assert from "node:assert/strict"
import { posix, win32 } from "node:path"
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
      repositoryClonePath("/safe/repos", "by-team", traversalName),
      "/safe/repos/_/assignment-1-team-1",
    )
    assert.equal(
      repositoryCloneLeafPath("/safe/repos", "../repository"),
      "/safe/repos/_repository",
    )
  })

  it("finds clone targets that collide after portable path normalization", () => {
    const collisions = findRepositoryClonePathCollisions([
      {
        path: repositoryCloneLeafPath("/safe/repos", "CON"),
        label: "reserved-name",
      },
      {
        path: repositoryCloneLeafPath("/safe/repos", "CON_"),
        label: "literal-name",
      },
      { path: "/safe/repos/Team", label: "upper-case" },
      { path: "/safe/repos/team", label: "lower-case" },
      { path: "/safe/repos/other", label: "unique" },
    ])

    assert.deepEqual(collisions, [
      {
        path: "/safe/repos/CON_",
        labels: ["reserved-name", "literal-name"],
      },
      {
        path: "/safe/repos/Team",
        labels: ["upper-case", "lower-case"],
      },
    ])
  })
})

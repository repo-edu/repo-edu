import assert from "node:assert/strict"
import { it } from "node:test"
import { defaultAppCredentials } from "@repo-edu/domain/settings"
import { createBlankCourse } from "@repo-edu/domain/types"
import { composeCourseCommandTransition } from "../course-command-transition.js"

it("merges recorded repositories against the captured group membership and retains unrelated course values", () => {
  const course = createBlankCourse("course", "2026-09-07T00:00:00.000Z", {
    backing: "repobee",
    displayName: "Course",
  })
  course.roster.groupSets = [
    {
      id: "set",
      name: "Teams",
      nameMode: "unnamed",
      connection: null,
      teams: [{ id: "team", gitUsernames: ["student"] }],
      repoNameTemplate: null,
      columnVisibility: {},
      columnSizing: {},
    },
  ]
  course.roster.assignments = [
    {
      id: "assignment",
      name: "Assignment",
      groupSetId: "set",
      repositories: { team: "old", removed: "stale" },
    },
    {
      id: "other",
      name: "Other",
      groupSetId: "set",
      repositories: { team: "unrelated" },
    },
  ]
  const before = structuredClone(course)
  const result = {
    repositoriesPlanned: 2,
    repositoriesCreated: 1,
    repositoriesAdopted: 0,
    repositoriesFailed: 1,
    templateCommitShas: { assignment: "sha" },
    recordedRepositories: { assignment: { team: "new", foreign: "excluded" } },
    completedAt: "2026-09-07T01:00:00.000Z",
  }
  const next = composeCourseCommandTransition(
    "repo.create",
    {
      course,
      credentials: defaultAppCredentials,
      assignmentId: "assignment",
      template: null,
    },
    result,
  )
  const [changed] = next.roster.assignments
  assert.ok(changed)
  assert.deepEqual(changed.repositories, { team: "new" })
  assert.equal(changed.templateCommitSha, "sha")
  assert.deepEqual(next.roster.assignments[1], before.roster.assignments[1])
  assert.deepEqual(next.analysisInputs, before.analysisInputs)
  assert.deepEqual(course, before)
  changed.repositories.team = "later edit"
  assert.equal(result.recordedRepositories.assignment.team, "new")
})

it("refuses a full import result for a different course or revision", () => {
  const course = createBlankCourse("course", "2026-09-07T00:00:00.000Z", {
    backing: "lms",
    displayName: "Course",
  })
  const input = {
    course,
    file: {
      kind: "user-file-ref" as const,
      referenceId: "file",
      displayName: "groups.csv",
      mediaType: null,
      byteLength: null,
    },
    format: "group-set-csv" as const,
    targetGroupSetId: null,
  }
  for (const result of [
    { ...course, id: "other" },
    { ...course, revision: 10 },
  ])
    assert.throws(
      () =>
        composeCourseCommandTransition(
          "groupSet.importFromFile",
          input,
          result,
        ),
      /identity and revision/,
    )
})

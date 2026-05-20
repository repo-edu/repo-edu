import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  composeCourseFromCohort,
  type LmsCohortSource,
  type RepobeeCohortSource,
} from "../cohort-composition.js"

const lmsCohort: LmsCohortSource = {
  students: {
    m_0001: {
      name: "Alex Doe",
      email: "alex@example.edu",
      gitUsername: "alex-doe",
    },
    m_0002: {
      name: "Bea Roe",
      email: "bea@example.edu",
      gitUsername: "bea-roe",
    },
    m_0003: {
      name: "Cal Fox",
      email: "cal@example.edu",
      gitUsername: "cal-fox",
    },
  },
  staff: {
    m_0100: { name: "Prof. X", email: "x@example.edu" },
  },
  groupSets: {
    gs_0001: { name: "Shared Teams", groups: ["g_0001", "g_0002"] },
  },
  groups: {
    g_0001: { name: "One", memberIds: ["m_0001", "m_0002"] },
    g_0002: { name: "Two", memberIds: ["m_0003"] },
  },
  assignments: {
    calculator: { name: "Calculator", groupSetId: "gs_0001" },
    "huffman-encoder": { name: "Huffman Encoder", groupSetId: "gs_0001" },
  },
}

const repobeeCohort: RepobeeCohortSource = {
  teamSets: {
    ts_0001: { name: "RepoBee Teams", teams: ["ut_0001", "ut_0002"] },
  },
  teams: {
    ut_0001: {
      members: [
        {
          name: "Alex Doe",
          email: "alex@example.edu",
          gitUsername: "alex-doe",
        },
      ],
    },
    ut_0002: {
      members: [
        {
          name: "Bea Roe",
          email: "bea@example.edu",
          gitUsername: "bea-roe",
        },
      ],
    },
  },
  assignments: {
    calculator: { name: "Calculator", teamSetId: "ts_0001" },
  },
}

describe("composeCourseFromCohort", () => {
  test("projects LMS cohort data while preserving declared ordering", () => {
    const course = composeCourseFromCohort({
      profile: "lms",
      cohort: lmsCohort,
    })

    assert.equal(course.courseKind, "lms")
    assert.equal(course.lmsConnectionName, null)
    assert.equal(course.lmsCourseId, null)
    assert.deepEqual(
      course.roster.students.map((student) => student.id),
      ["m_0001", "m_0002", "m_0003"],
    )
    assert.deepEqual(
      course.roster.groupSets.map((groupSet) => groupSet.id),
      ["gs_0001"],
    )
    assert.deepEqual(
      course.roster.assignments.map((assignment) => [
        assignment.id,
        assignment.groupSetId,
        assignment.repositories,
      ]),
      [
        ["calculator", "gs_0001", {}],
        ["huffman-encoder", "gs_0001", {}],
      ],
    )
  })

  test("keeps RepoBee courses rosterless and projects username teams", () => {
    const course = composeCourseFromCohort({
      profile: "repobee",
      cohort: repobeeCohort,
    })

    assert.equal(course.courseKind, "repobee")
    assert.deepEqual(course.roster.students, [])
    assert.deepEqual(course.roster.groups, [])
    assert.equal(course.roster.groupSets[0].nameMode, "unnamed")
    assert.deepEqual(
      course.roster.groupSets[0].nameMode === "unnamed"
        ? course.roster.groupSets[0].teams.map((team) => team.gitUsernames)
        : [],
      [["alex-doe"], ["bea-roe"]],
    )
    assert.deepEqual(course.roster.assignments[0].repositories, {})
  })

  test("rejects missing LMS group references with source context", () => {
    assert.throws(
      () =>
        composeCourseFromCohort({
          profile: "lms",
          cohort: {
            ...lmsCohort,
            groupSets: {
              gs_0001: { name: "Shared Teams", groups: ["g_missing"] },
            },
          },
        }),
      /lms cohort: missing group g_missing in group set gs_0001/,
    )
  })

  test("rejects duplicate LMS membership within one shared group set", () => {
    assert.throws(
      () =>
        composeCourseFromCohort({
          profile: "lms",
          cohort: {
            ...lmsCohort,
            groups: {
              ...lmsCohort.groups,
              g_0002: { name: "Two", memberIds: ["m_0001"] },
            },
          },
        }),
      /lms cohort: student m_0001 appears more than once in group set gs_0001/,
    )
  })

  test("rejects duplicate RepoBee usernames", () => {
    assert.throws(
      () =>
        composeCourseFromCohort({
          profile: "repobee",
          cohort: {
            ...repobeeCohort,
            teams: {
              ...repobeeCohort.teams,
              ut_0002: {
                members: [
                  {
                    name: "Clara Dee",
                    email: "clara@example.edu",
                    gitUsername: "alex-doe",
                  },
                ],
              },
            },
          },
        }),
      /repobee cohort: duplicate team git username: alex-doe/,
    )
  })
})

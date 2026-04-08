import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  type PersistedCourse,
  persistedCourseKind,
  type RosterMember,
} from "@repo-edu/domain/types"
import { buildAnalysisRosterContext } from "../utils/analysis-roster-context.js"

function makeMember(
  id: string,
  name: string,
  enrollmentType: RosterMember["enrollmentType"],
): RosterMember {
  return {
    id,
    name,
    email: `${id}@example.edu`,
    studentNumber: null,
    gitUsername: null,
    gitUsernameStatus: "unknown",
    status: "active",
    lmsStatus: "active",
    lmsUserId: id,
    enrollmentType,
    enrollmentDisplay: null,
    department: null,
    institution: null,
    source: "test",
  }
}

function makeCourse(
  connection: PersistedCourse["roster"]["connection"],
  members: { students: RosterMember[]; staff: RosterMember[] },
): PersistedCourse {
  return {
    kind: persistedCourseKind,
    schemaVersion: 2,
    revision: 0,
    id: "course-1",
    displayName: "Course 1",
    lmsConnectionName: connection ? "LMS" : null,
    gitConnectionId: "git-main",
    organization: null,
    lmsCourseId: connection ? "course-1" : null,
    idSequences: {
      nextGroupSeq: 1,
      nextGroupSetSeq: 1,
      nextMemberSeq: 1,
      nextAssignmentSeq: 1,
      nextTeamSeq: 1,
    },
    roster: {
      connection,
      students: members.students,
      staff: members.staff,
      groups: [],
      groupSets: [],
      assignments: [],
    },
    repositoryTemplate: null,
    updatedAt: "2026-04-08T00:00:00.000Z",
  }
}

describe("buildAnalysisRosterContext", () => {
  it("returns undefined for non-LMS roster connections", () => {
    const noConnection = makeCourse(null, { students: [], staff: [] })
    const imported = makeCourse(
      {
        kind: "import",
        sourceFilename: "teams.txt",
        lastUpdated: "2026-04-08T00:00:00.000Z",
      },
      { students: [makeMember("s1", "Ada", "student")], staff: [] },
    )

    assert.equal(buildAnalysisRosterContext(noConnection), undefined)
    assert.equal(buildAnalysisRosterContext(imported), undefined)
  })

  it("returns undefined when LMS roster has no members", () => {
    const emptyLms = makeCourse(
      {
        kind: "canvas",
        courseId: "c-1",
        lastUpdated: "2026-04-08T00:00:00.000Z",
      },
      { students: [], staff: [] },
    )

    assert.equal(buildAnalysisRosterContext(emptyLms), undefined)
  })

  it("returns deduplicated members for LMS roster", () => {
    const student = makeMember("s1", "Ada Lovelace", "student")
    const duplicateStaffEntry: RosterMember = {
      ...student,
      enrollmentType: "teacher",
    }
    const staff = makeMember("t1", "Grace Hopper", "teacher")
    const lmsCourse = makeCourse(
      {
        kind: "moodle",
        courseId: "m-1",
        lastUpdated: "2026-04-08T00:00:00.000Z",
      },
      {
        students: [student],
        staff: [duplicateStaffEntry, staff],
      },
    )

    const context = buildAnalysisRosterContext(lmsCourse)
    assert.ok(context)
    assert.deepEqual(
      context.members.map((member) => member.id),
      ["s1", "t1"],
    )
  })
})

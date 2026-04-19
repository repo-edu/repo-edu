import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"

export function makeCourseWithKnownValidationIssues(): PersistedCourse {
  return {
    kind: "repo-edu.course.v1",
    revision: 0,
    id: "course-1",
    displayName: "Course",
    lmsConnectionName: null,
    organization: null,
    lmsCourseId: null,
    idSequences: {
      nextGroupSeq: 3,
      nextGroupSetSeq: 2,
      nextMemberSeq: 2,
      nextAssignmentSeq: 2,
      nextTeamSeq: 1,
    },
    roster: {
      connection: null,
      students: [
        {
          id: "m_0001",
          name: "Alice Smith",
          email: "",
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
          source: "local",
        },
      ],
      staff: [],
      groups: [
        {
          id: "g_0001",
          name: "Alpha",
          memberIds: [],
          origin: "local",
          lmsGroupId: null,
        },
        {
          id: "g_0002",
          name: "Beta",
          memberIds: ["m_0001"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs_0001",
          name: "Projects",
          groupIds: ["g_0001", "g_0002"],
          connection: null,
          nameMode: "named",
          repoNameTemplate: null,
          columnVisibility: {},
          columnSizing: {},
        },
      ],
      assignments: [
        {
          id: "a1",
          name: "Project 1",
          groupSetId: "gs_0001",
          repositories: {},
        },
      ],
    },
    repositoryTemplate: null,
    searchFolder: null,
    analysisInputs: {},
    updatedAt: "2026-03-04T10:00:00Z",
  }
}

export function makeInvalidCourseWrongKind(
  base: PersistedCourse,
): PersistedCourse {
  return {
    ...base,
    kind: "wrong-kind" as PersistedCourse["kind"],
  }
}

export function makeInvalidSettingsWrongKind(
  base: PersistedAppSettings,
): PersistedAppSettings {
  return {
    ...base,
    kind: "wrong-kind" as PersistedAppSettings["kind"],
  }
}

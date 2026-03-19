import type {
  PersistedAppSettings,
  PersistedCourse,
} from "@repo-edu/domain/types"

export function makeCourseWithKnownValidationIssues(): PersistedCourse {
  return {
    kind: "repo-edu.course.v1",
    schemaVersion: 1,
    revision: 0,
    id: "course-1",
    displayName: "Course",
    lmsConnectionName: null,
    gitConnectionId: null,
    organization: null,
    lmsCourseId: null,
    roster: {
      connection: null,
      students: [
        {
          id: "s1",
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
          id: "g1",
          name: "Alpha",
          memberIds: [],
          origin: "local",
          lmsGroupId: null,
        },
        {
          id: "g2",
          name: "Beta",
          memberIds: ["s1"],
          origin: "local",
          lmsGroupId: null,
        },
      ],
      groupSets: [
        {
          id: "gs1",
          name: "Projects",
          groupIds: ["g1", "g2"],
          connection: null,
          groupSelection: {
            kind: "all",
            excludedGroupIds: [],
          },
          repoNameTemplate: null,
        },
      ],
      assignments: [
        {
          id: "a1",
          name: "Project 1",
          groupSetId: "gs1",
        },
      ],
    },
    repositoryTemplate: null,
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

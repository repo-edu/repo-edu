import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import {
  ORIGIN_LMS,
  ORIGIN_LOCAL,
  type PersistedCourse,
} from "@repo-edu/domain/types"

export const fixtureSources = ["canvas", "moodle", "file"] as const
export type FixtureSource = (typeof fixtureSources)[number]

export function isFixtureSource(
  candidate: string | null | undefined,
): candidate is FixtureSource {
  return (
    candidate !== null &&
    candidate !== undefined &&
    (fixtureSources as readonly string[]).includes(candidate)
  )
}

export function applyFixtureSourceOverlay(
  course: PersistedCourse,
  settings: PersistedAppSettings,
  source: FixtureSource,
  courseId: string,
): void {
  const now = new Date().toISOString()

  switch (source) {
    case "canvas": {
      settings.lmsConnections = [
        {
          name: "Canvas Demo",
          provider: "canvas",
          baseUrl: "https://canvas.example.edu",
          token: "demo-token",
        },
      ]
      course.lmsConnectionName = "Canvas Demo"
      course.lmsCourseId = courseId
      course.roster.connection = {
        kind: "canvas",
        courseId,
        lastUpdated: now,
      }

      let canvasGroupSetIndex = 0
      for (const groupSet of course.roster.groupSets) {
        if (groupSet.connection?.kind === "system") continue
        canvasGroupSetIndex += 1
        groupSet.connection = {
          kind: "canvas",
          courseId,
          groupSetId: `canvas-gs-${canvasGroupSetIndex}`,
          lastUpdated: now,
        }
      }

      let canvasGroupIndex = 0
      for (const group of course.roster.groups) {
        if (group.origin === ORIGIN_LOCAL || group.origin === ORIGIN_LMS) {
          canvasGroupIndex += 1
          group.origin = ORIGIN_LMS
          group.lmsGroupId = `canvas-g-${canvasGroupIndex}`
        }
      }
      break
    }

    case "moodle": {
      settings.lmsConnections = [
        {
          name: "Moodle Demo",
          provider: "moodle",
          baseUrl: "https://moodle.example.edu",
          token: "demo-token",
        },
      ]
      course.lmsConnectionName = "Moodle Demo"
      course.lmsCourseId = courseId
      course.roster.connection = {
        kind: "moodle",
        courseId,
        lastUpdated: now,
      }

      let moodleGroupSetIndex = 0
      for (const groupSet of course.roster.groupSets) {
        if (groupSet.connection?.kind === "system") continue
        moodleGroupSetIndex += 1
        groupSet.connection = {
          kind: "moodle",
          courseId,
          groupingId: `moodle-grouping-${moodleGroupSetIndex}`,
          lastUpdated: now,
        }
      }

      let moodleGroupIndex = 0
      for (const group of course.roster.groups) {
        if (group.origin === ORIGIN_LOCAL || group.origin === ORIGIN_LMS) {
          moodleGroupIndex += 1
          group.origin = ORIGIN_LMS
          group.lmsGroupId = `moodle-g-${moodleGroupIndex}`
        }
      }
      break
    }

    case "file": {
      settings.lmsConnections = []
      course.lmsConnectionName = null
      course.lmsCourseId = null
      course.roster.connection = {
        kind: "import",
        sourceFilename: "students.csv",
        lastUpdated: now,
      }

      for (const groupSet of course.roster.groupSets) {
        if (groupSet.connection?.kind === "system") continue
        groupSet.connection = {
          kind: "import",
          sourceFilename:
            groupSet.nameMode === "unnamed" ? "teams.txt" : "groups.csv",
          sourcePath: null,
          lastUpdated: now,
        }
      }

      for (const group of course.roster.groups) {
        if (group.origin === ORIGIN_LOCAL || group.origin === ORIGIN_LMS) {
          group.origin = ORIGIN_LOCAL
          group.lmsGroupId = null
        }
      }
      break
    }
  }
}

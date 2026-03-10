import type { PersistedAppSettings, PersistedProfile } from "@repo-edu/domain"
import { ORIGIN_LMS, ORIGIN_LOCAL } from "@repo-edu/domain"

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
  profile: PersistedProfile,
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
      profile.lmsConnectionName = "Canvas Demo"
      profile.courseId = courseId
      profile.roster.connection = {
        kind: "canvas",
        courseId,
        lastUpdated: now,
      }

      let canvasGroupSetIndex = 0
      for (const groupSet of profile.roster.groupSets) {
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
      for (const group of profile.roster.groups) {
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
      profile.lmsConnectionName = "Moodle Demo"
      profile.courseId = courseId
      profile.roster.connection = {
        kind: "moodle",
        courseId,
        lastUpdated: now,
      }

      let moodleGroupSetIndex = 0
      for (const groupSet of profile.roster.groupSets) {
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
      for (const group of profile.roster.groups) {
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
      profile.lmsConnectionName = null
      profile.courseId = null
      profile.roster.connection = {
        kind: "import",
        sourceFilename: "students.csv",
        lastUpdated: now,
      }

      for (const groupSet of profile.roster.groupSets) {
        if (groupSet.connection?.kind === "system") continue
        groupSet.connection = {
          kind: "import",
          sourceFilename: "groups.csv",
          sourcePath: null,
          lastUpdated: now,
        }
      }

      for (const group of profile.roster.groups) {
        if (group.origin === ORIGIN_LOCAL || group.origin === ORIGIN_LMS) {
          group.origin = ORIGIN_LOCAL
          group.lmsGroupId = null
        }
      }
      break
    }
  }
}

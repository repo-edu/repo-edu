import type { WorkflowClient } from "@repo-edu/application-contract"
import type { PersistedAppSettings } from "@repo-edu/domain/settings"
import type { Assignment, PersistedCourse } from "@repo-edu/domain/types"
import type { Command } from "commander"

export function emitCommandError(message: string): void {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message
  }

  return String(error)
}

export function resolveRequestedCourseId(
  command: Command,
  fallbackActiveCourseId: string | null,
): string | null {
  const options = command.optsWithGlobals() as { course?: unknown }
  if (typeof options.course === "string" && options.course.length > 0) {
    return options.course
  }

  return fallbackActiveCourseId
}

export async function loadSelectedCourse(
  command: Command,
  workflowClient: WorkflowClient,
): Promise<{
  selectedCourseId: string
  settings: PersistedAppSettings
  course: PersistedCourse
}> {
  const settings = await workflowClient.run("settings.loadApp", undefined)
  const selectedCourseId = resolveRequestedCourseId(
    command,
    settings.activeCourseId,
  )

  if (selectedCourseId === null) {
    throw new Error(
      "No active course. Use --course <id> or `redu course load <id>`.",
    )
  }

  const course = await workflowClient.run("course.load", {
    courseId: selectedCourseId,
  })

  return {
    selectedCourseId,
    settings,
    course,
  }
}

export function resolveAssignmentFromCourse(
  course: PersistedCourse,
  assignmentKey: string,
): Assignment | null {
  const normalized = assignmentKey.trim().toLowerCase()

  return (
    course.roster.assignments.find(
      (assignment) =>
        assignment.id.toLowerCase() === normalized ||
        assignment.name.toLowerCase() === normalized,
    ) ?? null
  )
}

export function requireLmsConnection(
  course: PersistedCourse,
  settings: PersistedAppSettings,
) {
  if (course.lmsConnectionName === null) {
    throw new Error("Selected course does not reference an LMS connection.")
  }

  const connection = settings.lmsConnections.find(
    (candidate) => candidate.name === course.lmsConnectionName,
  )

  if (!connection) {
    throw new Error(
      `LMS connection '${course.lmsConnectionName}' was not found in app settings.`,
    )
  }

  return connection
}

export function requireGitConnection(
  course: PersistedCourse,
  settings: PersistedAppSettings,
) {
  if (course.gitConnectionId === null) {
    throw new Error("Selected course does not reference a Git connection.")
  }

  const connection = settings.gitConnections.find(
    (candidate) => candidate.id === course.gitConnectionId,
  )

  if (!connection) {
    throw new Error(
      `Git connection '${course.gitConnectionId}' was not found in app settings.`,
    )
  }

  return connection
}

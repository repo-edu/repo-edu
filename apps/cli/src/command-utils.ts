import type {
  AppSettingsLoadResult,
  SettingsRecoveryEntry,
  WorkflowClient,
} from "@repo-edu/application-contract"
import {
  activeCourseIdFromSurface,
  type PersistedAppCredentials,
  resolveActiveGitConnection,
} from "@repo-edu/domain/settings"
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

function formatSettingsRecoveryWarning(entry: SettingsRecoveryEntry): string {
  if (entry.unit === "unsupported-composite") {
    return `Settings recovery: unsupported app settings were moved to ${entry.backupPath}.`
  }
  return `Settings recovery: ${entry.unit} settings were ${entry.reason}; moved to ${entry.backupPath}.`
}

export function emitSettingsRecoveryWarnings(
  recovery: readonly SettingsRecoveryEntry[],
): void {
  for (const entry of recovery) {
    process.stderr.write(`${formatSettingsRecoveryWarning(entry)}\n`)
  }
}

export async function loadAppSettings(
  workflowClient: WorkflowClient,
): Promise<AppSettingsLoadResult> {
  const settings = await workflowClient.run("settings.loadApp", undefined)
  emitSettingsRecoveryWarnings(settings.recovery)
  return settings
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
  settings: AppSettingsLoadResult
  course: PersistedCourse
}> {
  const settings = await loadAppSettings(workflowClient)
  const selectedCourseId = resolveRequestedCourseId(
    command,
    activeCourseIdFromSurface(settings.preferences.activeSurface),
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
  credentials: PersistedAppCredentials,
) {
  if (course.lmsConnectionId === null) {
    throw new Error("Selected course does not reference an LMS connection.")
  }

  const connection = credentials.lmsConnections.find(
    (candidate) => candidate.id === course.lmsConnectionId,
  )

  if (!connection) {
    throw new Error(
      `LMS connection '${course.lmsConnectionId}' was not found in app settings.`,
    )
  }

  return connection
}

export function requireGitConnection(credentials: PersistedAppCredentials) {
  const connection = resolveActiveGitConnection(credentials)
  if (connection === null) {
    throw new Error("No Git connection is configured in settings.")
  }
  return connection
}

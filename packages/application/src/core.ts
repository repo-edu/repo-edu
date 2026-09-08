import type {
  AppError,
  AppValidationIssue,
  SettingsRecoveryEntry,
} from "@repo-edu/application-contract"
import { packageId as contractPackageId } from "@repo-edu/application-contract"
import type {
  PersistedAppCredentials,
  PersistedAppPreferences,
} from "@repo-edu/domain/settings"
import {
  packageId as domainPackageId,
  type GitIdentityMode,
  type PersistedCourse,
  type RosterValidationResult,
} from "@repo-edu/domain/types"
import {
  validateAssignment,
  validateAssignmentWithTemplate,
  validateRoster,
} from "@repo-edu/domain/validation"
import { packageId as hostRuntimePackageId } from "@repo-edu/host-runtime-contract"
import { packageId as gitContractPackageId } from "@repo-edu/integrations-git-contract"
import { packageId as lmsContractPackageId } from "@repo-edu/integrations-lms-contract"

export const packageId = "@repo-edu/application"
export const workspaceDependencies = [
  contractPackageId,
  domainPackageId,
  hostRuntimePackageId,
  gitContractPackageId,
  lmsContractPackageId,
] as const

export type { CourseStore } from "./course-store.js"

function formatSettingsRecoveryLoadMessage(
  recovery: readonly SettingsRecoveryEntry[],
  cause: unknown,
): string {
  const causeMessage = cause instanceof Error ? cause.message : String(cause)
  const recovered = recovery
    .map((entry) => `${entry.unit} ${entry.reason}: ${entry.backupPath}`)
    .join("; ")
  return `${causeMessage} Settings recovery already completed: ${recovered}.`
}

/**
 * Thrown when one or more units were already backed aside but a later section
 * read failed. The load is terminal for its host, so the backup paths travel
 * in the message: the renamed files will not re-report on the next load.
 */
export function createSettingsRecoveryLoadError(
  recovery: readonly SettingsRecoveryEntry[],
  cause: unknown,
): Error {
  return new Error(formatSettingsRecoveryLoadMessage(recovery, cause), {
    cause,
  })
}

export type SettingsSectionLoadResult<T> = {
  value: T | null
  recovery: SettingsRecoveryEntry[]
}

export type SectionStore<T> = {
  load(
    signal?: AbortSignal,
  ): Promise<SettingsSectionLoadResult<T>> | SettingsSectionLoadResult<T>
  save(section: T, signal?: AbortSignal): Promise<void> | void
}

export type AppSettingsLoader = {
  credentials: Pick<SectionStore<PersistedAppCredentials>, "load">
  preferences: Pick<SectionStore<PersistedAppPreferences>, "load">
}

export type AppSettingsStore = AppSettingsLoader & {
  credentials: SectionStore<PersistedAppCredentials>
  preferences: SectionStore<PersistedAppPreferences>
}

export function createValidationAppError(
  message: string,
  issues: AppValidationIssue[],
): AppError {
  return {
    type: "validation",
    message,
    issues,
  }
}

export function runValidateRosterForCourse(
  course: PersistedCourse,
): RosterValidationResult {
  return validateRoster(course.roster)
}

export function runValidateAssignmentForCourse(
  course: PersistedCourse,
  assignmentId: string,
  options?: {
    identityMode?: GitIdentityMode
    repoNameTemplate?: string
  },
): RosterValidationResult {
  if (options?.repoNameTemplate !== undefined) {
    return validateAssignmentWithTemplate(
      course.roster,
      assignmentId,
      options.identityMode ?? "username",
      options.repoNameTemplate,
    )
  }

  return validateAssignment(
    course.roster,
    assignmentId,
    options?.identityMode ?? "username",
  )
}

import type {
  AppError,
  AppValidationIssue,
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

export type SettingsRecoveryUnit =
  | "credentials"
  | "preferences"
  | "unsupported-composite"
export type SettingsRecoveryReason = "invalid" | "unparseable" | "unsupported"

export type SettingsRecoveryEntry = {
  unit: SettingsRecoveryUnit
  reason: SettingsRecoveryReason
  backupPath: string
}

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
 * Thrown by the settings load path when one or more units were backed aside
 * (durable, already-applied recovery) but a later section read then failed.
 * The completed recovery is carried structurally, not just in the message, so
 * a caller that retries can surface it once a load succeeds. The renamed
 * backup files will not re-report on the next load, so this is the only place
 * those entries survive a failed attempt.
 */
export class SettingsRecoveryLoadError extends Error {
  readonly recovery: SettingsRecoveryEntry[]
  override readonly cause: unknown

  constructor(recovery: readonly SettingsRecoveryEntry[], cause: unknown) {
    super(formatSettingsRecoveryLoadMessage(recovery, cause))
    this.name = "SettingsRecoveryLoadError"
    this.recovery = [...recovery]
    this.cause = cause
  }
}

export function isSettingsRecoveryLoadError(
  value: unknown,
): value is SettingsRecoveryLoadError {
  return (
    value instanceof SettingsRecoveryLoadError ||
    (typeof value === "object" &&
      value !== null &&
      "name" in value &&
      value.name === "SettingsRecoveryLoadError" &&
      "recovery" in value &&
      Array.isArray((value as { recovery: unknown }).recovery))
  )
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

export type RecoverableAppSettingsLoader = AppSettingsLoader & {
  recoverUnsupportedComposite?(
    signal?: AbortSignal,
  ): Promise<SettingsRecoveryEntry[]> | SettingsRecoveryEntry[]
}

export type AppSettingsStore = RecoverableAppSettingsLoader & {
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

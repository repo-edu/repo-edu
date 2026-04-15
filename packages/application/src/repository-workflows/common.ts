import type { AppError } from "@repo-edu/application-contract"
import { normalizeGitNamespaceInput } from "@repo-edu/domain/settings"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createValidationAppError } from "../core.js"
import { isSharedAppError, toCancelledAppError } from "../workflow-helpers.js"

/**
 * Returns the API-ready namespace path for this course. The stored value may
 * be a bare path (`course-org`, `parent/sub`) or a provider URL pasted by the
 * user (`https://github.com/course-org`); both normalize to the same path.
 */
export function requireGitOrganization(
  course: PersistedCourse,
  operation: "repo.create" | "repo.clone" | "repo.update",
): string {
  const normalized =
    course.organization === null
      ? ""
      : normalizeGitNamespaceInput(course.organization)
  if (normalized === "") {
    throw createValidationAppError(
      "Course is missing organization for repository workflows.",
      [
        {
          path: "course.organization",
          message: `Set an organization before running ${operation}.`,
        },
      ],
    )
  }
  return normalized
}

export function normalizeRepositoryExecutionError(
  error: unknown,
  operation: string,
): AppError {
  if (isSharedAppError(error)) {
    return error
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return toCancelledAppError()
  }

  return {
    type: "provider",
    message: error instanceof Error ? error.message : String(error),
    provider: "git",
    operation,
    retryable: true,
  }
}

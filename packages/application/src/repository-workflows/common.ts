import type { AppError } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"
import { createValidationAppError } from "../core.js"
import { isSharedAppError, toCancelledAppError } from "../workflow-helpers.js"

export function requireGitOrganization(
  course: PersistedCourse,
  operation: "repo.create" | "repo.clone" | "repo.update",
): string {
  if (course.organization === null || course.organization.trim() === "") {
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
  return course.organization
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

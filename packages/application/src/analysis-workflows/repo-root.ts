import type { AppError } from "@repo-edu/application-contract"
import type { PersistedCourse } from "@repo-edu/domain/types"

type AnalysisRepositoryInputLike = {
  course?: Pick<PersistedCourse, "repositoryCloneTargetDirectory">
  repositoryRelativePath?: unknown
  repositoryAbsolutePath?: unknown
}

export function validationError(message: string, path: string): AppError {
  return {
    type: "validation",
    message,
    issues: [{ path, message }],
  }
}

function normalizeRepositoryRelativePath(relativePath: string): string {
  const normalized = relativePath.trim().replace(/\\/g, "/")
  if (normalized.length === 0) {
    throw validationError(
      "Repository relative path is required.",
      "repositoryRelativePath",
    )
  }

  // Reject absolute paths and path traversal.
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.startsWith("~")
  ) {
    throw validationError(
      "Repository path must be a relative path.",
      "repositoryRelativePath",
    )
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0)
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw validationError(
      "Repository path contains invalid path segments.",
      "repositoryRelativePath",
    )
  }

  return segments.join("/")
}

function normalizeAbsolutePath(absolutePath: string): string {
  const normalized = absolutePath.trim().replace(/\\/g, "/").replace(/\/+$/, "")
  if (normalized.length === 0) {
    throw validationError(
      "Repository absolute path is required.",
      "repositoryAbsolutePath",
    )
  }
  if (!normalized.startsWith("/") && !/^[a-zA-Z]:\//.test(normalized)) {
    throw validationError(
      "Repository absolute path must be an absolute path.",
      "repositoryAbsolutePath",
    )
  }
  return normalized
}

export function resolveAnalysisRepoRoot(
  input: AnalysisRepositoryInputLike,
): string {
  const hasRelative = input.repositoryRelativePath !== undefined
  const hasAbsolute = input.repositoryAbsolutePath !== undefined

  if (hasRelative && hasAbsolute) {
    throw validationError(
      "Only one repository path variant may be provided.",
      "repositoryRelativePath",
    )
  }

  if (hasAbsolute) {
    if (input.course !== undefined) {
      throw validationError(
        "Absolute repository paths must not include course repository source data.",
        "course",
      )
    }
    if (typeof input.repositoryAbsolutePath !== "string") {
      throw validationError(
        "Repository absolute path must be a string.",
        "repositoryAbsolutePath",
      )
    }
    return normalizeAbsolutePath(input.repositoryAbsolutePath)
  }

  if (!hasRelative) {
    throw validationError(
      "Either repositoryRelativePath or repositoryAbsolutePath is required.",
      "repositoryRelativePath",
    )
  }
  if (typeof input.repositoryRelativePath !== "string") {
    throw validationError(
      "Repository relative path must be a string.",
      "repositoryRelativePath",
    )
  }
  if (
    typeof input.course !== "object" ||
    input.course === null ||
    Array.isArray(input.course)
  ) {
    throw validationError(
      "Relative repository paths require course repository source data.",
      "course",
    )
  }

  const cloneTarget = input.course.repositoryCloneTargetDirectory
  if (cloneTarget !== undefined && cloneTarget !== null) {
    if (typeof cloneTarget !== "string") {
      throw validationError(
        "Course repository clone target directory must be a string.",
        "course.repositoryCloneTargetDirectory",
      )
    }
  }
  if (!cloneTarget) {
    throw validationError(
      "Course does not have a repository clone target directory configured.",
      "course.repositoryCloneTargetDirectory",
    )
  }

  const normalizedCloneTarget = cloneTarget
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
  if (normalizedCloneTarget.length === 0) {
    throw validationError(
      "Course repository clone target directory is invalid.",
      "course.repositoryCloneTargetDirectory",
    )
  }

  const relativePath = normalizeRepositoryRelativePath(
    input.repositoryRelativePath,
  )
  return `${normalizedCloneTarget}/${relativePath}`
}

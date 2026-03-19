import type { RepositoryBatchInput } from "@repo-edu/application-contract"
import type { PlannedRepositoryGroup } from "@repo-edu/domain"

export type RepositoryDirectoryLayout = "flat" | "by-team" | "by-task"

export function normalizeDirectoryLayout(
  value: RepositoryBatchInput["directoryLayout"],
): RepositoryDirectoryLayout {
  if (value === "by-team" || value === "by-task") {
    return value
  }
  return "flat"
}

export function normalizeTargetDirectory(value: string | undefined): string {
  const normalized = value?.trim()
  return normalized === undefined || normalized === "" ? "." : normalized
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    return "unnamed"
  }
  return trimmed.replace(/[\\/]/g, "_")
}

function joinPath(base: string, segment: string): string {
  const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/"
  const normalizedBase = base.replace(/[\\/]+$/g, "")
  const normalizedSegment = segment.replace(/^[\\/]+/g, "")
  if (normalizedBase === "") {
    return normalizedSegment
  }
  return `${normalizedBase}${separator}${normalizedSegment}`
}

export function repositoryCloneParentPath(
  targetDirectory: string,
  layout: RepositoryDirectoryLayout,
  group: PlannedRepositoryGroup,
): string {
  if (layout === "flat") {
    return targetDirectory
  }

  const folderName =
    layout === "by-team"
      ? sanitizePathSegment(group.groupName)
      : sanitizePathSegment(group.assignmentName)
  return joinPath(targetDirectory, folderName)
}

export function repositoryClonePath(
  targetDirectory: string,
  layout: RepositoryDirectoryLayout,
  group: PlannedRepositoryGroup,
): string {
  return joinPath(
    repositoryCloneParentPath(targetDirectory, layout, group),
    sanitizePathSegment(group.repoName),
  )
}

const TEMP_CLONE_DIRECTORY_NAME = ".repo-edu-clone-tmp"

export function repositoryCloneTempRoot(targetDirectory: string): string {
  return joinPath(targetDirectory, TEMP_CLONE_DIRECTORY_NAME)
}

export function repositoryCloneTempPath(
  tempRoot: string,
  repoName: string,
  index: number,
): string {
  return joinPath(tempRoot, `${sanitizePathSegment(repoName)}-${index}`)
}

import { homedir } from "node:os"
import * as path from "node:path"
import type { RepositoryBatchInput } from "@repo-edu/application-contract"
import type { PlannedRepositoryGroup } from "@repo-edu/domain/types"
import filenamify from "filenamify"

export type RepositoryDirectoryLayout = "flat" | "by-team" | "by-task"
type PathOperations = Pick<typeof path, "isAbsolute" | "join">

export function normalizeDirectoryLayout(
  value: RepositoryBatchInput["directoryLayout"],
): RepositoryDirectoryLayout {
  if (value === "by-team" || value === "by-task") {
    return value
  }
  return "flat"
}

export function normalizeTargetDirectory(
  value: string | undefined,
  homeDirectory = homedir(),
  pathOperations: PathOperations = path,
): string | null {
  const normalized = value?.trim()
  if (normalized === undefined || normalized === "") {
    return null
  }
  const expanded = expandHomeDirectory(
    normalized,
    homeDirectory,
    pathOperations,
  )
  return pathOperations.isAbsolute(expanded) ? expanded : null
}

function expandHomeDirectory(
  value: string,
  homeDirectory: string,
  pathOperations: PathOperations,
): string {
  if (value === "~") {
    return homeDirectory
  }
  if (!value.startsWith("~/") && !value.startsWith("~\\")) {
    return value
  }

  return pathOperations.join(homeDirectory, value.slice(2))
}

export function repositoryPathSegment(value: string): string {
  return filenamify(value.trim(), { replacement: "_" })
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
      ? repositoryPathSegment(
          group.groupName.trim().length > 0 ? group.groupName : group.groupId,
        )
      : repositoryPathSegment(group.assignmentName)
  return path.join(targetDirectory, folderName)
}

export function repositoryClonePath(
  targetDirectory: string,
  layout: RepositoryDirectoryLayout,
  group: PlannedRepositoryGroup,
): string {
  return path.join(
    repositoryCloneParentPath(targetDirectory, layout, group),
    repositoryPathSegment(group.repoName),
  )
}

export function repositoryCloneLeafPath(
  targetDirectory: string,
  repoName: string,
): string {
  return path.join(targetDirectory, repositoryPathSegment(repoName))
}

const TEMP_CLONE_DIRECTORY_NAME = ".repo-edu-clone-tmp"

export function repositoryCloneTempRoot(targetDirectory: string): string {
  return path.join(targetDirectory, TEMP_CLONE_DIRECTORY_NAME)
}

export function repositoryCloneTempPath(
  tempRoot: string,
  repoName: string,
  index: number,
): string {
  return path.join(tempRoot, `${repositoryPathSegment(repoName)}-${index}`)
}

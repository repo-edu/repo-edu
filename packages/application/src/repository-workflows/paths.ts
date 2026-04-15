import type { RepositoryBatchInput } from "@repo-edu/application-contract"
import type { PlannedRepositoryGroup } from "@repo-edu/domain/types"
import { isAbsolutePath, joinPath } from "../path-utils.js"

export type RepositoryDirectoryLayout = "flat" | "by-team" | "by-task"
type RuntimeEnv = {
  HOME?: string
  USERPROFILE?: string
  HOMEDRIVE?: string
  HOMEPATH?: string
}

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
  env: RuntimeEnv = resolveRuntimeEnv(),
): string | null {
  const normalized = value?.trim()
  if (normalized === undefined || normalized === "") {
    return null
  }
  const expanded = expandHomeDirectory(normalized, env)
  return isAbsolutePath(expanded) ? expanded : null
}

function resolveRuntimeEnv(): RuntimeEnv {
  if (typeof globalThis !== "object" || globalThis === null) {
    return {}
  }
  const runtime = globalThis as {
    process?: { env?: Record<string, string | undefined> }
  }
  const env = runtime.process?.env
  return env ?? {}
}

function resolveHomeDirectory(env: RuntimeEnv): string | null {
  const home = env.HOME?.trim()
  if (home) return home
  const userProfile = env.USERPROFILE?.trim()
  if (userProfile) return userProfile

  const homeDrive = env.HOMEDRIVE?.trim() ?? ""
  const homePath = env.HOMEPATH?.trim() ?? ""
  if (homeDrive !== "" && homePath !== "") {
    return `${homeDrive}${homePath}`
  }
  return null
}

function joinToHome(home: string, suffix: string): string {
  const separator = home.includes("\\") && !home.includes("/") ? "\\" : "/"
  const normalizedHome = home.replace(/[\\/]+$/g, "")
  const normalizedSuffix = suffix.replace(/^[\\/]+/g, "")
  if (normalizedSuffix === "") {
    return normalizedHome
  }
  return `${normalizedHome}${separator}${normalizedSuffix}`
}

function expandHomeDirectory(value: string, env: RuntimeEnv): string {
  if (value === "~") {
    return resolveHomeDirectory(env) ?? value
  }
  if (!value.startsWith("~/") && !value.startsWith("~\\")) {
    return value
  }

  const home = resolveHomeDirectory(env)
  if (home === null) {
    return value
  }
  return joinToHome(home, value.slice(2))
}

function sanitizePathSegment(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") {
    return "unnamed"
  }
  return trimmed.replace(/[\\/]/g, "_")
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
      ? sanitizePathSegment(
          group.groupName.trim().length > 0 ? group.groupName : group.groupId,
        )
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

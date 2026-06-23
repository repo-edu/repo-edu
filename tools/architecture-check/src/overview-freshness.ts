import type { ReconciliationResult } from "./area-model.js"
import { type GitWorktreeStatus, readGitWorktreeStatus } from "./git.js"
import { ROOT } from "./repo-paths.js"

export type ReconciliationFreshnessClaim = {
  readonly status: "fresh" | "stale"
  readonly violationCount: number
  readonly text: string
}

export type LocalGitStamp = {
  readonly status: "clean" | "dirty"
  readonly dirtyPathCount: number
  readonly untrackedPathCount: number
  readonly text: string
}

export function createReconciliationFreshnessClaim(
  reconciliation: ReconciliationResult,
): ReconciliationFreshnessClaim {
  const violationCount = reconciliation.violations.length
  if (violationCount === 0) {
    return {
      status: "fresh",
      violationCount,
      text: "Area model matches the tracked source inventory.",
    }
  }

  return {
    status: "stale",
    violationCount,
    text: `Area model is out of date for the tracked source inventory: ${violationCount} reconciliation violation(s).`,
  }
}

export function readLocalGitStamp(root = ROOT): LocalGitStamp {
  return createLocalGitStamp(readGitWorktreeStatus(root))
}

export function createLocalGitStamp(status: GitWorktreeStatus): LocalGitStamp {
  const dirtyPathCount = status.dirtyPaths.length
  const untrackedPathCount = status.untrackedPaths.length
  if (dirtyPathCount === 0 && untrackedPathCount === 0) {
    return {
      status: "clean",
      dirtyPathCount,
      untrackedPathCount,
      text: "Local worktree is clean.",
    }
  }

  const parts: string[] = []
  if (dirtyPathCount > 0) {
    parts.push(`${dirtyPathCount} dirty tracked path(s)`)
  }
  if (untrackedPathCount > 0) {
    parts.push(`${untrackedPathCount} untracked path(s)`)
  }

  return {
    status: "dirty",
    dirtyPathCount,
    untrackedPathCount,
    text: `Rendered report may not match the local worktree: ${parts.join(", ")}.`,
  }
}

import {
  type CompiledAreaModel,
  findCoverAreas,
  findPrimaryArea,
} from "./area-model.js"
import { type GitCommit, readRecentCommits } from "./git.js"
import { isSourceInventoryPath } from "./inventory.js"
import type { Violation } from "./violations.js"

const HISTORY_WINDOW = 10

export type DensityReport = {
  readonly counts: ReadonlyMap<string, number>
  readonly warnings: readonly string[]
  readonly violations: readonly Violation[]
}

export function readRedesignDensityReport(
  root: string,
  model: CompiledAreaModel,
): DensityReport {
  try {
    const commits = readRecentCommits(root, HISTORY_WINDOW + 1)
    return computeRedesignDensity(commits, model)
  } catch (error) {
    return {
      counts: new Map(),
      warnings: [],
      violations: [
        {
          file: "git history",
          message:
            error instanceof Error
              ? error.message
              : `Unable to read redesign-density history: ${String(error)}`,
        },
      ],
    }
  }
}

export function computeRedesignDensity(
  commits: readonly GitCommit[],
  model: CompiledAreaModel,
): DensityReport {
  if (commits.length < HISTORY_WINDOW + 1) {
    return {
      counts: new Map(),
      warnings: [],
      violations: [
        {
          file: "git history",
          message:
            "redesign-density requires the last 10 commits plus the parent of the oldest commit",
        },
      ],
    }
  }

  const counts = new Map<string, number>()

  for (const commit of commits.slice(0, HISTORY_WINDOW)) {
    const kind = conventionalKind(commit.subject)
    if (kind !== "redesign" && kind !== "refactor") continue

    const touchedAreas = new Set<string>()
    for (const changedPath of commit.changedPaths) {
      if (!isSourceInventoryPath(changedPath)) continue
      const primaryArea = findPrimaryArea(model, changedPath)
      if (primaryArea) touchedAreas.add(primaryArea)
      for (const coverArea of findCoverAreas(model, changedPath)) {
        touchedAreas.add(coverArea)
      }
    }

    for (const areaId of touchedAreas) {
      counts.set(areaId, (counts.get(areaId) ?? 0) + 1)
    }
  }

  return {
    counts,
    warnings: formatDensityWarnings(counts),
    violations: [],
  }
}

export function conventionalKind(subject: string): string | undefined {
  const stripped = subject.replace(/^(?:[ABCD]\d+)+:?\s+/, "")
  return stripped.match(/^([a-z]+)(?:\([^)]*\))?!?:/)?.[1]
}

function formatDensityWarnings(counts: ReadonlyMap<string, number>): string[] {
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort(([leftArea, leftCount], [rightArea, rightCount]) => {
      if (leftCount !== rightCount) return rightCount - leftCount
      return leftArea.localeCompare(rightArea)
    })
    .map(([areaId, count]) => `${areaId}: ${count}`)
}

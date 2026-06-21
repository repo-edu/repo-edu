import {
  type AreaRecord,
  type CompiledAreaModel,
  compileAreaModel,
  findCoverAreas,
  findPrimaryArea,
  matcherMatchesFile,
  parseAreaModel,
} from "./area-model.js"
import {
  type GitCommit,
  readGitFileAtCommit,
  readRecentCommits,
} from "./git.js"
import { isSourceInventoryPath } from "./inventory.js"
import type { Violation } from "./violations.js"

const HISTORY_WINDOW = 10
const AREA_MODEL_PATH = "tools/architecture-check/src/area-model.json"

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
    const snapshots = readAreaModelSnapshots(
      root,
      commits.slice(0, HISTORY_WINDOW),
    )
    return computeRedesignDensity(commits, model, snapshots)
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
  snapshots: ReadonlyMap<string, CompiledAreaModel> = new Map(),
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
  const violations: Violation[] = []
  const lineageParents = collectLineageParents(model, snapshots)

  for (const commit of commits.slice(0, HISTORY_WINDOW)) {
    const kind = conventionalKind(commit.subject)
    if (kind !== "redesign" && kind !== "refactor") continue

    const touchedAreas = new Set<string>()
    const historicalModel = snapshots.get(commit.hash)
    for (const changedPath of commit.changedPaths) {
      if (!isSourceInventoryPath(changedPath)) continue
      const attribution = attributeChangedPath(
        model,
        changedPath,
        historicalModel,
        lineageParents,
      )
      for (const areaId of attribution.areaIds) touchedAreas.add(areaId)
      violations.push(...attribution.violations)
    }

    for (const areaId of touchedAreas) {
      counts.set(areaId, (counts.get(areaId) ?? 0) + 1)
    }
  }

  return {
    counts,
    warnings: formatDensityWarnings(counts),
    violations,
  }
}

function readAreaModelSnapshots(
  root: string,
  commits: readonly GitCommit[],
): ReadonlyMap<string, CompiledAreaModel> {
  const snapshots = new Map<string, CompiledAreaModel>()
  for (const commit of commits) {
    const content = readGitFileAtCommit(root, commit.hash, AREA_MODEL_PATH)
    if (content === null) continue
    snapshots.set(
      commit.hash,
      compileAreaModel(parseAreaModel(JSON.parse(content))),
    )
  }
  return snapshots
}

function attributeChangedPath(
  currentModel: CompiledAreaModel,
  changedPath: string,
  historicalModel?: CompiledAreaModel,
  lineageParents: ReadonlyMap<string, string> = collectLineageParents(
    currentModel,
    new Map(),
  ),
): {
  readonly areaIds: readonly string[]
  readonly violations: readonly Violation[]
} {
  const areaIds = new Set<string>()
  const violations: Violation[] = []

  const currentPrimary = findPrimaryArea(currentModel, changedPath)
  if (currentPrimary) {
    areaIds.add(currentPrimary)
  } else if (historicalModel) {
    const historicalPrimary = findPrimaryArea(historicalModel, changedPath)
    if (historicalPrimary) {
      const resolved = resolveHistoricalArea(
        currentModel,
        historicalPrimary,
        "partition",
        changedPath,
        lineageParents,
      )
      for (const areaId of resolved.areaIds) areaIds.add(areaId)
      violations.push(...resolved.violations)
    }
  }

  const currentCovers = findCoverAreas(currentModel, changedPath)
  if (currentCovers.length > 0) {
    for (const areaId of currentCovers) areaIds.add(areaId)
  } else if (historicalModel) {
    for (const historicalCover of findCoverAreas(
      historicalModel,
      changedPath,
    )) {
      const resolved = resolveHistoricalArea(
        currentModel,
        historicalCover,
        "cover",
        changedPath,
        lineageParents,
      )
      for (const areaId of resolved.areaIds) areaIds.add(areaId)
      violations.push(...resolved.violations)
    }
  }

  return { areaIds: [...areaIds], violations }
}

function resolveHistoricalArea(
  currentModel: CompiledAreaModel,
  historicalAreaId: string,
  kind: AreaRecord["kind"],
  changedPath: string,
  lineageParents: ReadonlyMap<string, string>,
): {
  readonly areaIds: readonly string[]
  readonly violations: readonly Violation[]
} {
  const descendants = currentModel.areas.filter(
    (area) =>
      area.kind === kind &&
      areaLineageIncludes(area, historicalAreaId, lineageParents),
  )
  const matchingDescendants = descendants.filter((area) =>
    currentAreaMatchesFile(currentModel, area, changedPath),
  )

  if (matchingDescendants.length > 0) {
    return {
      areaIds: matchingDescendants.map((area) => area.id),
      violations: [],
    }
  }

  const currentArea = currentModel.byId.get(historicalAreaId)
  if (
    currentArea?.kind === kind &&
    currentAreaMatchesFile(currentModel, currentArea, changedPath)
  ) {
    return { areaIds: [historicalAreaId], violations: [] }
  }

  if (descendants.length === 1) {
    return { areaIds: [descendants[0].id], violations: [] }
  }

  if (currentArea?.kind === kind && descendants.length === 0) {
    return { areaIds: [historicalAreaId], violations: [] }
  }

  return {
    areaIds: [],
    violations: [
      {
        file: changedPath,
        message:
          descendants.length === 0
            ? `cannot resolve historical area ${historicalAreaId} in current area model`
            : `cannot localize historical area ${historicalAreaId} across current descendants: ${descendants
                .map((area) => area.id)
                .join(", ")}`,
      },
    ],
  }
}

function collectLineageParents(
  currentModel: CompiledAreaModel,
  snapshots: ReadonlyMap<string, CompiledAreaModel>,
): ReadonlyMap<string, string> {
  const parents = new Map<string, string>()
  for (const area of currentModel.areas) {
    if (area.splitFrom !== undefined) parents.set(area.id, area.splitFrom)
  }
  for (const snapshot of snapshots.values()) {
    for (const area of snapshot.areas) {
      if (area.splitFrom !== undefined && !parents.has(area.id)) {
        parents.set(area.id, area.splitFrom)
      }
    }
  }
  return parents
}

function areaLineageIncludes(
  area: AreaRecord,
  targetAreaId: string,
  lineageParents: ReadonlyMap<string, string>,
): boolean {
  let current = area.splitFrom
  const seen = new Set<string>()
  while (current !== undefined && !seen.has(current)) {
    if (current === targetAreaId) return true
    seen.add(current)
    current = lineageParents.get(current)
  }
  return false
}

function currentAreaMatchesFile(
  model: CompiledAreaModel,
  area: AreaRecord,
  changedPath: string,
): boolean {
  const matcher =
    area.kind === "partition"
      ? model.partitionMatchers.get(area.id)
      : model.coverMatchers.get(area.id)
  return matcher ? matcherMatchesFile(matcher, changedPath) : false
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

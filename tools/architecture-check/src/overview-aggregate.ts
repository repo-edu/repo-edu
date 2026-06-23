import {
  type AreaMember,
  type CompiledAreaModel,
  compileAreaModel,
  loadAreaModel,
  type PartitionArea,
  type ReconciliationResult,
  reconcileAreaModel,
} from "./area-model.js"
import { readSourceInventory, type SourceInventory } from "./inventory.js"
import { ROOT } from "./repo-paths.js"
import { countRepoFileLines } from "./source-lines.js"

export type SourceRootId = "apps" | "packages" | "tools"

export type PartitionOverview = {
  readonly id: string
  readonly name: string
  readonly sourceRoot: SourceRootId
  readonly files: number
  readonly lines: number
}

export type SourceRootOverview = {
  readonly id: SourceRootId
  readonly name: string
  readonly files: number
  readonly lines: number
  readonly partitions: readonly PartitionOverview[]
}

export type CoverPartitionCount = {
  readonly partitionId: string
  readonly count: number
}

export type CoverOverview = {
  readonly id: string
  readonly name: string
  readonly totalFiles: number
  readonly counts: readonly CoverPartitionCount[]
}

export type AreaStructureAggregate = {
  readonly inventoryFileCount: number
  readonly assignedFileCount: number
  readonly totalLines: number
  readonly partitions: readonly PartitionOverview[]
  readonly roots: readonly SourceRootOverview[]
  readonly covers: readonly CoverOverview[]
  readonly reconciliation: ReconciliationResult
}

export type LineCountProvider = (root: string, repoPath: string) => number

type BuildAreaStructureAggregateOptions = {
  readonly countLines?: LineCountProvider
}

type MutablePartitionOverview = {
  readonly sourceRoots: Set<SourceRootId>
  files: number
  lines: number
}

const SOURCE_ROOTS = ["apps", "packages", "tools"] as const

export function buildAreaStructureAggregate(
  root = ROOT,
  options: BuildAreaStructureAggregateOptions = {},
): AreaStructureAggregate {
  const model = compileAreaModel(loadAreaModel(root))
  const inventory = readSourceInventory(root)
  const reconciliation = reconcileAreaModel(model, inventory)

  return createAreaStructureAggregate({
    countLines: options.countLines ?? countRepoFileLines,
    inventory,
    model,
    reconciliation,
    root,
  })
}

export function createAreaStructureAggregate(input: {
  readonly root: string
  readonly model: CompiledAreaModel
  readonly inventory: SourceInventory
  readonly reconciliation: ReconciliationResult
  readonly countLines: LineCountProvider
}): AreaStructureAggregate {
  const partitionTotals = new Map(
    input.model.partitions.map((partition) => [
      partition.id,
      {
        sourceRoots: new Set<SourceRootId>(),
        files: 0,
        lines: 0,
      } satisfies MutablePartitionOverview,
    ]),
  )
  const coverCounts = new Map(
    input.model.covers.map((cover) => [
      cover.id,
      new Map(input.model.partitions.map((partition) => [partition.id, 0])),
    ]),
  )

  for (const file of input.inventory.files) {
    const partitionId = input.reconciliation.primaryByFile.get(file)
    if (!partitionId) continue

    const partition = partitionTotals.get(partitionId)
    if (!partition) continue

    partition.files += 1
    partition.lines += input.countLines(input.root, file)
    partition.sourceRoots.add(readSourceRootFromPath(file))

    for (const coverId of input.reconciliation.coversByFile.get(file) ?? []) {
      const partitionCounts = coverCounts.get(coverId)
      if (!partitionCounts) continue
      partitionCounts.set(
        partitionId,
        (partitionCounts.get(partitionId) ?? 0) + 1,
      )
    }
  }

  const partitions = input.model.partitions
    .map((partition) =>
      finalizePartitionOverview(partition, partitionTotals.get(partition.id)),
    )
    .sort(comparePartitions)
  const roots = SOURCE_ROOTS.map((sourceRoot) =>
    buildRootOverview(sourceRoot, partitions),
  )
  const covers = input.model.covers.map((cover) => {
    const counts = partitions.map((partition) => ({
      partitionId: partition.id,
      count: coverCounts.get(cover.id)?.get(partition.id) ?? 0,
    }))

    return {
      id: cover.id,
      name: cover.name,
      totalFiles: counts.reduce((total, count) => total + count.count, 0),
      counts,
    } satisfies CoverOverview
  })

  return {
    inventoryFileCount: input.inventory.files.length,
    assignedFileCount: partitions.reduce(
      (total, partition) => total + partition.files,
      0,
    ),
    totalLines: partitions.reduce(
      (total, partition) => total + partition.lines,
      0,
    ),
    partitions,
    roots,
    covers,
    reconciliation: input.reconciliation,
  }
}

function finalizePartitionOverview(
  area: PartitionArea,
  totals: MutablePartitionOverview | undefined,
): PartitionOverview {
  const sourceRoot = readOnlySourceRoot(
    totals?.sourceRoots ?? new Set<SourceRootId>(),
    area,
  )

  return {
    id: area.id,
    name: area.name,
    sourceRoot,
    files: totals?.files ?? 0,
    lines: totals?.lines ?? 0,
  }
}

function buildRootOverview(
  sourceRoot: SourceRootId,
  partitions: readonly PartitionOverview[],
): SourceRootOverview {
  const rootPartitions = partitions.filter(
    (partition) => partition.sourceRoot === sourceRoot,
  )

  return {
    id: sourceRoot,
    name: sourceRoot,
    files: rootPartitions.reduce(
      (total, partition) => total + partition.files,
      0,
    ),
    lines: rootPartitions.reduce(
      (total, partition) => total + partition.lines,
      0,
    ),
    partitions: rootPartitions,
  }
}

function readOnlySourceRoot(
  roots: ReadonlySet<SourceRootId>,
  area: PartitionArea,
): SourceRootId {
  const [sourceRoot] = roots
  if (sourceRoot !== undefined && roots.size === 1) return sourceRoot
  if (roots.size > 1) {
    throw new Error(
      `Partition ${area.id} spans multiple source roots; overview treemap requires one root per partition.`,
    )
  }

  const memberRoots = new Set(area.members.map(readSourceRootFromMember))
  memberRoots.delete(undefined)
  const [memberRoot] = memberRoots
  if (memberRoot !== undefined && memberRoots.size === 1) return memberRoot

  throw new Error(
    `Partition ${area.id} has no source root; overview treemap requires one root per partition.`,
  )
}

function readSourceRootFromMember(
  member: AreaMember,
): SourceRootId | undefined {
  const rawPath = member.path.replace(/^\^/, "")
  if (rawPath.startsWith("apps/")) return "apps"
  if (rawPath.startsWith("packages/")) return "packages"
  if (rawPath.startsWith("tools/")) return "tools"
  return undefined
}

function readSourceRootFromPath(filePath: string): SourceRootId {
  const [root] = filePath.split("/")
  if (root === "apps" || root === "packages" || root === "tools") return root
  throw new Error(`Source inventory path has no supported root: ${filePath}`)
}

function comparePartitions(
  left: PartitionOverview,
  right: PartitionOverview,
): number {
  const rootDiff =
    SOURCE_ROOTS.indexOf(left.sourceRoot) -
    SOURCE_ROOTS.indexOf(right.sourceRoot)
  if (rootDiff !== 0) return rootDiff

  const lineDiff = right.lines - left.lines
  if (lineDiff !== 0) return lineDiff

  return left.name.localeCompare(right.name)
}

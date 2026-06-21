import * as fs from "node:fs"
import { z } from "zod"

import type { SourceInventory } from "./inventory.js"
import { repoPathToAbsolute } from "./repo-paths.js"
import type { Violation } from "./violations.js"

const idSchema = z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)

const patternMemberSchema = z.object({
  type: z.literal("pattern"),
  path: z.string().min(1),
})

const fileMemberSchema = z.object({
  type: z.literal("file"),
  path: z.string().min(1),
})

const memberSchema = z.discriminatedUnion("type", [
  patternMemberSchema,
  fileMemberSchema,
])

const baseAreaSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  kind: z.enum(["partition", "cover"]),
  members: z.array(memberSchema).min(1),
  splitFrom: idSchema.optional(),
})

const partitionAreaSchema = baseAreaSchema
  .extend({
    kind: z.literal("partition"),
    exclude: z.array(patternMemberSchema).optional(),
  })
  .superRefine((area, context) => {
    for (const member of area.members) {
      if (member.type === "file") {
        context.addIssue({
          code: "custom",
          message: "Partition areas cannot use literal file members.",
          path: ["members"],
        })
      }
    }
  })

const coverAreaSchema = baseAreaSchema
  .extend({
    kind: z.literal("cover"),
    exclude: z.never().optional(),
  })
  .superRefine((area, context) => {
    if (area.id.startsWith("cover-")) return
    context.addIssue({
      code: "custom",
      message: "Cover area IDs must use the cover- prefix.",
      path: ["id"],
    })
  })

const areaSchema = z.discriminatedUnion("kind", [
  partitionAreaSchema,
  coverAreaSchema,
])

const areaModelSchema = z
  .object({
    schemaVersion: z.literal(1),
    areas: z.array(areaSchema).min(1),
  })
  .superRefine((model, context) => {
    const seen = new Set<string>()
    for (const [index, area] of model.areas.entries()) {
      if (seen.has(area.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate area ID: ${area.id}`,
          path: ["areas", index, "id"],
        })
      }
      seen.add(area.id)

      if (area.splitFrom === area.id) {
        context.addIssue({
          code: "custom",
          message: "splitFrom cannot reference the record's own ID.",
          path: ["areas", index, "splitFrom"],
        })
      }
    }
  })

export type PatternMember = {
  readonly type: "pattern"
  readonly path: string
}

export type FileMember = {
  readonly type: "file"
  readonly path: string
}

export type AreaMember = PatternMember | FileMember

type BaseArea = {
  readonly id: string
  readonly name: string
  readonly members: readonly AreaMember[]
  readonly splitFrom?: string
}

export type PartitionArea = BaseArea & {
  readonly kind: "partition"
  readonly exclude?: readonly PatternMember[]
}

export type CoverArea = BaseArea & {
  readonly kind: "cover"
}

export type AreaRecord = PartitionArea | CoverArea

export type AreaModel = {
  readonly schemaVersion: 1
  readonly areas: readonly AreaRecord[]
}

export type CompiledAreaModel = {
  readonly areas: readonly AreaRecord[]
  readonly partitions: readonly PartitionArea[]
  readonly covers: readonly CoverArea[]
  readonly byId: ReadonlyMap<string, AreaRecord>
  readonly partitionMatchers: ReadonlyMap<string, AreaMatcher>
  readonly coverMatchers: ReadonlyMap<string, AreaMatcher>
}

export type AreaMatcher = {
  readonly includes: readonly RegExp[]
  readonly excludes: readonly RegExp[]
  readonly literalFiles: ReadonlySet<string>
}

export type ReconciliationResult = {
  readonly primaryByFile: ReadonlyMap<string, string>
  readonly coversByFile: ReadonlyMap<string, readonly string[]>
  readonly violations: readonly Violation[]
}

export function loadAreaModel(root: string): AreaModel {
  const filePath = repoPathToAbsolute(
    root,
    "tools/architecture-check/src/area-model.json",
  )
  return parseAreaModel(JSON.parse(fs.readFileSync(filePath, "utf8")))
}

export function parseAreaModel(value: unknown): AreaModel {
  return areaModelSchema.parse(value) as AreaModel
}

export function compileAreaModel(model: AreaModel): CompiledAreaModel {
  const byId = new Map(model.areas.map((area) => [area.id, area]))
  const partitions = model.areas.filter(
    (area): area is PartitionArea => area.kind === "partition",
  )
  const covers = model.areas.filter(
    (area): area is CoverArea => area.kind === "cover",
  )

  return {
    areas: model.areas,
    partitions,
    covers,
    byId,
    partitionMatchers: new Map(
      partitions.map((area) => [area.id, compileMatcher(area)]),
    ),
    coverMatchers: new Map(
      covers.map((area) => [area.id, compileMatcher(area)]),
    ),
  }
}

export function compileMatcher(area: AreaRecord): AreaMatcher {
  return {
    includes: area.members
      .filter((member): member is PatternMember => member.type === "pattern")
      .map((member) => new RegExp(member.path)),
    excludes:
      area.kind === "partition"
        ? (area.exclude ?? []).map((member) => new RegExp(member.path))
        : [],
    literalFiles: new Set(
      area.members
        .filter((member) => member.type === "file")
        .map((member) => member.path),
    ),
  }
}

export function matcherMatchesFile(
  matcher: AreaMatcher,
  filePath: string,
): boolean {
  const included =
    matcher.literalFiles.has(filePath) ||
    matcher.includes.some((pattern) => pattern.test(filePath))
  if (!included) return false
  return !matcher.excludes.some((pattern) => pattern.test(filePath))
}

export function reconcileAreaModel(
  model: CompiledAreaModel,
  inventory: SourceInventory,
): ReconciliationResult {
  const violations: Violation[] = []
  const primaryByFile = new Map<string, string>()
  const coversByFile = new Map<string, string[]>()
  const partitionMatches = new Map<string, string[]>()
  const coverPatternMatches = new Map<string, Map<string, number>>()

  for (const area of model.partitions) {
    partitionMatches.set(area.id, [])
  }

  for (const cover of model.covers) {
    const patternCounts = new Map<string, number>()
    for (const member of cover.members) {
      if (member.type === "pattern") patternCounts.set(member.path, 0)
    }
    coverPatternMatches.set(cover.id, patternCounts)
  }

  for (const file of inventory.files) {
    const matchingPartitions = model.partitions.filter((area) => {
      const matcher = model.partitionMatchers.get(area.id)
      return matcher ? matcherMatchesFile(matcher, file) : false
    })

    if (matchingPartitions.length === 0) {
      violations.push({
        file,
        message: "is not assigned to a partition area",
      })
    } else if (matchingPartitions.length > 1) {
      violations.push({
        file,
        message: `matches multiple partition areas: ${matchingPartitions
          .map((area) => area.id)
          .join(", ")}`,
      })
    } else {
      const [area] = matchingPartitions
      primaryByFile.set(file, area.id)
      partitionMatches.get(area.id)?.push(file)
    }

    const coverIds: string[] = []
    for (const cover of model.covers) {
      const matcher = model.coverMatchers.get(cover.id)
      if (!matcher) continue
      if (!matcherMatchesFile(matcher, file)) continue
      coverIds.push(cover.id)

      const patternCounts = coverPatternMatches.get(cover.id)
      if (patternCounts) {
        for (const member of cover.members) {
          if (member.type !== "pattern") continue
          if (new RegExp(member.path).test(file)) {
            patternCounts.set(
              member.path,
              (patternCounts.get(member.path) ?? 0) + 1,
            )
          }
        }
      }
    }
    if (coverIds.length > 0) coversByFile.set(file, coverIds)
  }

  for (const [areaId, files] of partitionMatches.entries()) {
    if (files.length === 0) {
      violations.push({
        file: areaId,
        message: "partition area has no source-inventory files",
      })
    }
  }

  for (const cover of model.covers) {
    for (const member of cover.members) {
      if (member.type === "file" && !inventory.fileSet.has(member.path)) {
        violations.push({
          file: member.path,
          message: `is a stale literal file member of ${cover.id}`,
        })
      }
    }

    const patternCounts = coverPatternMatches.get(cover.id) ?? new Map()
    for (const [pattern, count] of patternCounts.entries()) {
      if (count === 0) {
        violations.push({
          file: cover.id,
          message: `cover pattern matches no source-inventory files: ${pattern}`,
        })
      }
    }
  }

  return {
    primaryByFile,
    coversByFile,
    violations,
  }
}

export function findPrimaryArea(
  model: CompiledAreaModel,
  filePath: string,
): string | undefined {
  return model.partitions.find((area) => {
    const matcher = model.partitionMatchers.get(area.id)
    return matcher ? matcherMatchesFile(matcher, filePath) : false
  })?.id
}

export function findCoverAreas(
  model: CompiledAreaModel,
  filePath: string,
): string[] {
  return model.covers
    .filter((area) => {
      const matcher = model.coverMatchers.get(area.id)
      return matcher ? matcherMatchesFile(matcher, filePath) : false
    })
    .map((area) => area.id)
}

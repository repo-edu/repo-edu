import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { z } from "zod"
import { type Finding, findingTitle, readFindings } from "./findings.js"
import { parseSubject, type Repository } from "./subject.js"

const assistant = z.enum(["claude", "codex"])
const tier = z.enum(["A", "B", "C", "D"])
const reach = z.enum(["developer", "very-rare", "rare", "ordinary"])
const complexity = z.enum([
  "minus-high",
  "minus-medium",
  "minus-low",
  "none",
  "low",
  "medium",
  "high",
])
const modelSelection = z.strictObject({
  model: z.string().min(1),
  effort: z.string().min(1).nullable(),
})
const auditSelection = z.union([
  modelSelection,
  z.tuple([modelSelection, modelSelection]),
])
const tokenUsage = z.strictObject({
  model: z.string().min(1),
  input: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
})
const repository = z.enum(["repo-edu", "plan"])

const planningLocation = z.strictObject({
  kind: z.literal("planning"),
  field: z.enum(["excess", "missing"]),
  section: z.string().min(1),
})
const planLocation = z.strictObject({
  kind: z.literal("plan"),
  section: z.string().min(1),
})
const repoEduLocation = z.strictObject({
  kind: z.literal("repo-edu"),
  area: z.string().min(1),
  covers: z.array(z.string().min(1)),
})
const deferredLocation = z.union([
  z.strictObject({
    kind: z.literal("deferred"),
    repository: z.literal("plan"),
    plan: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("deferred"),
    repository: z.literal("repo-edu"),
    area: z.string().min(1),
    covers: z.array(z.string().min(1)),
  }),
])

export const roundFindingLocationSchema = z.union([
  planningLocation,
  planLocation,
  repoEduLocation,
  deferredLocation,
])

export const roundFindingSchema = z
  .strictObject({
    number: z.number().int().positive().nullable(),
    title: z.string().min(1),
    tier,
    reach,
    complexity,
    growthPattern: z.string().min(1),
    location: roundFindingLocationSchema,
    vetVerdict: z
      .enum(["accept", "revise", "drop", "needs-user-ruling"])
      .nullable(),
    rebuttalAnswer: z.enum(["agree", "contest", "for-user-ruling"]).nullable(),
    outcome: z.enum(["kept", "dropped", "unmatched"]).nullable(),
    finalTier: tier.nullable(),
    finalReach: reach.nullable(),
  })
  .superRefine((finding, context) => {
    if (finding.outcome === "unmatched" && finding.number !== null)
      context.addIssue({
        code: "custom",
        message: "An unmatched record finding has no audit finding number",
        path: ["number"],
      })
    if (finding.outcome !== "unmatched" && finding.number === null)
      context.addIssue({
        code: "custom",
        message: "An audit finding needs its report number",
        path: ["number"],
      })
    if (
      finding.outcome !== "kept" &&
      (finding.finalTier !== null || finding.finalReach !== null)
    )
      context.addIssue({
        code: "custom",
        message: "Only a kept finding can record a final tier or reach",
        path: ["outcome"],
      })
  })

const roundStatus = z.enum([
  "in-progress",
  "finished",
  "failed",
  "interrupted",
  "awaiting-ruling",
])
const judgeAnswer = z
  .strictObject({
    answer: z.enum(["stop", "claude", "codex"]),
    reason: z.string().min(1),
  })
  .nullable()
const commonRoundData = z.strictObject({
  target: z.string().min(1),
  round: z.number().int().positive(),
  tag: z.string().regex(/^[ao][btu][lmhx]$/),
  started: z.string().min(1),
  status: roundStatus,
  settings: z.strictObject({
    audit: z.strictObject({
      claude: auditSelection,
      codex: auditSelection,
    }),
    vet: z.strictObject({
      claude: modelSelection,
      codex: modelSelection,
    }),
    fix: modelSelection.extend({ assistant }),
  }),
  auditor: modelSelection.extend({
    assistant,
    chosenBy: z.enum(["settings", "command-line"]),
  }),
  phases: z.array(
    z.strictObject({
      phase: z.enum(["audit", "vet", "rebut", "fix", "brief", "watch"]),
      assistant,
      model: z.string().min(1),
      effort: z.string().min(1).nullable(),
      milliseconds: z.number().int().nonnegative(),
      tokens: z.array(tokenUsage),
      peakContext: z
        .strictObject({
          tokens: z.number().int().nonnegative(),
          window: z.number().int().positive().nullable(),
        })
        .nullable(),
      compactions: z.number().int().nonnegative(),
    }),
  ),
  commits: z.array(
    z.strictObject({
      repository,
      sha: z.string().regex(/^[0-9a-f]{40}$/i),
    }),
  ),
  findings: z.array(roundFindingSchema),
  judge: judgeAnswer,
})

export const planningRoundDataSchema = commonRoundData.extend({
  phase: z.enum(["widening", "detailing"]),
})
export const implementationRoundDataSchema = commonRoundData.extend({
  scope: z.string().min(1),
  judgedRepos: z.array(repository),
})
export const roundDataSchema = z.union([
  planningRoundDataSchema,
  implementationRoundDataSchema,
])
const planningRoundFileSchema = z.array(planningRoundDataSchema)
const implementationRoundFileSchema = z.array(implementationRoundDataSchema)
const roundDataFilename = /-(?:plan|impl)-rounds\.json$/

export type RoundFindingLocation = z.infer<typeof roundFindingLocationSchema>
export type RoundFinding = z.infer<typeof roundFindingSchema>
export type ReportFinding = Omit<
  RoundFinding,
  "vetVerdict" | "rebuttalAnswer" | "outcome" | "finalTier" | "finalReach"
> & { readonly number: number }
export type VetVerdict = NonNullable<RoundFinding["vetVerdict"]>
export type RebuttalAnswer = NonNullable<RoundFinding["rebuttalAnswer"]>
export type RoundData = z.infer<typeof roundDataSchema>
export type PlanningRoundData = z.infer<typeof planningRoundDataSchema>
export type ImplementationRoundData = z.infer<
  typeof implementationRoundDataSchema
>
export type PlanRoundData = {
  readonly planning?: readonly PlanningRoundData[]
  readonly implementation?: readonly ImplementationRoundData[]
}
export type ModelTokenUsage = z.infer<typeof tokenUsage>
export type LandedCommit = RoundData["commits"][number]

export type FindingReview = {
  readonly number: number
  readonly tier: RoundFinding["tier"]
  readonly verdict: VetVerdict
}

export type FindingRebuttal = {
  readonly number: number
  readonly tier: RoundFinding["tier"]
  readonly answer: RebuttalAnswer
}

export type RoundAccount = {
  readonly judgedRepos: readonly Repository[]
  readonly findings: readonly RoundFinding[]
}

type FindingRecord = {
  readonly repository: Repository
  readonly subject: string
  readonly message: string
}

/** Find retained round data beside active plans and inside closed-plan archives. */
export async function roundDataFiles(planRoot: string): Promise<string[]> {
  const active = (await readdir(planRoot))
    .filter((entry) => roundDataFilename.test(entry))
    .map((entry) => join(planRoot, entry))
  const archive = join(planRoot, "archive")
  let closed: string[] = []
  try {
    closed = (await readdir(archive, { recursive: true }))
      .filter((entry) => roundDataFilename.test(basename(entry)))
      .map((entry) => join(archive, entry))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  return [...active, ...closed].sort()
}

/** Read the two round-kind files that exist for one active or closed plan. */
export async function readPlanRoundData(
  planRoot: string,
  stem: string,
): Promise<PlanRoundData> {
  const files = await roundDataFiles(planRoot)
  const selected = {
    planning: files.filter(
      (file) => basename(file) === `${stem}-plan-rounds.json`,
    ),
    implementation: files.filter(
      (file) => basename(file) === `${stem}-impl-rounds.json`,
    ),
  }
  const duplicate = Object.entries(selected).find(
    ([, matches]) => matches.length > 1,
  )
  if (duplicate !== undefined)
    throw new Error(
      `More than one ${duplicate[0]} round data file exists for ${stem}`,
    )

  const [planning, implementation] = await Promise.all([
    selected.planning[0] === undefined
      ? undefined
      : readFile(selected.planning[0], "utf8").then((source) =>
          planningRoundFileSchema.parse(JSON.parse(source)),
        ),
    selected.implementation[0] === undefined
      ? undefined
      : readFile(selected.implementation[0], "utf8").then((source) =>
          implementationRoundFileSchema.parse(JSON.parse(source)),
        ),
  ])
  return {
    ...(planning === undefined ? {} : { planning }),
    ...(implementation === undefined ? {} : { implementation }),
  }
}

/** Split the allocated name into the target-wide identity stored in JSON. */
export function roundDataIdentity(nameStart: string): {
  readonly target: string
  readonly round: number
} {
  const match = /^(.+)-(\d{2,})$/.exec(nameStart)
  if (match === null) throw new Error(`Invalid round identity: ${nameStart}`)
  return { target: match[1], round: Number(match[2]) }
}

/** Attach review outcomes while the report still owns finding identity. */
export function reviewedRoundFindings(
  findings: readonly ReportFinding[],
  reviews: readonly FindingReview[] = [],
  rebuttals: readonly FindingRebuttal[] = [],
): readonly RoundFinding[] {
  const reviewByNumber = new Map(
    reviews.map((review) => [review.number, review]),
  )
  const rebuttalByNumber = new Map(
    rebuttals.map((rebuttal) => [rebuttal.number, rebuttal]),
  )
  return findings.map((finding) => ({
    ...finding,
    vetVerdict: reviewByNumber.get(finding.number)?.verdict ?? null,
    rebuttalAnswer: rebuttalByNumber.get(finding.number)?.answer ?? null,
    outcome: null,
    finalTier: null,
    finalReach: null,
  }))
}

function recordLocation(
  finding: Finding,
  repository: Repository,
): RoundFindingLocation {
  if (finding.field !== null) {
    if (finding.location.key !== "section")
      throw new Error("A planning record finding needs a section")
    return {
      kind: "planning",
      field: finding.field as "excess" | "missing",
      section: finding.location.value,
    }
  }
  if (finding.deferred) {
    return repository === "repo-edu"
      ? {
          kind: "deferred",
          repository: "plan",
          plan: finding.location.value,
        }
      : {
          kind: "deferred",
          repository: "repo-edu",
          area: finding.location.value,
          covers: [...finding.covers],
        }
  }
  return repository === "repo-edu"
    ? {
        kind: "repo-edu",
        area: finding.location.value,
        covers: [...finding.covers],
      }
    : { kind: "plan", section: finding.location.value }
}

function recordFindings(records: readonly FindingRecord[]): RoundFinding[] {
  return records.flatMap((record) => {
    const subject = parseSubject(record.subject, record.repository)
    return readFindings(
      record.message,
      record.repository,
      subject.form?.role ?? null,
    ).map((finding) => ({
      number: null,
      title: findingTitle(finding),
      tier: finding.tier.toUpperCase() as RoundFinding["tier"],
      reach: finding.reach,
      complexity: finding.complexity,
      growthPattern: finding.growthPattern,
      location: recordLocation(finding, record.repository),
      vetVerdict: null,
      rebuttalAnswer: null,
      outcome: "unmatched" as const,
      finalTier: null,
      finalReach: null,
    }))
  })
}

/** Join the fix's durable record bullets to report findings by whole-round title. */
export function settleRoundFindings(
  findings: readonly RoundFinding[],
  records: readonly FindingRecord[],
): readonly RoundFinding[] {
  const recorded = recordFindings(records)
  const byTitle = new Map<string, RoundFinding>()
  for (const finding of recorded) {
    if (byTitle.has(finding.title))
      throw new Error(
        `Record finding title appears more than once: ${finding.title}`,
      )
    byTitle.set(finding.title, finding)
  }
  const matched = new Set<string>()
  const settled = findings.map((finding): RoundFinding => {
    const final = byTitle.get(finding.title)
    if (final === undefined) return { ...finding, outcome: "dropped" }
    matched.add(finding.title)
    return {
      ...finding,
      outcome: "kept",
      finalTier: final.tier === finding.tier ? null : final.tier,
      finalReach: final.reach === finding.reach ? null : final.reach,
    }
  })
  return [
    ...settled,
    ...recorded.filter((finding) => !matched.has(finding.title)),
  ]
}

function fileSchema(path: string) {
  if (path.endsWith("-plan-rounds.json")) return planningRoundFileSchema
  if (path.endsWith("-impl-rounds.json")) return implementationRoundFileSchema
  throw new Error(`Invalid per-plan round data path: ${path}`)
}

/** Parse one round-kind file under the schema its name selects. */
export function parseRoundDataFile(
  path: string,
  source: string,
): readonly RoundData[] {
  return fileSchema(path).parse(JSON.parse(source))
}

/** Replace or append one entry and atomically publish the complete collection. */
export function writeRoundData(path: string, value: RoundData): void {
  const schema = fileSchema(path)
  const data = roundDataSchema.parse(value)
  if (
    "phase" in data !== path.endsWith("-plan-rounds.json") ||
    "scope" in data !== path.endsWith("-impl-rounds.json")
  )
    throw new Error(`Round data kind does not match ${path}`)
  let entries: RoundData[] = []
  try {
    entries = [...schema.parse(JSON.parse(readFileSync(path, "utf8")))]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const index = entries.findIndex(
    (entry) => entry.target === data.target && entry.round === data.round,
  )
  if (index === -1) entries.push(data)
  else entries[index] = data
  const checked = schema.parse(entries)
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(checked, null, 2)}\n`)
  renameSync(temporary, path)
}

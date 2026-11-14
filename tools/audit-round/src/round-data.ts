import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { z } from "zod"
import type { PlanRoots } from "./context.js"
import { complexitySchema, reachSchema } from "./finding-tokens.js"
import { type Finding, readFindings } from "./findings.js"
import { parseSubject, type Repository } from "./subject.js"
import type { RoundKind } from "./target.js"

const assistant = z.enum(["claude", "codex"])
const tier = z.enum(["A", "B", "C", "D"])
/** A capability tag, which names a round's auditor and each of its vets. */
export const capabilityTag = z.string().regex(/^[ao][btu][lmhx]$/)
/**
 * The runner's one list of winner words: the audit report's finding as written,
 * no side, or the vets whose verdicts were right, named by their tags.
 */
export const rulingWinnerSchema = z.union([
  z.enum(["report", "neither"]),
  z.array(capabilityTag).min(1),
])
const modelSelection = z.strictObject({
  model: z.string().min(1),
  effort: z.string().min(1).nullable(),
})
const tokenUsage = z.strictObject({
  model: z.string().min(1),
  input: z.number().int().nonnegative(),
  cached: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
})
const repository = z.enum(["repo-edu", "plan"])
const effort = z.enum(["low", "medium", "high", "xhigh"])
const fullCommit = z.string().regex(/^[0-9a-f]{40}$/i)
const commitGroup = z.strictObject({
  repository,
  commits: z.array(fullCommit).min(1),
  startingHead: z.string().regex(/^[0-9a-f]{6,40}$/i),
})

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

/** One vet's verdict on a finding, with the rebuttal's answer to it. */
export const roundFindingReviewSchema = z.strictObject({
  /** The vet's tag, which its phase entry carries too. */
  vet: capabilityTag,
  verdict: z.enum(["accept", "revise", "drop", "needs-user-ruling"]),
  /** Present only when a revision moves the finding to another tier. */
  revisedTier: tier.optional(),
  answer: z.enum(["agree", "contest", "for-user-ruling"]).nullable(),
})

export const roundFindingSchema = z
  .strictObject({
    number: z.number().int().positive().nullable(),
    title: z.string().min(1),
    tier,
    reach: reachSchema,
    complexity: complexitySchema,
    growthPattern: z.string().min(1),
    location: roundFindingLocationSchema,
    /** One review per vet of the panel that judged the finding. */
    reviews: z.array(roundFindingReviewSchema),
    ruling: z
      .strictObject({
        winner: rulingWinnerSchema,
        reason: z
          .string()
          .min(1)
          .regex(/^[^\r\n]+$/),
      })
      .optional(),
    outcome: z.enum(["kept", "dropped", "unmatched"]).nullable(),
    finalTier: tier.nullable(),
    finalReach: reachSchema.nullable(),
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
    finding.reviews.forEach((review, index) => {
      if (review.revisedTier !== undefined && review.verdict !== "revise")
        context.addIssue({
          code: "custom",
          message: "Only a revised vet verdict can record a revised tier",
          path: ["reviews", index, "revisedTier"],
        })
      if (review.revisedTier === finding.tier)
        context.addIssue({
          code: "custom",
          message: "An unchanged revised tier is omitted",
          path: ["reviews", index, "revisedTier"],
        })
    })
    if (
      finding.ruling !== undefined &&
      !finding.reviews.some((review) => review.answer === "contest") &&
      !findingSplit(finding.reviews)
    )
      context.addIssue({
        code: "custom",
        message: "Only a contested verdict or a split can record a ruling",
        path: ["ruling"],
      })
  })

const roundStatus = z.enum([
  "in-progress",
  "finished",
  "failed",
  "interrupted",
  "awaiting-ruling",
])
const seriesPoolEntry = z.strictObject({
  assistant,
  model: z.string().min(1),
  effort,
})
/** A continuation names the series-pool entry the next round runs on. */
export const seriesAnswerSchema = z
  .strictObject({
    answer: z.union([z.enum(["settle", "ready", "stop"]), seriesPoolEntry]),
    reason: z.string().min(1),
  })
  .nullable()
const phaseMeasurement = {
  assistant,
  model: z.string().min(1),
  effort: z.string().min(1).nullable(),
  /**
   * The selection the settings named, before the CLI resolved any alias.
   * Entries written before it was recorded carry none.
   */
  launched: modelSelection.optional(),
  milliseconds: z.number().int().nonnegative(),
  tokens: z.array(tokenUsage),
  peakContext: z
    .strictObject({
      tokens: z.number().int().nonnegative(),
      window: z.number().int().positive().nullable(),
    })
    .nullable(),
  compactions: z.number().int().nonnegative(),
}
/** A vet's entry carries its tag, which links its reviews to its model and effort. */
const vetPhaseEntry = z.strictObject({
  phase: z.literal("vet"),
  tag: capabilityTag,
  ...phaseMeasurement,
})
const phaseEntry = z.strictObject({
  phase: z.enum(["audit", "rebut", "fix", "watch", "judge"]),
  ...phaseMeasurement,
})
const commonRoundData = z.strictObject({
  target: z.string().min(1),
  round: z.number().int().positive(),
  tag: capabilityTag,
  started: z.string().min(1),
  status: roundStatus,
  settings: z.strictObject({
    /** The round's panel: every vet that judges its audit report. */
    vetters: z.array(modelSelection.extend({ assistant })).min(1),
    fix: modelSelection.extend({ assistant }),
  }),
  auditor: modelSelection.extend({
    assistant,
    chosenBy: z.enum(["settings", "--first", "--auditor", "command-line"]),
    /**
     * The selection the audit launched on, with its alias resolved at startup.
     * The series rules match it against the pool, because the CLI may report
     * another model or effort than it was asked for. Entries written before it
     * was recorded carry none and match by the reported selection.
     */
    seat: z.strictObject({ model: z.string().min(1), effort }).optional(),
  }),
  phases: z.array(z.union([vetPhaseEntry, phaseEntry])),
  commits: z.array(
    z.strictObject({
      repository,
      sha: fullCommit,
    }),
  ),
  findings: z.array(roundFindingSchema),
  /** New automatic rounds retain the resolved ordered pool used for this answer. */
  pool: z.array(seriesPoolEntry).min(1).optional(),
  /** Historical field name retained because replay reads the stored corpus. */
  judge: seriesAnswerSchema,
})

export const planningRoundDataSchema = commonRoundData.extend({
  phase: z.enum(["widening", "detailing"]),
  settling: z.string(),
})
export const implementationRoundDataSchema = commonRoundData.extend({
  scope: z.string().min(1),
  judgedRepos: z.array(repository),
})
export const commitRoundDataSchema = commonRoundData.extend({
  originalGroups: z.array(commitGroup).min(1),
  groups: z.array(commitGroup).min(1),
  judgedRepos: z.array(repository),
})
export const roundDataSchema = z.union([
  planningRoundDataSchema,
  implementationRoundDataSchema,
  commitRoundDataSchema,
])
const commonDisprovedFinding = {
  date: z.iso.date(),
  reason: z.string().min(1),
}
export const disprovedFindingSchema = z.union([
  z.strictObject({
    ...commonDisprovedFinding,
    target: z.string().min(1),
    round: z.number().int().positive(),
    finding: z.number().int().positive(),
    side: z.enum(["finding", "vet"]).optional(),
  }),
  z.strictObject({
    ...commonDisprovedFinding,
    auditor: z.strictObject({
      model: z.string().min(1),
      effort,
    }),
  }),
])
const planningRoundFileSchema = z.strictObject({
  rounds: z.array(planningRoundDataSchema),
  disproved: z.array(disprovedFindingSchema),
})
const implementationRoundFileSchema = z.strictObject({
  rounds: z.array(implementationRoundDataSchema),
  disproved: z.array(disprovedFindingSchema),
})
const commitRoundFileSchema = z.strictObject({
  rounds: z.array(commitRoundDataSchema),
})
const roundDataFilenamePattern = /-(?:plan|impl)-rounds\.json$/

function isCommitRoundDataName(name: string): boolean {
  return (
    !roundDataFilenamePattern.test(name) &&
    /^commit-.+-rounds\.json$/.test(name)
  )
}

/** The one file name shared by round-data writers and readers. */
export function roundDataFilename(
  stem: string,
  kind: RoundKind | "commit",
): string {
  return kind === "commit"
    ? `${stem}-rounds.json`
    : `${stem}-${kind === "planning" ? "plan" : "impl"}-rounds.json`
}

export type RoundFindingLocation = z.infer<typeof roundFindingLocationSchema>
export type RoundFinding = z.infer<typeof roundFindingSchema>
export type SeriesAnswer = NonNullable<z.infer<typeof seriesAnswerSchema>>
export type SeriesDecision = SeriesAnswer["answer"]
export type RoundFindingReview = z.infer<typeof roundFindingReviewSchema>
export type ReportFinding = Omit<
  RoundFinding,
  "reviews" | "ruling" | "outcome" | "finalTier" | "finalReach"
> & { readonly number: number }
export type VetVerdict = RoundFindingReview["verdict"]
export type RebuttalAnswer = NonNullable<RoundFindingReview["answer"]>
export type RulingWinner = z.infer<typeof rulingWinnerSchema>
export type RoundData = z.infer<typeof roundDataSchema>
export type DisprovedFinding = z.infer<typeof disprovedFindingSchema>
export type PlanRoundDataFile =
  | z.infer<typeof planningRoundFileSchema>
  | z.infer<typeof implementationRoundFileSchema>
export type CommitRoundDataFile = z.infer<typeof commitRoundFileSchema>
export type RoundDataFile = PlanRoundDataFile | CommitRoundDataFile
export type PlanningRoundData = z.infer<typeof planningRoundDataSchema>
export type ImplementationRoundData = z.infer<
  typeof implementationRoundDataSchema
>
export type CommitRoundData = z.infer<typeof commitRoundDataSchema>
export type PlanRoundData = {
  readonly planning?: readonly PlanningRoundData[]
  readonly implementation?: readonly ImplementationRoundData[]
}
export type RetainedPlanRoundData =
  | {
      readonly file: string
      readonly stem: string
      readonly kind: "planning"
      readonly rounds: readonly PlanningRoundData[]
    }
  | {
      readonly file: string
      readonly stem: string
      readonly kind: "implementation"
      readonly rounds: readonly ImplementationRoundData[]
    }
export type RetainedCommitRoundData = {
  readonly file: string
  readonly label: string
  readonly rounds: readonly CommitRoundData[]
}
export type RetainedRoundData = {
  readonly file: string
  readonly entry: RoundData
}
export type ModelTokenUsage = z.infer<typeof tokenUsage>
export type LandedCommit = RoundData["commits"][number]

/** One verdict line read from a vet report. */
export type FindingReview = {
  readonly number: number
  readonly tier: RoundFinding["tier"]
  readonly verdict: VetVerdict
  readonly revisedTier?: RoundFinding["tier"]
}

/** One answer line read from a rebuttal report, naming the vet it answers. */
export type FindingRebuttal = {
  readonly number: number
  readonly tier: RoundFinding["tier"]
  /** The answered vet's tag, which its phase entry and report name carry too. */
  readonly vet: string
  readonly answer: RebuttalAnswer
}

/** One vet of the panel and the verdicts its report gave, in panel order. */
export type PanelVet = {
  /** The vet's tag, which its phase entry and report name carry too. */
  readonly vet: string
  readonly reviews: readonly FindingReview[]
}

export type RoundAccount = {
  readonly settling: string
  readonly judgedRepos: readonly Repository[]
  readonly findings: readonly RoundFinding[]
}

type FindingRecord = {
  readonly repository: Repository
  readonly subject: string
  readonly message: string
}

/** Find retained round data beside active plans and inside closed-plan archives. */
export async function roundDataFiles(roots: PlanRoots): Promise<string[]> {
  const active = (await readdir(roots.activeRoot, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && roundDataFilenamePattern.test(entry.name),
    )
    .map((entry) => join(roots.activeRoot, entry.name))
  const archive = join(roots.planRoot, "archive")
  let closed: string[] = []
  try {
    closed = (await readdir(archive, { recursive: true, withFileTypes: true }))
      .filter(
        (entry) => entry.isFile() && roundDataFilenamePattern.test(entry.name),
      )
      .map((entry) => join(entry.parentPath, entry.name))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  return [...active, ...closed].sort()
}

/** Read every active and archived plan round-data file under its checked schema. */
export async function readAllPlanRoundData(
  roots: PlanRoots,
): Promise<readonly RetainedPlanRoundData[]> {
  return Promise.all(
    (await roundDataFiles(roots)).map(async (file) => {
      const name = basename(file)
      const match = /^(.+)-(plan|impl)-rounds\.json$/.exec(name)
      if (match === null)
        throw new Error(`Invalid plan round data path: ${file}`)
      const source = JSON.parse(await readFile(file, "utf8"))
      if (match[2] === "plan")
        return {
          file,
          stem: match[1],
          kind: "planning" as const,
          rounds: planningRoundFileSchema.parse(source).rounds,
        }
      return {
        file,
        stem: match[1],
        kind: "implementation" as const,
        rounds: implementationRoundFileSchema.parse(source).rounds,
      }
    }),
  )
}

/** Read every active commit-series round-data file under its checked schema. */
export async function readAllCommitRoundData(
  roots: Pick<PlanRoots, "activeRoot">,
): Promise<readonly RetainedCommitRoundData[]> {
  const files = (await readdir(roots.activeRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isCommitRoundDataName(entry.name))
    .map((entry) => join(roots.activeRoot, entry.name))
    .sort()
  return Promise.all(
    files.map(async (file) => {
      const name = basename(file)
      return {
        file,
        label: name.slice(0, -"-rounds.json".length),
        rounds: commitRoundFileSchema.parse(
          JSON.parse(await readFile(file, "utf8")),
        ).rounds,
      }
    }),
  )
}

/** Read the two round-kind files for one plan from its selected episode folder. */
export async function readPlanRoundData(
  roundDataRoot: string,
  stem: string,
): Promise<PlanRoundData> {
  const readPlanning = async () => {
    try {
      const source = await readFile(
        join(roundDataRoot, roundDataFilename(stem, "planning")),
        "utf8",
      )
      return planningRoundFileSchema.parse(JSON.parse(source)).rounds
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }
  const readImplementation = async () => {
    try {
      const source = await readFile(
        join(roundDataRoot, roundDataFilename(stem, "implementation")),
        "utf8",
      )
      return implementationRoundFileSchema.parse(JSON.parse(source)).rounds
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }
  const [planning, implementation] = await Promise.all([
    readPlanning(),
    readImplementation(),
  ])
  return {
    ...(planning === undefined ? {} : { planning }),
    ...(implementation === undefined ? {} : { implementation }),
  }
}

/** Read one active commit series' checked data file by its bounded label. */
export async function readCommitRoundData(
  roots: Pick<PlanRoots, "activeRoot">,
  label: string,
): Promise<readonly CommitRoundData[]> {
  const path = join(roots.activeRoot, roundDataFilename(label, "commit"))
  return commitRoundFileSchema.parse(JSON.parse(await readFile(path, "utf8")))
    .rounds
}

/** Read the one retained active entry named by a round's target and number. */
export async function readActiveRoundData(
  activeRoot: string,
  nameStart: string,
): Promise<RetainedRoundData> {
  const identity = roundDataIdentity(nameStart)
  const files = (await readdir(activeRoot, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        (roundDataFilenamePattern.test(entry.name) ||
          isCommitRoundDataName(entry.name)),
    )
    .map((entry) => join(activeRoot, entry.name))
  const matches = (
    await Promise.all(
      files.map(async (file) => ({
        file,
        data: parseRoundDataFile(file, await readFile(file, "utf8")),
      })),
    )
  ).flatMap(({ file, data }) =>
    data.rounds
      .filter(
        (entry) =>
          entry.target === identity.target && entry.round === identity.round,
      )
      .map((entry) => ({ file, entry })),
  )
  if (matches.length !== 1)
    throw new Error(
      `Expected one retained entry for ${nameStart}; found ${matches.length}.`,
    )
  return matches[0] as RetainedRoundData
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

/**
 * Whether two vets of a panel split on one finding: their verdict words
 * differ, or both revise and the rebuttal does not agree with both. Two
 * revisions the rebuttal agrees with leave the fix to pick one correction,
 * because the runner cannot compare two corrections. Two vets that both send
 * the finding to the user do not split.
 */
export function reviewsSplit(
  first: RoundFindingReview,
  second: RoundFindingReview,
): boolean {
  if (first.verdict !== second.verdict) return true
  return (
    first.verdict === "revise" &&
    (first.answer !== "agree" || second.answer !== "agree")
  )
}

/** Whether any two vets of the finding's panel split on it. */
export function findingSplit(reviews: readonly RoundFindingReview[]): boolean {
  return reviews.some((first, index) =>
    reviews.slice(index + 1).some((second) => reviewsSplit(first, second)),
  )
}

/**
 * Whether the report or a vet of the panel graded the finding A or B. A
 * dispute on such a finding goes to the user, and only such findings compare
 * the vets of a panel.
 */
export function gradedAOrB(
  finding: Pick<RoundFinding, "tier" | "reviews">,
): boolean {
  const serious = (tier: RoundFinding["tier"] | undefined) =>
    tier === "A" || tier === "B"
  return (
    serious(finding.tier) ||
    finding.reviews.some((review) => serious(review.revisedTier))
  )
}

/** Attach each panel vet's review while the report still owns finding identity. */
export function reviewedRoundFindings(
  findings: readonly ReportFinding[],
  panel: readonly PanelVet[] = [],
  rebuttals: readonly FindingRebuttal[] = [],
): readonly RoundFinding[] {
  const readings = panel.map((reading) => ({
    vet: reading.vet,
    reviews: new Map(reading.reviews.map((review) => [review.number, review])),
    answers: new Map(
      rebuttals
        .filter((rebuttal) => rebuttal.vet === reading.vet)
        .map((rebuttal) => [rebuttal.number, rebuttal.answer]),
    ),
  }))
  return findings.map((finding) => ({
    ...finding,
    reviews: readings.flatMap(({ vet, reviews, answers }) => {
      const review = reviews.get(finding.number)
      if (review === undefined) return []
      return [
        {
          vet,
          verdict: review.verdict,
          ...(review.revisedTier === undefined
            ? {}
            : { revisedTier: review.revisedTier }),
          answer: answers.get(finding.number) ?? null,
        },
      ]
    }),
    outcome: null,
    finalTier: null,
    finalReach: null,
  }))
}

function recordLocation(
  finding: Finding,
  repository: Repository,
): RoundFindingLocation {
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
  if (finding.field !== null) {
    if (finding.location.key !== "section")
      throw new Error("A planning record finding needs a section")
    return {
      kind: "planning",
      field: finding.field as "excess" | "missing",
      section: finding.location.value,
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

type RecordedFinding = {
  readonly finding: RoundFinding
  readonly repositories: Set<Repository>
}

/** Key a record bullet by its report finding number, or by title when it lands none. */
function recordKey(finding: Pick<RoundFinding, "number" | "title">): string {
  return finding.number === null
    ? `title:${finding.title}`
    : `#${finding.number}`
}

function recordFindings(
  records: readonly FindingRecord[],
): Map<string, RecordedFinding> {
  const recorded = new Map<string, RecordedFinding>()
  for (const record of records) {
    const subject = parseSubject(record.subject, record.repository)
    for (const finding of readFindings(
      record.message,
      record.repository,
      subject.form?.role ?? null,
    )) {
      const key = recordKey(finding)
      const existing = recorded.get(key)
      if (existing?.repositories.has(record.repository) === true)
        throw new Error(
          finding.number === null
            ? `Record finding title appears more than once: ${finding.title}`
            : `Record finding number appears more than once: ${finding.number}`,
        )
      if (existing !== undefined) {
        existing.repositories.add(record.repository)
        continue
      }
      recorded.set(key, {
        finding: {
          number: finding.number,
          title: finding.title,
          tier: finding.tier.toUpperCase() as RoundFinding["tier"],
          reach: finding.reach,
          complexity: finding.complexity,
          growthPattern: finding.growthPattern,
          location: recordLocation(finding, record.repository),
          reviews: [],
          outcome: "unmatched",
          finalTier: null,
          finalReach: null,
        },
        repositories: new Set([record.repository]),
      })
    }
  }
  return recorded
}

/**
 * Join the fix's durable record bullets to report findings by finding number.
 * A numbered bullet lands the report finding it names, whatever its title; a
 * bullet without a number records work no report finding asked for.
 */
export function settleRoundFindings(
  findings: readonly RoundFinding[],
  records: readonly FindingRecord[],
): readonly RoundFinding[] {
  const recorded = recordFindings(records)
  const numbers = new Set(findings.map((finding) => finding.number))
  for (const { finding } of recorded.values())
    if (finding.number !== null && !numbers.has(finding.number))
      throw new Error(
        `Record finding number names no report finding: ${finding.number}`,
      )
  const settled = findings.map((finding): RoundFinding => {
    const final = recorded.get(recordKey(finding))?.finding
    if (final === undefined) return { ...finding, outcome: "dropped" }
    return {
      ...finding,
      outcome: "kept",
      finalTier: final.tier === finding.tier ? null : final.tier,
      finalReach: final.reach === finding.reach ? null : final.reach,
    }
  })
  return [
    ...settled,
    ...[...recorded.values()]
      .map(({ finding }) => finding)
      .filter((finding) => finding.number === null),
  ]
}

function isCommitRoundDataPath(path: string): boolean {
  return isCommitRoundDataName(basename(path))
}

function fileSchema(path: string) {
  if (path.endsWith("-plan-rounds.json")) return planningRoundFileSchema
  if (path.endsWith("-impl-rounds.json")) return implementationRoundFileSchema
  if (isCommitRoundDataPath(path)) return commitRoundFileSchema
  throw new Error(`Invalid round data path: ${path}`)
}

/** Parse one round-kind file under the schema its name selects. */
export function parseRoundDataFile(
  path: string,
  source: string,
): RoundDataFile {
  return fileSchema(path).parse(JSON.parse(source))
}

/** Atomically publish one complete, checked round-data file. */
function writeRoundDataFile(path: string, value: unknown): void {
  const checked = fileSchema(path).parse(value)
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(checked, null, 2)}\n`)
  renameSync(temporary, path)
}

/** Replace or append one entry and atomically publish the complete collection. */
export function writeRoundData(path: string, value: RoundData): void {
  const schema = fileSchema(path)
  const data = roundDataSchema.parse(value)
  const commitFile = isCommitRoundDataPath(path)
  const matches = path.endsWith("-plan-rounds.json")
    ? "phase" in data
    : path.endsWith("-impl-rounds.json")
      ? "scope" in data
      : "originalGroups" in data
  if (!matches) throw new Error(`Round data kind does not match ${path}`)
  let file: RoundDataFile = commitFile
    ? { rounds: [] }
    : { rounds: [], disproved: [] }
  try {
    file = schema.parse(JSON.parse(readFileSync(path, "utf8")))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const entries: RoundData[] = [...file.rounds]
  const index = entries.findIndex(
    (entry) => entry.target === data.target && entry.round === data.round,
  )
  if (index === -1) entries.push(data)
  else entries[index] = data
  writeRoundDataFile(
    path,
    commitFile
      ? { rounds: entries }
      : {
          rounds: entries,
          disproved: "disproved" in file ? file.disproved : [],
        },
  )
}

/**
 * Whether two disproved entries rule on the same retained finding. One finding
 * holds one later ruling, so a second ruling replaces the first even when it
 * changes which side was wrong. A detached entry names an auditor and no
 * finding, so two of them may both be real and never match.
 */
function sameDisprovedFinding(
  first: DisprovedFinding,
  second: DisprovedFinding,
): boolean {
  return (
    "target" in first &&
    "target" in second &&
    first.target === second.target &&
    first.round === second.round &&
    first.finding === second.finding
  )
}

/**
 * Replace or append one user ruling while preserving the rounds in the same
 * file.
 */
export function writeDisprovedFinding(
  path: string,
  value: DisprovedFinding,
): void {
  if (isCommitRoundDataPath(path))
    throw new Error("Commit round data has no disproved findings")
  const schema = fileSchema(path)
  const disproved = disprovedFindingSchema.parse(value)
  let file: PlanRoundDataFile = { rounds: [], disproved: [] }
  try {
    const parsed = schema.parse(JSON.parse(readFileSync(path, "utf8")))
    if (!("disproved" in parsed))
      throw new Error(`Plan round data has no disproved list: ${path}`)
    file = parsed
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const kept = file.disproved.filter(
    (entry) => !sameDisprovedFinding(entry, disproved),
  )
  writeRoundDataFile(path, {
    rounds: file.rounds,
    disproved: [...kept, disproved],
  })
}

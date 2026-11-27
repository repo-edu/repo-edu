import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { readdir, readFile, stat } from "node:fs/promises"
import { basename, join } from "node:path"
import { z } from "zod"
import type { RoundDataRoots } from "./context.js"
import {
  complexitySchema,
  type FindingRatings,
  harmSchema,
  raritySchema,
  reachValues,
} from "./finding-tokens.js"
import { type Finding, readFindings } from "./findings.js"
import { assistants } from "./phase.js"
import { fullTagPattern, parseSubject, type Repository } from "./subject.js"
import type { RoundKind } from "./target.js"

const assistant = z.enum(assistants)
const tier = z.enum(["A", "B", "C", "D"])
/** A capability tag, which names a round's auditor and each of its vetters. */
export const capabilityTag = z.string().regex(fullTagPattern)
/**
 * The runner's one list of winner words: the audit report's finding as written,
 * no side, or the vetters whose verdicts were right, named by their tags.
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
/**
 * A group the round audited keeps the references shown on the audit report's
 * `Target:` line. A continued round restores its commits and references from
 * the stored group. Older entries carry no references.
 */
const auditedCommitGroup = commitGroup.extend({
  references: z.array(z.string().min(1)).min(1).optional(),
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

/** One vetter's verdict on a finding, with the rebuttal's answer to it. */
export const roundFindingReviewSchema = z.strictObject({
  /** The vetter's tag, which its vet phase entry carries too. */
  vet: capabilityTag,
  verdict: z.enum(["accept", "revise", "drop", "needs-user-ruling"]),
  /** Present only when a revision moves the finding to another tier. */
  revisedTier: tier.optional(),
  answer: z.enum(["agree", "contest", "for-user-ruling"]).nullable(),
})

/**
 * Entries written before the rarity token keep their old reach value, which
 * rated the condition as well as the person, and carry no rarity, harm or final
 * rarity. No reader converts them.
 */
const oldReachValues = ["ordinary", "rare", "very-rare", "developer"] as const
const storedReach = z.enum([...reachValues, ...oldReachValues])

export const roundFindingSchema = z
  .strictObject({
    number: z.number().int().positive().nullable(),
    title: z.string().min(1),
    tier,
    reach: storedReach,
    rarity: raritySchema.optional(),
    /** Present exactly when the rarity is present and not ordinary. */
    harm: harmSchema.optional(),
    complexity: complexitySchema,
    growthPattern: z.string().min(1),
    location: roundFindingLocationSchema,
    /** One review per vetter of the panel that judged the finding. */
    reviews: z.array(roundFindingReviewSchema),
    /**
     * The winner of a contest or split, its one-line reason and who named it:
     * the user through a ruling, or the ruler phase.
     */
    ruling: z
      .strictObject({
        winner: rulingWinnerSchema,
        reason: z
          .string()
          .min(1)
          .regex(/^[^\r\n]+$/),
        namedBy: z.enum(["user", "ruler"]),
        /**
         * Present when the ruler left a choice open or the user added one to
         * the winner. A stopped round asks for the choice again.
         */
        withChoice: z.literal(true).optional(),
      })
      .optional(),
    outcome: z.enum(["kept", "dropped", "unmatched"]).nullable(),
    finalTier: tier.nullable(),
    finalReach: storedReach.nullable(),
    /** The record's rarity where a narrowing changed it; old entries carry none. */
    finalRarity: raritySchema.nullable().optional(),
  })
  .superRefine((finding, context) => {
    const current = finding.rarity !== undefined
    const reaches: readonly string[] = current ? reachValues : oldReachValues
    for (const key of ["reach", "finalReach"] as const) {
      const value = finding[key]
      if (value !== null && !reaches.includes(value))
        context.addIssue({
          code: "custom",
          message: current
            ? "A finding with a rarity has end-user or developer reach"
            : "A finding without a rarity keeps an old reach value",
          path: [key],
        })
    }
    if (
      current
        ? (finding.harm === undefined) !== (finding.rarity === "ordinary")
        : finding.harm !== undefined
    )
      context.addIssue({
        code: "custom",
        message: "A harm level stands exactly on a rarity other than ordinary",
        path: ["harm"],
      })
    if (current !== (finding.finalRarity !== undefined))
      context.addIssue({
        code: "custom",
        message: "A final rarity stands exactly beside a rarity",
        path: ["finalRarity"],
      })
    if (finding.outcome === "unmatched" && finding.number !== null)
      context.addIssue({
        code: "custom",
        message: "An unmatched record finding has no audit finding number",
        path: ["number"],
      })
    if (finding.outcome !== "unmatched" && finding.number === null)
      context.addIssue({
        code: "custom",
        message: "An audit finding needs its audit report number",
        path: ["number"],
      })
    if (
      finding.outcome !== "kept" &&
      (finding.finalTier !== null ||
        finding.finalReach !== null ||
        (finding.finalRarity ?? null) !== null)
    )
      context.addIssue({
        code: "custom",
        message: "Only a kept finding can record a final tier, reach or rarity",
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
/** A continuation names the listed auditor the next round runs on. */
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
/** A vet phase entry carries its vetter's tag, which links its reviews to its model and effort. */
const vetPhaseEntry = z.strictObject({
  phase: z.literal("vet"),
  tag: capabilityTag,
  ...phaseMeasurement,
})
const phaseEntry = z.strictObject({
  phase: z.enum(["audit", "rebut", "rule", "fix", "watch", "judge"]),
  ...phaseMeasurement,
})
const storedReports = z.strictObject({
  audit: z.literal(true),
  vets: z.array(capabilityTag),
  rebut: z.boolean(),
  rule: z.boolean(),
})
const commonRoundData = z.strictObject({
  target: z.string().min(1),
  round: z.number().int().positive(),
  tag: capabilityTag,
  started: z.string().min(1),
  status: roundStatus,
  settings: z.strictObject({
    /** The round's panel: every vetter that judges its audit report. */
    vetters: z.array(modelSelection.extend({ assistant })).min(1),
    /**
     * The work class's ruler, which names the winners of contests and splits on
     * C or D findings. Entries written before the ruler existed carry none.
     */
    ruler: modelSelection.extend({ assistant }).optional(),
    fix: modelSelection.extend({ assistant }),
  }),
  auditor: modelSelection.extend({
    assistant,
    chosenBy: z.enum(["settings", "--first", "--auditor", "command-line"]),
    /**
     * The selection the audit launched on, with its alias resolved at startup.
     * The series rules match it against each listed auditor, because the CLI may report
     * another model or effort than it was asked for. Entries written before it
     * was recorded carry none and match by the reported selection.
     */
    seat: z.strictObject({ model: z.string().min(1), effort }).optional(),
  }),
  phases: z.array(z.union([vetPhaseEntry, phaseEntry])),
  /** Report results admitted into this entry. Older rounds cannot continue. */
  reports: storedReports.optional(),
  commits: z.array(
    z.strictObject({
      repository,
      sha: fullCommit,
    }),
  ),
  findings: z.array(roundFindingSchema),
  /** New automatic rounds retain the resolved ordered auditor list used for this answer. */
  pool: z.array(seriesPoolEntry).min(1).optional(),
  /** Historical field name retained because replay reads the stored corpus. */
  judge: seriesAnswerSchema,
})

/** One open deferral as its owner reads it from Git, with the full commit ID that cites it. */
const openDeferral = z.strictObject({
  deferringRepository: repository,
  sha: fullCommit,
  position: z.number().int().positive(),
  tier: z.enum(["a", "b", "c", "d"]),
  destination: z.string().min(1),
  title: z.string().min(1),
})

export const planningRoundDataSchema = commonRoundData.extend({
  phase: z.enum(["widening", "detailing"]),
  settling: z.string(),
  /**
   * The open deferrals a chained round judged, which its fix receives when the
   * round continues. Only a chained round holds them.
   */
  deferrals: z.array(openDeferral).optional(),
})
export const implementationRoundDataSchema = commonRoundData.extend({
  scope: z.string().min(1),
  judgedRepos: z.array(repository),
  /**
   * The open deferrals into Repo Edu its audit received, an empty list
   * included, which its fix receives when the round continues.
   */
  deferrals: z.array(openDeferral).optional(),
})
export const commitRoundDataSchema = commonRoundData.extend({
  originalGroups: z.array(commitGroup).min(1),
  groups: z.array(auditedCommitGroup).min(1),
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
const attachedRuling = z.strictObject({
  ...commonDisprovedFinding,
  target: z.string().min(1),
  round: z.number().int().positive(),
  finding: z.number().int().positive(),
})
const auditRulingSchema = z.union([
  attachedRuling.extend({
    side: z.enum(["finding", "vet"]).optional(),
  }),
  attachedRuling.extend({ revision: capabilityTag }),
  z.strictObject({
    ...commonDisprovedFinding,
    auditor: z.strictObject({
      model: z.string().min(1),
      effort,
    }),
  }),
])
const implementationFindingSchema = z.strictObject({
  ...commonDisprovedFinding,
  coder: z.strictObject({
    model: z.string().min(1),
    effort,
  }),
  tier: z.enum(["A", "B", "C", "D"]),
})
export const disprovedFindingSchema = z.union([
  auditRulingSchema,
  implementationFindingSchema,
])
const planningRoundFileSchema = z.strictObject({
  rounds: z.array(planningRoundDataSchema),
  disproved: z.array(auditRulingSchema),
})
const implementationRoundFileSchema = z.strictObject({
  rounds: z.array(implementationRoundDataSchema),
  disproved: z.array(disprovedFindingSchema),
})
const commitRoundFileSchema = z.strictObject({
  rounds: z.array(commitRoundDataSchema),
})
const roundDataFilenamePattern = /-(?:plan|impl)-rounds\.json$/

/** A plan whose stem starts with commit- still owns its plan and implementation files. */
function isCommitRoundFile(name: string): boolean {
  return (
    !roundDataFilenamePattern.test(name) &&
    /^commit-.+-rounds\.json$/.test(name)
  )
}

/**
 * The one file name shared by round-data writers and readers: a plan's
 * planning or implementation file under its stem, or a commit series' file under its label.
 */
export function roundDataFilename(
  name: string,
  kind: RoundKind | "series",
): string {
  return kind === "series"
    ? `${name}-rounds.json`
    : `${name}-${kind === "planning" ? "plan" : "impl"}-rounds.json`
}

export type RoundFindingLocation = z.infer<typeof roundFindingLocationSchema>
export type RoundFinding = z.infer<typeof roundFindingSchema>
export type SeriesAnswer = NonNullable<z.infer<typeof seriesAnswerSchema>>
export type SeriesDecision = SeriesAnswer["answer"]
export type RoundFindingReview = z.infer<typeof roundFindingReviewSchema>
/** A finding admitted from an audit result in the current rating form. */
export type ReportFinding = Omit<
  RoundFinding,
  | "reach"
  | "rarity"
  | "reviews"
  | "ruling"
  | "outcome"
  | "finalTier"
  | "finalReach"
  | "finalRarity"
> & {
  readonly number: number
  readonly reach: FindingRatings["reach"]
  readonly rarity: FindingRatings["rarity"]
}
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
type RetainedCommitRoundData = {
  readonly file: string
  readonly label: string
  readonly rounds: readonly CommitRoundData[]
}
export type ModelTokenUsage = z.infer<typeof tokenUsage>
export type LandedCommit = RoundData["commits"][number]

/** One verdict from a vet phase result. */
export type FindingReview = {
  readonly number: number
  readonly tier: RoundFinding["tier"]
  readonly verdict: VetVerdict
  readonly revisedTier?: RoundFinding["tier"]
}

/** One answer from a rebuttal phase result, naming the vetter it answers. */
export type FindingRebuttal = {
  readonly number: number
  readonly tier: RoundFinding["tier"]
  /** The answered vetter's tag, which its vet phase entry and vet report name carry too. */
  readonly vet: string
  readonly answer: RebuttalAnswer
}

/** One vetter of the panel and the verdicts its vet report gave, in panel order. */
export type PanelVet = {
  /** The vetter's tag, which its vet phase entry and vet report name carry too. */
  readonly vet: string
  readonly reviews: readonly FindingReview[]
}

export type StoredReports = Readonly<{
  audit: true
  vets: readonly string[]
  rebut: boolean
  rule: boolean
}>

export type RoundAccount = {
  readonly settling: string
  readonly judgedRepos: readonly Repository[]
  readonly findings: readonly RoundFinding[]
  readonly reports?: StoredReports
}

type FindingRecord = {
  readonly repository: Repository
  readonly subject: string
  readonly message: string
}

/** Find retained round data in the round folder and inside closed-plan archives. */
export async function roundDataFiles(roots: RoundDataRoots): Promise<string[]> {
  const active = (await readdir(roots.roundRoot, { withFileTypes: true }))
    .filter(
      (entry) => entry.isFile() && roundDataFilenamePattern.test(entry.name),
    )
    .map((entry) => join(roots.roundRoot, entry.name))
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
  roots: RoundDataRoots,
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

/**
 * Read live and archived commit series. Each archive folder holds its label's
 * file. Loose files in the archive root are recovered evidence and stay out.
 */
export async function readAllCommitRoundData(
  roots: Pick<RoundDataRoots, "roundRoot">,
  archiveRoot: string,
): Promise<readonly RetainedCommitRoundData[]> {
  const active = (await readdir(roots.roundRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isCommitRoundFile(entry.name))
    .map((entry) => join(roots.roundRoot, entry.name))
  let folders: string[] = []
  try {
    folders = (await readdir(archiveRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const archived = (
    await Promise.all(
      folders.map(async (label) => {
        const name = roundDataFilename(label, "series")
        if (!isCommitRoundFile(name)) return []
        const file = join(archiveRoot, label, name)
        try {
          return (await stat(file)).isFile() ? [file] : []
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
          throw error
        }
      }),
    )
  ).flat()
  const files = [...active, ...archived].sort(
    (first, second) =>
      basename(first).localeCompare(basename(second)) ||
      first.localeCompare(second),
  )
  return Promise.all(
    files.map(async (file) => {
      const name = basename(file)
      const label = name.slice(0, -"-rounds.json".length)
      const source = JSON.parse(await readFile(file, "utf8"))
      return { file, label, rounds: commitRoundFileSchema.parse(source).rounds }
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

/**
 * Read one active commit series' checked data file by its label,
 * or no rounds before the series' first round has written it.
 */
export async function readSeriesRoundData(
  roots: Pick<RoundDataRoots, "roundRoot">,
  label: string,
): Promise<readonly CommitRoundData[]> {
  const path = join(roots.roundRoot, roundDataFilename(label, "series"))
  let source: string
  try {
    source = await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
  return commitRoundFileSchema.parse(JSON.parse(source)).rounds
}

/**
 * The stored entry of one round in its round data file, or null when the file
 * or the entry does not exist, as for a round whose runner was killed.
 */
export async function readStoredRound(
  file: string,
  target: string,
  round: number,
): Promise<RoundData | null> {
  let source: string
  try {
    source = await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
  return (
    parseRoundDataFile(file, source).rounds.find(
      (entry) => entry.target === target && entry.round === round,
    ) ?? null
  )
}

/**
 * Whether a round stopped early: it failed, was interrupted or waits for a
 * ruling. A rerun continues such a round, and a rerun of a plan's range list
 * goes on at the range that holds one.
 */
export function stoppedEarly(entry: Pick<RoundData, "status">): boolean {
  return (
    entry.status === "failed" ||
    entry.status === "interrupted" ||
    entry.status === "awaiting-ruling"
  )
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
 * Whether two vetters of a panel split on one finding: their verdict words
 * differ, or both revise and the rebuttal does not agree with both. Two
 * revisions the rebuttal agrees with leave the fix to pick one correction,
 * because the runner cannot compare two corrections. Two vetters that both send
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

/** Whether any two vetters of the finding's panel split on it. */
export function findingSplit(reviews: readonly RoundFindingReview[]): boolean {
  return reviews.some((first, index) =>
    reviews.slice(index + 1).some((second) => reviewsSplit(first, second)),
  )
}

/** The recorded revision that an attached later ruling names. */
export function findingRevision(
  finding: RoundFinding,
  tag: string,
): RoundFindingReview {
  const revision = finding.reviews.find(
    (review) => review.vet === tag && review.verdict === "revise",
  )
  if (revision === undefined)
    throw new Error(
      `Vetter ${tag} gave no revision on finding ${finding.number}.`,
    )
  return revision
}

/** The finding groups in report order for every work class. */
export const tierRanges = ["A/B", "C"] as const
export type TierRange = (typeof tierRanges)[number]

export function tierWithin(
  tier: RoundFinding["tier"],
  range: TierRange,
): boolean {
  return range === "A/B" ? tier === "A" || tier === "B" : tier === "C"
}

/**
 * The highest tier the audit report or a vetter of the panel gave the finding.
 * The winner rule and the vetter comparison both grade a finding by it, so one
 * side alone cannot lower a finding out of the user's reach.
 */
export function highestGrade(
  finding: Pick<RoundFinding, "tier" | "reviews">,
): RoundFinding["tier"] {
  return finding.reviews.reduce(
    (highest, review) =>
      review.revisedTier !== undefined && review.revisedTier < highest
        ? review.revisedTier
        : highest,
    finding.tier,
  )
}

/** Attach the current panel's verdicts and answers by finding number and vetter tag. */
export function reviewedRoundFindings(
  findings: readonly (ReportFinding | RoundFinding)[],
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
  return findings.map((finding) => {
    // A stored winner is restored only after the reviews it judged are kept.
    const { ruling: _ruling, ...base }: Omit<RoundFinding, "reviews"> =
      "reviews" in finding
        ? finding
        : {
            ...finding,
            outcome: null,
            finalTier: null,
            finalReach: null,
            finalRarity: null,
          }
    const { number } = base
    if (number === null) return { ...base, reviews: [] }
    return {
      ...base,
      reviews: readings.flatMap(({ vet, reviews, answers }) => {
        const review = reviews.get(number)
        if (review === undefined) return []
        return [
          {
            vet,
            verdict: review.verdict,
            ...(review.revisedTier === undefined
              ? {}
              : { revisedTier: review.revisedTier }),
            answer: answers.get(number) ?? null,
          },
        ]
      }),
    }
  })
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

/** Key a record bullet by its audit report finding number, or by title when it lands none. */
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
          rarity: finding.rarity,
          ...(finding.harm === undefined ? {} : { harm: finding.harm }),
          complexity: finding.complexity,
          growthPattern: finding.growthPattern,
          location: recordLocation(finding, record.repository),
          reviews: [],
          outcome: "unmatched",
          finalTier: null,
          finalReach: null,
          finalRarity: null,
        },
        repositories: new Set([record.repository]),
      })
    }
  }
  return recorded
}

/**
 * Join the fix's durable record bullets to audit report findings by finding
 * number. A numbered bullet lands the audit report finding it names, whatever
 * its title; a bullet without a number records work no audit report finding
 * asked for.
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
        `Record finding number names no audit report finding: ${finding.number}`,
      )
  const settled = findings.map((finding): RoundFinding => {
    const final = recorded.get(recordKey(finding))?.finding
    if (final === undefined) return { ...finding, outcome: "dropped" }
    return {
      ...finding,
      outcome: "kept",
      finalTier: final.tier === finding.tier ? null : final.tier,
      finalReach: final.reach === finding.reach ? null : final.reach,
      finalRarity: final.rarity === finding.rarity ? null : final.rarity,
    }
  })
  return [
    ...settled,
    ...[...recorded.values()]
      .map(({ finding }) => finding)
      .filter((finding) => finding.number === null),
  ]
}

function fileSchema(path: string) {
  if (path.endsWith("-plan-rounds.json")) return planningRoundFileSchema
  if (path.endsWith("-impl-rounds.json")) return implementationRoundFileSchema
  if (isCommitRoundFile(basename(path))) return commitRoundFileSchema
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
  const series = isCommitRoundFile(basename(path))
  const matches = path.endsWith("-plan-rounds.json")
    ? "phase" in data
    : path.endsWith("-impl-rounds.json")
      ? "scope" in data
      : "originalGroups" in data
  if (!matches) throw new Error(`Round data kind does not match ${path}`)
  let file: RoundDataFile = series
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
    series
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
 * changes which side was wrong. A detached ruling or implementation finding
 * names a model and no retained finding, so separate entries never match.
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
  if (isCommitRoundFile(basename(path)))
    throw new Error("Series round data has no disproved findings")
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

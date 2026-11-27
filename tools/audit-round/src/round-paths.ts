import { createHash } from "node:crypto"
import { readdir } from "node:fs/promises"
import { basename, join } from "node:path"
import type { ExecutionContext } from "./context.js"
import { roundDataFilename } from "./round-data.js"
import { tagPatternSource } from "./subject.js"
import {
  type AuditTarget,
  type CommitGroup,
  type CommitTarget,
  planPhase,
  planStem,
  type RoundKind,
} from "./target.js"

type NamingTarget = ExecutionContext & AuditTarget

/**
 * A plan round's target names its kind with the commit role its records use.
 * Step files keep the step role `impl-<n>`, so a sorted file list holds
 * implementation steps, implementation audits and plan audits in three groups.
 */
const planTargetRole = {
  planning: "plan-audit",
  implementation: "impl-audit",
} as const satisfies Record<RoundKind, string>

/** The round kind a plan's stored target names, or null for any other target. */
export function planTargetKind(stem: string, target: string): RoundKind | null {
  if (target === `${stem}-${planTargetRole.planning}`) return "planning"
  if (target.startsWith(`${stem}-${planTargetRole.implementation}-`))
    return "implementation"
  return null
}

const phaseOrder = {
  round: 1,
  audit: 2,
  vet: 3,
  rebut: 4,
  fix: 5,
  rule: 6,
  ruling: 7,
  glance: 8,
  watch: 9,
} as const

export type FileKind = Exclude<keyof typeof phaseOrder, "fix" | "glance">

/** Tagless phase-change markers that take a round number so they sort among the rounds. */
export type MarkerKind = "settle" | "reopen"

export function phaseFilename(
  nameStart: string,
  kind: FileKind,
  tag: string,
): string {
  return `${nameStart}-${phaseOrder[kind]}-${kind}.${tag}`
}

function readPhaseFilename(name: string): {
  nameStart: string
  kind: FileKind
  tag: string
  extension: "md" | "log"
} | null {
  const match = new RegExp(
    `^(.+-\\d{2,})-(\\d)-(round|audit|vet|rebut|rule|ruling|watch)\\.(${tagPatternSource})\\.(md|log)$`,
  ).exec(name)
  if (match === null) return null
  const kind = match[3] as FileKind
  if (
    Number(match[2]) !== phaseOrder[kind] ||
    (match[5] === "log" && kind !== "round")
  )
    return null
  return {
    nameStart: match[1],
    kind,
    tag: match[4],
    extension: match[5] as "md" | "log",
  }
}

/** The name shared by a step's log, transcript and ruling. */
export function stepOutputName(stem: string, step: number): string {
  return `${stem}-impl-${String(step).padStart(2, "0")}-implement`
}

/** The ruling one implementation worker writes for its step. */
export function stepRulingFilename(
  stem: string,
  step: number,
  tag: string,
): string {
  return `${stepOutputName(stem, step)}-ruling.${tag}.md`
}

/**
 * The log every split call of one source file appends to, under the series'
 * label. It carries no tag, because settings may change the designer between
 * calls and each call's opening records the model.
 */
export function splitLogFilename(label: string): string {
  return `${label}-split.log`
}

/** Each source numbers its answers across all designers and calls. */
export function answerNumber(number: number): string {
  return String(number).padStart(2, "0")
}

export function designFilename(
  label: string,
  number: number,
  tag: string,
): string {
  return `${label}-design-${answerNumber(number)}.${tag}.md`
}

export function readDesignFilename(name: string) {
  return readSplitFilename(name, "design")
}

export function readSplitFilename(name: string, kind: "design" | "pick") {
  const match = new RegExp(
    `^(split-.+)-${kind}-(\\d{2,})\\.(${tagPatternSource})\\.md$`,
  ).exec(name)
  return match === null
    ? null
    : { label: match[1], number: Number(match[2]), tag: match[3] }
}

export function designsFilename(label: string): string {
  return `${label}-designs.json`
}

export function pickFilename(
  label: string,
  number: number,
  tag: string,
): string {
  return `${label}-pick-${answerNumber(number)}.${tag}.md`
}

/** The log one loop-close keeps. */
export function closeLogFilename(stem: string, tag: string): string {
  return `${stem}-close.${tag}.log`
}

function escapedPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Whether a file in the round folder belongs to one plan: a claim, marker,
 * phase file or queue of its plan or implementation audits, a step log,
 * transcript or ruling, a close log, a handoff or a yield report. Every form is read
 * whole past the stem, never as a bare `<stem>-` prefix, so a plan whose stem
 * extends this one never matches. The plan's round data is no such file,
 * because the close archives it beside the plan.
 */
export function planRoundFile(stem: string, name: string): boolean {
  const prefix = escapedPattern(stem)
  const target = `${prefix}-(?:${planTargetRole.planning}|${planTargetRole.implementation}-\\d{2,}\\.\\.\\d{2,})`
  const phase = readPhaseFilename(name)
  if (phase !== null)
    return new RegExp(`^${target}-\\d{2,}$`).test(phase.nameStart)
  return new RegExp(
    `^(?:${[
      `${target}-\\d{2,}-0-(?:claim|settle|reopen)\\.md`,
      `${target}-queue\\.md`,
      `${prefix}-impl-\\d{2,}-implement(?:\\.(?:log|md)|-ruling\\.${tagPatternSource}\\.md)`,
      `${prefix}-close\\.${tagPatternSource}\\.log`,
      `${prefix}-handoff\\.[0-9a-f]{6,}\\.md`,
      `${prefix}-yield-\\d-[a-z]+\\.${tagPatternSource}\\.md`,
    ].join("|")})$`,
  ).test(name)
}

/**
 * Match a commit series' round files and round data by its full label.
 */
export function seriesFile(label: string, name: string): boolean {
  if (name === roundDataFilename(label, "series")) return true
  const prefix = escapedPattern(label)
  const phase = readPhaseFilename(name)
  if (phase !== null)
    return new RegExp(`^${prefix}-\\d{2,}$`).test(phase.nameStart)
  return new RegExp(
    `^${prefix}-(?:\\d{2,}-0-claim|queue|handoff\\.[0-9a-f]{6,})\\.md$`,
  ).test(name)
}

/**
 * The evidence folder for completed commit series.
 */
export function seriesArchiveRoot(evidenceRoot: string): string {
  return join(evidenceRoot, "commits")
}

/** The folder that holds one finished commit series under its label. */
export function seriesArchiveFolder(
  evidenceRoot: string,
  label: string,
): string {
  return join(seriesArchiveRoot(evidenceRoot), label)
}

/** The bounded label that owns one commit series and its retained evidence. */
export function commitTargetLabel(target: CommitTarget): string {
  const groupLabel = (group: CommitGroup): string => {
    const first = group.commits[0].slice(0, 6)
    const last = group.commits.at(-1)?.slice(0, 6)
    return group.commits.length === 1 ? first : `${first}..${last}`
  }
  return `commit-${target.originalGroups.map(groupLabel).join("+")}`
}

/**
 * The label that owns a source file's split evidence: `split-`,
 * the source file's percent-encoded name and the first five characters of the
 * SHA-256 of its path. It leaves the folders out, so a commit subject reaches
 * its role and tags early in a one-line log. The hash tells same-named files
 * apart: two paths share a label only when the name and the five characters
 * both agree. The encoding keeps the label one token with no path separator.
 */
export function splitLabel(source: string): string {
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 5)
  return `split-${encodeURIComponent(basename(source))}-${hash}`
}

/** The folder in the evidence checkout that holds one source file's split files. */
export function splitFolder(evidenceRoot: string, label: string): string {
  return join(evidenceRoot, "splits", label)
}

/** The bounded label that owns one target's round files and round data. */
export function targetLabel(target: AuditTarget): string {
  // Keep list filenames bounded; the title and phase arguments carry every reference.
  if ("groups" in target) return commitTargetLabel(target)
  const stem = planStem(target.plan)
  if (target.roundKind === "planning")
    return `${stem}-${planTargetRole.planning}`
  // Padded `first..last` scopes sort the same in `ls` and Finder and keep the
  // round and phase numbers aligned, since a single step is a one-step range.
  const [first, last = first] = target.scope
    .split("-")
    .map((step) => step.padStart(2, "0"))
  return `${stem}-${planTargetRole.implementation}-${first}..${last}`
}

async function targetDescription(target: NamingTarget): Promise<{
  label: string
  title: string
}> {
  return {
    label: targetLabel(target),
    title:
      "groups" in target
        ? `Commit audit of ${target.groups.flatMap((group) => group.references).join(" ")}`
        : roundSubject(target, target.plan),
  }
}

export function stepScopeText(scope: string): string {
  return `${scope.includes("-") ? "steps" : "step"} ${scope}`
}

/**
 * The round's kind and scope around one plan name. The transcript title names
 * the plan by its path and a series message by its stem, through this one
 * phrase so the two cannot drift.
 */
export function roundSubject(
  target: Extract<AuditTarget, { plan: unknown }>,
  plan: string,
): string {
  if (target.roundKind === "planning") return `Plan audit of ${plan}`
  return `Implementation audit of ${plan}, ${stepScopeText(target.scope)}`
}

/**
 * Every number a target's files in the round folder carry: a claim, a phase
 * file or a settle or reopen marker, which takes a number of its own.
 */
async function numberedFiles(
  context: Pick<ExecutionContext, "roundRoot">,
  target: string,
): Promise<readonly { readonly number: number; readonly marker: boolean }[]> {
  const files = await readdir(context.roundRoot, { withFileTypes: true })
  return files
    .filter((file) => file.isFile())
    .map((file) => file.name)
    .filter((name) => name.startsWith(`${target}-`))
    .map((name) => {
      const suffix = name.slice(target.length + 1)
      const claim = /^(\d{2,})-0-(claim|settle|reopen)\.md$/.exec(suffix)
      if (claim !== null)
        return { number: Number(claim[1]), marker: claim[2] !== "claim" }
      const parsed = readPhaseFilename(name)
      const number = parsed?.nameStart.slice(target.length + 1)
      return {
        number:
          number !== undefined && /^\d{2,}$/.test(number) ? Number(number) : 0,
        marker: false,
      }
    })
}

function highestNumber(
  entries: readonly { readonly number: number }[],
): number {
  return Math.max(0, ...entries.map((entry) => entry.number))
}

/**
 * Read every retained numbered kind in the round folder; opening the run
 * claims the candidate round. The marker is the number the target's latest
 * settle or reopen marker took, or zero before its first one.
 */
async function nextRound(
  context: ExecutionContext,
  target: string,
): Promise<{ round: number; marker: number }> {
  const numbered = await numberedFiles(context, target)
  const round = highestNumber(numbered) + 1
  if (!Number.isSafeInteger(round))
    throw new Error(`Round number exhausted for ${target}`)
  return {
    round,
    marker: highestNumber(numbered.filter((entry) => entry.marker)),
  }
}

/**
 * The number of a target's newest round, or null before its first. A settle or
 * reopen marker takes a number but is no round.
 */
export async function newestRound(
  context: Pick<ExecutionContext, "roundRoot">,
  target: string,
): Promise<number | null> {
  const newest = highestNumber(
    (await numberedFiles(context, target)).filter((entry) => !entry.marker),
  )
  return newest === 0 ? null : newest
}

/**
 * How a title names its round. Every title carries the file number, because
 * the round's files, its round data and a later `disprove` are keyed by it. A
 * planning round first counts from the latest phase marker, which took a
 * number of its own, so the title says how far the plan's current phase is.
 */
function roundNumbers(
  target: AuditTarget,
  round: number,
  marker: number,
): string {
  return target.roundKind === "planning"
    ? `${planPhase(target.plan)} round ${round - marker}, file round ${round}`
    : `round ${round}`
}

/**
 * Both entry routes allocate through the same target and retained-file rules.
 * A continued round keeps the number it claimed, so its title counts from the
 * latest marker before it.
 */
export async function roundIdentity(
  setup: NamingTarget,
  kept?: number,
): Promise<{ nameStart: string; title: string }> {
  const target = await targetDescription(setup)
  const { round, marker } =
    kept === undefined
      ? await nextRound(setup, target.label)
      : {
          round: kept,
          marker: highestNumber(
            (await numberedFiles(setup, target.label)).filter(
              (entry) => entry.marker && entry.number < kept,
            ),
          ),
        }
  return {
    nameStart: `${target.label}-${String(round).padStart(2, "0")}`,
    title: `${target.title} (${roundNumbers(setup, round, marker)})`,
  }
}

/**
 * A phase-change marker claims the plan target's next number, so the file list
 * shows where a settle or reopen fell among the rounds without opening a file.
 */
export async function markerPath(
  context: ExecutionContext,
  plan: string,
  kind: MarkerKind,
): Promise<string> {
  const { nameStart } = await roundIdentity({
    ...context,
    roundKind: "planning",
    plan,
  })
  return join(context.roundRoot, `${nameStart}-0-${kind}.md`)
}

/** The editable list of auditors still to run on this target, beside its rounds. */
export async function queueFile(setup: NamingTarget): Promise<string> {
  return join(
    setup.roundRoot,
    `${(await targetDescription(setup)).label}-queue.md`,
  )
}

/** The transcript's target and round number, which start every file of its round. */
export function transcriptNameStart(transcript: string): string {
  const parsed = readPhaseFilename(basename(transcript))
  if (parsed?.kind !== "round" || parsed.extension !== "md")
    throw new Error(
      "Name a round's *-1-round.<tag>.md transcript in the evidence checkout's active folder.",
    )
  return parsed.nameStart
}

/** The writer's tag a round document's name carries. */
export function documentTag(document: string): string {
  const parsed = readPhaseFilename(basename(document))
  if (parsed === null)
    throw new Error(
      `A round document's name carries no writer tag: ${document}`,
    )
  return parsed.tag
}

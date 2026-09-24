import type { CleanInput } from "./clean.js"
import type { ExecutionContext } from "./context.js"
import type { WatchEvidenceInput } from "./episode.js"
import type { GlanceDecision, GlanceInput } from "./glance.js"
import type { AuditReport, ReportFindings } from "./report.js"
import type { RoundSettings } from "./settings.js"

export type Assistant = "claude" | "codex"

/** The letter a commit subject's capability tag opens with, naming the vendor. */
export const assistantLetters: Record<Assistant, "a" | "o"> = {
  claude: "a",
  codex: "o",
}

export type Phase =
  | "audit"
  | "vet"
  | "rebut"
  | "fix"
  | "brief"
  | "watch"
  | "watch-edit"

/** Launcher ownership is independent of the files a phase reads or writes. */
const launcherRoots: Record<Phase, "cwd" | "repoEduRoot"> = {
  audit: "cwd",
  vet: "cwd",
  rebut: "cwd",
  fix: "cwd",
  brief: "repoEduRoot",
  watch: "repoEduRoot",
  "watch-edit": "repoEduRoot",
}

export function phaseOwnerRoot(
  input: ExecutionContext & { phase: Phase },
): string {
  return input[launcherRoots[input.phase]]
}

/** The model tiers a round may ask its auditor for, as the command line names them. */
export const strengths = ["base", "top"] as const
export type Strength = (typeof strengths)[number]

/** The reasoning efforts a round may ask for. Both CLIs answer to these four words. */
export const efforts = ["low", "medium", "high", "xhigh"] as const
export type Effort = (typeof efforts)[number]

/**
 * What the command line asked of the auditor's phases. `cli` bypasses phase
 * settings; a null tag field follows settings.json, then the CLI. The rebuttal
 * resumes the audit session, so the override binds both phases: one thread
 * cannot change model half way through.
 */
export type AuditorOverride =
  | "cli"
  | {
      readonly strength: Strength | null
      readonly effort: Effort | null
    }

/** An auditor the command line said nothing about, which every other phase is. */
export const noOverride: AuditorOverride = { strength: null, effort: null }

/**
 * The letter a capability tag gives a strength: `b` for the base tier and `t`
 * for the top one. A model the ladder does not name reads `u`, unlisted.
 */
export const strengthLetters: Record<Strength, "b" | "t"> = {
  base: "b",
  top: "t",
}

/** The letter a capability tag closes with, naming the reasoning effort. */
const effortLetters: Record<Effort, "l" | "m" | "h" | "x"> = {
  low: "l",
  medium: "m",
  high: "h",
  xhigh: "x",
}

/** What `--auditor` names: who audits, and whatever it pinned of the model. */
export type AuditorSeat = {
  readonly assistant: Assistant
  readonly override: AuditorOverride
}

function named<K extends string>(
  letters: Record<K, string>,
  letter: string | undefined,
): K | null {
  if (letter === undefined) return null
  const keys = Object.keys(letters) as K[]
  return keys.find((key) => letters[key] === letter) ?? null
}

/**
 * Assistant names inherit both CLI settings. Capability tags may name a tier
 * and effort; unnamed fields follow settings.json, then the CLI. The three
 * alphabets share no letter, so a partial tag says
 * which fields it named. The `u` a subject may carry says the model is on
 * neither tier, which is a reading and not a request, so it is not accepted.
 */
export function parseAuditor(value: string): AuditorSeat | null {
  if (value === "claude" || value === "codex")
    return { assistant: value, override: "cli" }
  const match = /^([ao])([bt])?([lmhx])?$/.exec(value)
  if (match === null) return null
  const assistant = named(assistantLetters, match[1])
  if (assistant === null) return null
  return {
    assistant,
    override: {
      strength: named(strengthLetters, match[2]),
      effort: named(effortLetters, match[3]),
    },
  }
}

/** The tag letter a reported effort takes, or null when it is not one of the four. */
export function effortLetter(effort: string): string | null {
  // A CLI may report an effort outside the four the tag can spell.
  return effortLetters[effort as Effort] ?? null
}

/**
 * Which strength a reported model belongs to, or null when it belongs to
 * neither. The table names a family and a CLI reports one release of it, so a
 * reported `claude-opus-5` answers to the `opus` entry.
 */
export function modelStrength(
  assistant: Assistant,
  model: string,
  config: RoundSettings,
): Strength | null {
  return (
    strengths.find((strength) =>
      model.includes(config.strengthModels[assistant][strength]),
    ) ?? null
  )
}

/** One named field of a phase's selection, with what named it. */
export type PinnedField = {
  readonly value: string
  /** What named the field, as the run's settings header prints it. */
  readonly source: string
}

/**
 * What a phase names for itself. A null field runs on whatever the phase's CLI
 * is configured to use, so one phase can take its model from the command line
 * and its effort from the assistant's own settings.
 */
export type PinnedModel = {
  readonly model: PinnedField | null
  readonly effort: PinnedField | null
}

/** Who fills one phase of a round, and what that phase runs on. */
export type PhaseRun = {
  readonly assistant: Assistant
  readonly model: PinnedModel
}

/** A phase that names nothing, which every phase outside the two below is. */
export const unpinned: PinnedModel = { model: null, effort: null }

/**
 * Command-line fields override the audit settings, which rebuttal shares.
 * Other fields use the configured phase selection or inherit from the CLI.
 */
function phaseModel(
  phase: Phase,
  assistant: Assistant,
  override: AuditorOverride,
  config: RoundSettings,
): PinnedModel {
  const configuredPhase = phase === "rebut" ? "audit" : phase
  const pin =
    configuredPhase === "audit" || configuredPhase === "vet"
      ? config.phases[configuredPhase][assistant]
      : config.phases[configuredPhase]
  const field = (value: string | null): PinnedField | null =>
    value === null ? null : { value, source: "settings.json" }
  if (configuredPhase !== "audit")
    return { model: field(pin.model), effort: field(pin.effort) }
  if (override === "cli") return unpinned
  return {
    model:
      override.strength !== null
        ? {
            value: config.strengthModels[assistant][override.strength],
            source: "--auditor",
          }
        : field(pin.model),
    effort:
      override.effort !== null
        ? { value: override.effort, source: "--auditor" }
        : field(pin.effort),
  }
}

/**
 * The single owner of who runs each phase of a round and on what. The runner
 * invokes from this value and the run's settings header prints it, so what a
 * round says it ran on is what it ran with.
 */
export function roundPhases(
  auditor: Assistant,
  override: AuditorOverride,
  config: RoundSettings,
): Record<Phase, PhaseRun> {
  const run = (phase: Phase, assistant: Assistant): PhaseRun => ({
    assistant,
    model: phaseModel(phase, assistant, override, config),
  })
  return {
    audit: run("audit", auditor),
    // The vetter is the other assistant, so no assistant vets its own report.
    vet: run("vet", auditor === "codex" ? "claude" : "codex"),
    // The rebuttal answers in the auditor, resuming the audit when it has room.
    rebut: run("rebut", auditor),
    fix: run("fix", "codex"),
    brief: run("brief", config.phases.brief.assistant),
    // The watch reads the commit record, never the round, so the auditor does not select it.
    watch: run("watch", config.phases.watch.assistant),
    "watch-edit": run("watch-edit", config.phases["watch-edit"].assistant),
  }
}

/**
 * Whether a phase's texts belong in the round transcript. Only the four phases
 * that carry out the round write into it. The brief, the ruling and the watch
 * are separate documents. The fix writes the ruling; the brief and watch
 * run afterwards without adding their text to the transcript.
 */
export function transcribed(phase: Phase): boolean {
  return (
    phase === "audit" || phase === "vet" || phase === "rebut" || phase === "fix"
  )
}

type PhaseArguments = {
  audit: {
    readonly arguments: readonly [
      report: string,
      target: string,
      ...scopeOrCommits: string[],
    ]
    readonly sessionId: null
  }
  vet: {
    readonly arguments: readonly [report: string, vet: string]
    readonly sessionId: null
  }
  rebut: {
    readonly arguments: readonly [report: string, vet: string, rebut: string]
    readonly sessionId: string | null
  }
  fix: {
    readonly arguments: readonly [report: string, ...twins: string[]]
    readonly rulingFile: string
  } & (
    | { readonly sessionId: null; readonly rulingReply?: never }
    | {
        readonly sessionId: string
        readonly rulingReply: string
      }
  )
  brief: {
    readonly arguments: readonly [transcript: string, brief: string]
    readonly sessionId: null
  }
  watch: {
    readonly evidence: string
    readonly arguments: readonly [watch: string, cacheRoot: string]
    readonly sessionId: null
  }
  /** Both watch passes receive the same evidence separately from their file arguments. */
  "watch-edit": {
    readonly evidence: string
    readonly arguments: readonly [watch: string]
    readonly sessionId: null
  }
}

type PhaseInputs = {
  [K in Phase]: PhaseArguments[K] &
    PhaseRun &
    ExecutionContext & {
      readonly phase: K
    }
}

export type PhaseInput<P extends Phase = Phase> = PhaseInputs[P]

export type PhaseFailure = {
  readonly status: "failed"
  readonly reason: string
  readonly sessionId: string | null
}

/** One measurement of how full an assistant's session is. */
export type SessionContext = {
  readonly tokens: number
  /** Null when the assistant does not report the size of its window. */
  readonly window: number | null
}

type ReportResult = {
  readonly status: "finished"
  readonly sessionId: string
  /** The session's last measurement, which decides whether a later phase may resume it. */
  readonly context: SessionContext | null
}

type FixResult = {
  readonly status: "finished" | "needs-ruling"
  readonly sessionId: string
}

type PhaseResults = {
  audit: ReportResult
  vet: ReportResult
  rebut: ReportResult
  fix: FixResult
  brief: ReportResult
  watch: ReportResult
  "watch-edit": ReportResult
}

/** Internal results, admitted only after the complete invocation has settled. */
export type PhaseResult<P extends Phase = Phase> =
  | PhaseFailure
  | PhaseResults[P]

/**
 * A session the user is handed or told how to resume. It carries its phase's run, so
 * a resumed session continues on the model the round ran it on.
 */
export type InteractiveSession = PhaseRun &
  ExecutionContext & {
    readonly sessionId: string
  }

export type RoundDependencies = {
  readonly closeRound: (cwd: string, nameStart: string) => Promise<void>
  readonly checkFile: (file: string) => Promise<void>
  /** Prints the saved brief after its phase and output validation have completed. */
  readonly showBrief: (document: string) => Promise<void>
  readonly completeClean: (input: CleanInput) => Promise<void>
  readonly readReport: (
    file: string,
    kind: ExecutionContext["roundKind"],
  ) => Promise<AuditReport>
  readonly readVet: (file: string, findings: ReportFindings) => Promise<boolean>
  readonly readHead: (root: string) => Promise<string>
  readonly readSubjects: (
    root: string,
    before: string,
  ) => Promise<readonly string[]>
  readonly runPhase: {
    readonly [P in Phase]: (input: PhaseInput<P>) => Promise<PhaseResult<P>>
  }
  /**
   * The glance that decides whether the watch runs. It reads the commit record
   * and the watch's own history, never the round, and rejects when the record
   * cannot be read at all.
   */
  readonly glance: (input: GlanceInput) => Promise<GlanceDecision>
  readonly watchEvidence: (input: WatchEvidenceInput) => Promise<string>
  /** Displays the ruling and records a reply; null stops without submitting a draft. */
  readonly requestRuling: (document: string) => Promise<string | null>
}

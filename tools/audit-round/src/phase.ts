import type { ExecutionContext } from "./context.js"
import type { GlanceDecision, GlanceInput } from "./glance.js"
import type { ReportFindings } from "./report.js"

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
  | "rule"
  | "rule-edit"
  | "watch"
  | "watch-edit"

/**
 * The severity tier a finished fix recorded, lowercased from the record's
 * sequence. Null means the round landed a clean record.
 */
export type Tier = "a" | "b" | "c" | "d"

/** The model tiers a round may ask its auditor for, as the command line names them. */
export const strengths = ["base", "top"] as const
export type Strength = (typeof strengths)[number]

/** The reasoning efforts a round may ask for. Both CLIs answer to these four words. */
export const efforts = ["low", "medium", "high", "xhigh"] as const
export type Effort = (typeof efforts)[number]

/**
 * What the command line asked of the auditor's phases. A null field follows the
 * assistant's own configuration. The rebuttal resumes the audit session, so the
 * override binds both phases: one thread cannot change model half way through.
 */
export type AuditorOverride = {
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
export type AuditorSeat = { readonly assistant: Assistant } & AuditorOverride

function named<K extends string>(
  letters: Record<K, string>,
  letter: string | undefined,
): K | null {
  if (letter === undefined) return null
  const keys = Object.keys(letters) as K[]
  return keys.find((key) => letters[key] === letter) ?? null
}

/**
 * The capability tag `--auditor` takes, as a commit subject spells it. The tier
 * and the effort are optional, because an unnamed field follows the CLI's own
 * configuration, and the three alphabets share no letter, so a partial tag says
 * which fields it named. The `u` a subject may carry says the model is on
 * neither tier, which is a reading and not a request, so it is not accepted.
 */
export function parseAuditorTag(value: string): AuditorSeat | null {
  const match = /^([ao])([bt])?([lmhx])?$/.exec(value)
  if (match === null) return null
  const assistant = named(assistantLetters, match[1])
  if (assistant === null) return null
  return {
    assistant,
    strength: named(strengthLetters, match[2]),
    effort: named(effortLetters, match[3]),
  }
}

/** The tag letter a reported effort takes, or null when it is not one of the four. */
export function effortLetter(effort: string): string | null {
  // A CLI may report an effort outside the four the tag can spell.
  return effortLetters[effort as Effort] ?? null
}

/**
 * Which model each assistant fills a strength with. Claude takes an alias,
 * which names the latest release of a family; Codex takes a slug, which names
 * one release and is edited when a family lands.
 */
const strengthModels: Record<Assistant, Record<Strength, string>> = {
  claude: { base: "opus", top: "fable" },
  codex: { base: "gpt-5.6-sol", top: "gpt-6-astra" },
}

/**
 * Which strength a reported model belongs to, or null when it belongs to
 * neither. The table names a family and a CLI reports one release of it, so a
 * reported `claude-opus-5` answers to the `opus` entry.
 */
export function modelStrength(
  assistant: Assistant,
  model: string,
): Strength | null {
  return (
    strengths.find((strength) =>
      model.includes(strengthModels[assistant][strength]),
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
 * The phases that name their own model, whatever their CLI is configured to
 * use. The brief retells a finished transcript, so the smallest current model
 * writes it. The two edit passes re-check a draft against the logs and the
 * code before rewriting it, which is the fix's kind of work, so Codex's base
 * tier writes them. The user directed the edit pins on 2026-09-21.
 */
const phasePins: Partial<Record<Phase, { model: string; effort: string }>> = {
  brief: { model: "gpt-5.6-terra", effort: "low" },
  "rule-edit": { model: "gpt-5.6-sol", effort: "medium" },
  "watch-edit": { model: "gpt-5.6-sol", effort: "medium" },
}

/**
 * Which model a phase names. A pinned phase names its pin, the auditor's own
 * two phases take what the command line asked for and every other phase
 * names nothing.
 */
function phaseModel(
  phase: Phase,
  assistant: Assistant,
  override: AuditorOverride,
): PinnedModel {
  const pin = phasePins[phase]
  if (pin !== undefined)
    return {
      model: { value: pin.model, source: "phase pin" },
      effort: { value: pin.effort, source: "phase pin" },
    }
  if (phase !== "audit" && phase !== "rebut") return unpinned
  return {
    model:
      override.strength === null
        ? null
        : {
            value: strengthModels[assistant][override.strength],
            source: "--auditor",
          },
    effort:
      override.effort === null
        ? null
        : { value: override.effort, source: "--auditor" },
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
): Record<Phase, PhaseRun> {
  const run = (phase: Phase, assistant: Assistant): PhaseRun => ({
    assistant,
    model: phaseModel(phase, assistant, override),
  })
  return {
    audit: run("audit", auditor),
    // The vetter is the other assistant, so no assistant vets its own report.
    vet: run("vet", auditor === "codex" ? "claude" : "codex"),
    // The rebuttal answers in the auditor, resuming the audit when it has room.
    rebut: run("rebut", auditor),
    fix: run("fix", "codex"),
    // The brief retells the finished transcript for the user; Codex always writes it.
    brief: run("brief", "codex"),
    // The ruling explains an open item for the user; Claude drafts it.
    rule: run("rule", "claude"),
    // The edit passes rewrite a draft in plain words; Codex writes both.
    "rule-edit": run("rule-edit", "codex"),
    // The watch reads the commit record, never the round, so the auditor does not select it.
    watch: run("watch", "claude"),
    "watch-edit": run("watch-edit", "codex"),
  }
}

/**
 * Whether a phase's texts belong in the round transcript. Only the four phases
 * that carry out the round write into it. The brief, the ruling and the watch
 * are its twins, written for the user in their own files. All four run once
 * the transcript holds the round, so none of them may add to it.
 */
export function transcribed(phase: Phase): boolean {
  return (
    phase === "audit" || phase === "vet" || phase === "rebut" || phase === "fix"
  )
}

type PhaseArguments = {
  audit: {
    readonly arguments: readonly [
      nameStart: string,
      target: string,
      ...scopeOrCommits: string[],
    ]
    readonly sessionId: null
  }
  vet: {
    readonly arguments: readonly [report: string]
    readonly sessionId: null
  }
  rebut: {
    readonly arguments: readonly [report: string]
    readonly sessionId: string | null
  }
  fix: {
    readonly arguments: readonly [report: string]
    readonly sessionId: null
  }
  brief: {
    readonly arguments: readonly [transcript: string]
    readonly sessionId: null
  }
  rule: {
    readonly arguments: readonly [transcript: string, report: string]
    readonly sessionId: null
  }
  /** The second pass over the ruling: the draft and the sources the ruling workflow grounds it in. */
  "rule-edit": {
    readonly arguments: readonly [
      ruling: string,
      transcript: string,
      report: string,
    ]
    readonly sessionId: null
  }
  watch: {
    readonly arguments: readonly [watch: string, cacheRoot: string]
    readonly sessionId: null
  }
  /** The second pass over the watch: the draft alone, because the watch grounds itself in the record. */
  "watch-edit": {
    readonly arguments: readonly [watch: string]
    readonly sessionId: null
  }
}

type PhaseInputs = {
  [K in Phase]: PhaseArguments[K] &
    PhaseRun &
    ExecutionContext & {
      readonly phase: K
      readonly ownerRoot: string
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
  /** Absolute path validated by the assistant boundary. */
  readonly file: string
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
  rule: ReportResult
  "rule-edit": ReportResult
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
  readonly readReport: (
    file: string,
    kind: ExecutionContext["roundKind"],
  ) => Promise<ReportFindings>
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
  /** Output must be recorded and the progress display released before opening. */
  readonly prepareHandover: (session: InteractiveSession) => Promise<void>
  /** Resolves after the inherited-terminal CLI exits successfully. */
  readonly openSession: (session: InteractiveSession) => Promise<void>
}

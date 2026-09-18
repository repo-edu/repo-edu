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
  | "revise"
  | "glance"
  | "verdict"

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
 * Which model a phase names. The brief names the smallest current model
 * whatever its CLI is configured to use, and the auditor's own two phases take
 * what the command line asked for. Every other phase names nothing.
 */
function phaseModel(
  phase: Phase,
  assistant: Assistant,
  override: AuditorOverride,
): PinnedModel {
  if (phase === "brief")
    return {
      model: { value: "gpt-5.6-terra", source: "phase pin" },
      effort: { value: "low", source: "phase pin" },
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
    // The ruling explains an open item for the user, so Claude writes both passes.
    rule: run("rule", "claude"),
    // The second pass over any draft twin, so it follows whichever pass wrote one.
    revise: run("revise", "claude"),
    // The watch reads the commit record, never the round, so the auditor does not select it.
    glance: run("glance", "claude"),
    verdict: run("verdict", "claude"),
  }
}

/**
 * Whether a phase's texts belong in the round transcript. Only the four phases
 * that carry out the round write into it. The brief, the ruling and the watch
 * verdict are its twins, written for the user in their own files, and the
 * glance decides rather than reports. All five run once the transcript holds
 * the round, so none of them may add to it.
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
  /**
   * The second pass over one draft twin: the workflow that owns the document's
   * shape, the draft itself and whatever sources that workflow grounds it in.
   * The sources differ per document, so the pass takes them rather than naming
   * the round's files itself.
   */
  revise: {
    readonly arguments: readonly [
      workflow: string,
      document: string,
      ...sources: string[],
    ]
    readonly sessionId: null
  }
  glance: {
    readonly arguments: readonly [cacheRoot: string]
    readonly sessionId: null
  }
  verdict: {
    readonly arguments: readonly [verdict: string, cacheRoot: string]
    readonly sessionId: null
  }
}

type PhaseInputs = {
  [K in Phase]: PhaseArguments[K] &
    PhaseRun & {
      readonly phase: K
      readonly cwd: string
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
  /** The highest tier the fix recorded, which a chained run reads. Null when clean. */
  readonly tier: Tier | null
}

/** Whether the commit record has moved far enough for a watch to be worth running. */
type GlanceResult = {
  readonly status: "finished"
  readonly sessionId: string
  readonly due: boolean
}

type PhaseResults = {
  audit: ReportResult
  vet: ReportResult
  rebut: ReportResult
  fix: FixResult
  brief: ReportResult
  rule: ReportResult
  revise: ReportResult
  glance: GlanceResult
  verdict: ReportResult
}

/** Internal results, admitted only after the complete invocation has settled. */
export type PhaseResult<P extends Phase = Phase> =
  | PhaseFailure
  | PhaseResults[P]

/**
 * A session the user is handed or told how to resume. It carries its phase's run, so
 * a resumed session continues on the model the round ran it on.
 */
export type InteractiveSession = PhaseRun & {
  readonly sessionId: string
  readonly cwd: string
}

export type RoundDependencies = {
  readonly runPhase: {
    readonly [P in Phase]: (input: PhaseInput<P>) => Promise<PhaseResult<P>>
  }
  /** Output must be recorded and the progress display released before opening. */
  readonly prepareHandover: (session: InteractiveSession) => Promise<void>
  /** Resolves after the inherited-terminal CLI exits successfully. */
  readonly openSession: (session: InteractiveSession) => Promise<void>
}

export type Assistant = "claude" | "codex"
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
export const strengths = ["normal", "high"] as const
export type Strength = (typeof strengths)[number]

/** The reasoning efforts a round may ask for. Both CLIs answer to these four words. */
export const efforts = ["low", "medium", "high", "xhigh"] as const
export type Effort = (typeof efforts)[number]

/**
 * What the command line asked of the auditor's seat. A null field follows the
 * assistant's own configuration. The rebuttal resumes the audit session, so the
 * override binds both phases: one thread cannot change model half way through.
 */
export type AuditorOverride = {
  readonly strength: Strength | null
  readonly effort: Effort | null
}

/** An auditor the command line said nothing about, which every other seat is. */
export const noOverride: AuditorOverride = { strength: null, effort: null }

/**
 * Which model each assistant fills a strength with. Claude takes an alias,
 * which names the latest release of a family; Codex takes a slug, which names
 * one release and is edited when a family lands.
 */
const strengthModels: Record<Assistant, Record<Strength, string>> = {
  claude: { normal: "opus", high: "fable" },
  codex: { normal: "gpt-5.6-sol", high: "gpt-6-astra" },
}

/** One named field of a seat's selection, with what named it. */
export type PinnedField = {
  readonly value: string
  /** What named the field, as the run's seating report prints it. */
  readonly source: string
}

/**
 * What a phase names for itself. A null field runs on whatever the phase's CLI
 * is configured to use, so one seat can take its model from the command line
 * and its effort from the assistant's own settings.
 */
export type PinnedModel = {
  readonly model: PinnedField | null
  readonly effort: PinnedField | null
}

/** Who fills one phase of a round, and what that phase runs on. */
export type Seating = {
  readonly assistant: Assistant
  readonly model: PinnedModel
}

/** A seat that names nothing, which every phase outside the two below is. */
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
            source: "--strength",
          },
    effort:
      override.effort === null
        ? null
        : { value: override.effort, source: "--effort" },
  }
}

/**
 * The single owner of who runs each phase of a round and on what. The runner
 * invokes from this value and the run's seating report prints it, so what a
 * round says it ran on is what it ran with.
 */
export function roundSeating(
  auditor: Assistant,
  override: AuditorOverride,
): Record<Phase, Seating> {
  const seat = (phase: Phase, assistant: Assistant): Seating => ({
    assistant,
    model: phaseModel(phase, assistant, override),
  })
  return {
    audit: seat("audit", auditor),
    // The vetter is the other assistant, so no assistant vets its own report.
    vet: seat("vet", auditor === "codex" ? "claude" : "codex"),
    // The rebuttal answers in the auditor, resuming the audit when it has room.
    rebut: seat("rebut", auditor),
    fix: seat("fix", "codex"),
    // The brief retells the finished transcript for the user; Codex always writes it.
    brief: seat("brief", "codex"),
    // The ruling explains an open item for the user, so Claude writes both passes.
    rule: seat("rule", "claude"),
    // The second pass over any draft twin, so it follows whichever pass wrote one.
    revise: seat("revise", "claude"),
    // The watch reads the commit record, never the round, so the auditor does not select it.
    glance: seat("glance", "claude"),
    verdict: seat("verdict", "claude"),
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
    readonly arguments: readonly [target: string, ...scopeOrCommits: string[]]
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
    Seating & {
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
 * A session the user is handed or told how to resume. It carries its seat, so
 * a resumed session continues on the model the round ran it on.
 */
export type InteractiveSession = Seating & {
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

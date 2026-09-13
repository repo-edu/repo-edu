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

/** The single owner of which assistant runs each phase of a round. */
export function phaseAssistants(auditor: Assistant): Record<Phase, Assistant> {
  return {
    audit: auditor,
    // The vetter is the other assistant, so no assistant vets its own report.
    vet: auditor === "codex" ? "claude" : "codex",
    // The rebuttal answers in the auditor, resuming the audit when it has room.
    rebut: auditor,
    fix: "codex",
    // The brief retells the finished transcript for the user; Claude always writes it.
    brief: "claude",
    // The ruling explains an open item for the user, so Claude writes both passes.
    rule: "claude",
    // The second pass over any draft twin, so it follows whichever pass wrote one.
    revise: "claude",
    // The watch reads the commit record, never the round, so the auditor does not select it.
    glance: "claude",
    verdict: "claude",
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
    readonly arguments: readonly [plan: string, scope?: string]
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
  [K in Phase]: PhaseArguments[K] & {
    readonly phase: K
    readonly assistant: Assistant
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

export type InteractiveSession = {
  readonly assistant: Assistant
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

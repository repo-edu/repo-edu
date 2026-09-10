export type Assistant = "claude" | "codex"
export type Phase = "audit" | "vet" | "rebut" | "fix"

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
    readonly sessionId: string
  }
  fix: {
    readonly arguments: readonly [report: string]
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

type ReportResult = {
  readonly status: "finished"
  readonly sessionId: string
  /** Absolute path validated by the assistant boundary. */
  readonly file: string
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

export type ClaudeCliFailure = {
  readonly kind?: import("@repo-edu/integrations-llm-contract").LlmErrorKind
}

export type ClaudeCliTargetResult =
  | { readonly outcome: "completed"; readonly value: undefined }
  | {
      readonly outcome: "failed"
      readonly message: string
      readonly value: ClaudeCliFailure
    }

export type ClaudeCliOutcome =
  | { readonly outcome: "unknown" }
  | { readonly outcome: "cancelled" }
  | ClaudeCliTargetResult

export type ClaudeCliProcess = {
  readonly stdin: NodeJS.WritableStream
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream
  readonly outcome: Promise<ClaudeCliOutcome>
  requestCancellation(): void
  reportFailure(error: unknown): void
  reportProofLost(error: unknown): void
  reportResult(result: ClaudeCliTargetResult): void
}

export type ClaudeCliLaunchRequest = {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<NodeJS.ProcessEnv>
  readonly shell: boolean | string
  readonly signal?: AbortSignal
}

export type ClaudeCliLaunch = (
  request: ClaudeCliLaunchRequest,
) => Promise<ClaudeCliProcess>

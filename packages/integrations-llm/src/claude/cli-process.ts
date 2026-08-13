export type ClaudeCliProcessResult = {
  readonly exitCode: number | null
  readonly signal: string | null
}

export type ClaudeCliProcess = {
  readonly stdin: NodeJS.WritableStream
  readonly stdout: NodeJS.ReadableStream
  readonly stderr: NodeJS.ReadableStream
  readonly result: Promise<ClaudeCliProcessResult>
  requestStop(): void
  stopAndConfirm(): Promise<void>
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

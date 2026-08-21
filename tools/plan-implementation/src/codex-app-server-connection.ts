import { isAbsolute } from "node:path"
import type { Readable, Writable } from "node:stream"
import {
  createMessageConnection,
  type MessageConnection,
  NotificationType,
  NullLogger,
  RequestType,
} from "vscode-jsonrpc/node"
import { z } from "zod"
import packageManifest from "../package.json" with { type: "json" }
import {
  CodexAppServerJsonLineReader,
  CodexAppServerJsonLineWriter,
} from "./codex-app-server-json-lines.js"
import {
  type CodexAppServerApprovalPolicy,
  type CodexAppServerApprovalsReviewer,
  type CodexAppServerInitializeResponse,
  codexAppServerInitializeResponseSchema,
  codexAppServerThreadStartResponseSchema,
} from "./codex-app-server-schemas.js"

export const CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS = [
  "turn/diff/updated",
  "item/agentMessage/delta",
  "item/plan/delta",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/textDelta",
  "item/commandExecution/outputDelta",
  "item/commandExecution/terminalInteraction",
  "item/fileChange/outputDelta",
  "item/fileChange/patchUpdated",
  "item/mcpToolCall/progress",
] as const

const packageManifestSchema = z.object({ version: z.string().min(1) })
const packageVersion = packageManifestSchema.parse(packageManifest).version

export const CODEX_APP_SERVER_CLIENT_INFO = {
  name: "repo_edu_plan_implementation",
  title: "Repo Edu plan implementation runner",
  version: packageVersion,
} as const

export type CodexAppServerInitializeParams = ReturnType<
  typeof buildCodexAppServerInitializeParams
>
export type CodexAppServerThreadStartParams = ReturnType<
  typeof buildCodexAppServerThreadStartParams
>

const initializeRequest = new RequestType<
  CodexAppServerInitializeParams,
  unknown,
  unknown
>("initialize")
const initializedNotification = new NotificationType<Record<string, never>>(
  "initialized",
)
const threadStartRequest = new RequestType<
  CodexAppServerThreadStartParams,
  unknown,
  unknown
>("thread/start")

export function buildCodexAppServerInitializeParams() {
  return {
    clientInfo: CODEX_APP_SERVER_CLIENT_INFO,
    capabilities: {
      experimentalApi: false,
      optOutNotificationMethods: CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS,
      requestAttestation: false,
    },
  } as const
}

export function buildCodexAppServerThreadStartParams(repoEduRoot: string) {
  if (!isAbsolute(repoEduRoot)) {
    throw new Error("The Repo Edu checkout path must be absolute.")
  }
  return {
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
    config: {
      sandbox_workspace_write: { network_access: true },
      web_search: "live",
    },
    cwd: repoEduRoot,
    sandbox: "workspace-write",
  } as const
}

export type CodexAppServerStreams = {
  readonly stdin: Writable
  readonly stdout: Readable
  readonly stderr: Readable
}

export type CodexAppServerConnection = {
  readonly rpc: MessageConnection
  readonly threadId: string
  readonly initializeResponse: CodexAppServerInitializeResponse
  readonly effectiveApprovalPolicy: CodexAppServerApprovalPolicy
  readonly effectiveApprovalsReviewer: CodexAppServerApprovalsReviewer
  errorOutput(): string
  dispose(): void
}

export type CodexAppServerConnectionOptions = {
  readonly repoEduRoot: string
  readonly onStderrFailure?: (error: unknown) => void
}

export class CodexAppServerStartupError extends Error {
  override readonly name = "CodexAppServerStartupError"

  constructor(
    cause: unknown,
    readonly errorOutput: string,
  ) {
    super(
      errorOutput.length === 0
        ? "Codex app-server startup failed."
        : `Codex app-server startup failed.\n${errorOutput}`,
      { cause },
    )
  }
}

const ERROR_OUTPUT_LIMIT = 2_000

function captureErrorOutput(
  stream: Readable,
  onFailure: (error: unknown) => void,
): { readonly: () => string; dispose: () => void } {
  let tail = ""
  stream.setEncoding("utf8")
  const onData = (chunk: string): void => {
    tail = (tail + chunk).slice(-ERROR_OUTPUT_LIMIT)
  }
  stream.on("data", onData)
  stream.on("error", onFailure)
  return {
    readonly: () => tail.trim(),
    dispose() {
      stream.off("data", onData)
      stream.off("error", onFailure)
    },
  }
}

function closeConnection(connection: MessageConnection): void {
  connection.end()
  connection.dispose()
}

export async function startCodexAppServerConnection(
  streams: CodexAppServerStreams,
  options: CodexAppServerConnectionOptions,
): Promise<CodexAppServerConnection> {
  const stderr = captureErrorOutput(
    streams.stderr,
    options.onStderrFailure ?? (() => {}),
  )
  const connection = createMessageConnection(
    new CodexAppServerJsonLineReader(streams.stdout),
    new CodexAppServerJsonLineWriter(streams.stdin),
    NullLogger,
  )
  connection.listen()

  try {
    const initializeResponse = codexAppServerInitializeResponseSchema.parse(
      await connection.sendRequest(
        initializeRequest,
        buildCodexAppServerInitializeParams(),
      ),
    )
    await connection.sendNotification(initializedNotification, {})
    const threadStartResponse = codexAppServerThreadStartResponseSchema.parse(
      await connection.sendRequest(
        threadStartRequest,
        buildCodexAppServerThreadStartParams(options.repoEduRoot),
      ),
    )
    let disposed = false
    return {
      rpc: connection,
      threadId: threadStartResponse.thread.id,
      initializeResponse,
      effectiveApprovalPolicy: threadStartResponse.approvalPolicy,
      effectiveApprovalsReviewer: threadStartResponse.approvalsReviewer,
      errorOutput: stderr.readonly,
      dispose() {
        if (disposed) return
        disposed = true
        closeConnection(connection)
        stderr.dispose()
      },
    }
  } catch (error) {
    const errorOutput = stderr.readonly()
    closeConnection(connection)
    stderr.dispose()
    throw new CodexAppServerStartupError(error, errorOutput)
  }
}

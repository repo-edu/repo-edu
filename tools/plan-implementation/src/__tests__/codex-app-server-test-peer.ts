import { PassThrough } from "node:stream"
import {
  createMessageConnection,
  ErrorCodes,
  type MessageConnection,
  NullLogger,
  ResponseError,
} from "vscode-jsonrpc/node"
import type {
  CodexAppServerInitializeParams,
  CodexAppServerStreams,
  CodexAppServerThreadStartParams,
} from "../codex-app-server-connection.js"
import {
  CodexAppServerJsonLineReader,
  CodexAppServerJsonLineWriter,
} from "../codex-app-server-json-lines.js"

export type CodexAppServerTestPeer = {
  readonly streams: CodexAppServerStreams
  readonly stderr: PassThrough
  readonly rpc: MessageConnection
  readonly initializeRequests: CodexAppServerInitializeParams[]
  readonly threadStartRequests: CodexAppServerThreadStartParams[]
  readonly wireMethods: string[]
  readonly initialized: () => boolean
  readonly responseCount: () => number
  closeOutput(): void
  dispose(): void
}

export type CodexAppServerTestPeerOptions = {
  readonly initializeResult?: unknown
  readonly threadStartResult?: unknown
  readonly failThreadStart?: boolean
}

export function createCodexAppServerTestPeer(
  options: CodexAppServerTestPeerOptions = {},
): CodexAppServerTestPeer {
  const clientToServer = new PassThrough()
  const serverToClient = new PassThrough()
  const stderr = new PassThrough()
  const initializeRequests: CodexAppServerInitializeParams[] = []
  const threadStartRequests: CodexAppServerThreadStartParams[] = []
  const wireMethods: string[] = []
  let responseCount = 0
  let wireBuffer = ""
  clientToServer.setEncoding("utf8")
  clientToServer.on("data", (chunk: string) => {
    wireBuffer += chunk
    let newline = wireBuffer.indexOf("\n")
    while (newline >= 0) {
      const line = wireBuffer.slice(0, newline)
      wireBuffer = wireBuffer.slice(newline + 1)
      const message = JSON.parse(line) as { readonly method?: unknown }
      if (typeof message.method === "string") wireMethods.push(message.method)
      newline = wireBuffer.indexOf("\n")
    }
  })

  let initialized = false
  const rpc = createMessageConnection(
    new CodexAppServerJsonLineReader(clientToServer),
    new CodexAppServerJsonLineWriter(serverToClient, (message) => {
      const record = message as unknown as Record<string, unknown>
      if (record.id !== undefined && record.method === undefined) {
        responseCount += 1
      }
    }),
    NullLogger,
  )
  rpc.onRequest("initialize", (params: CodexAppServerInitializeParams) => {
    initializeRequests.push(params)
    return (
      options.initializeResult ?? {
        codexHome: "/tmp/codex-home",
        platformFamily: "unix",
        platformOs: "macos",
        userAgent: "codex-test",
      }
    )
  })
  rpc.onNotification("initialized", () => {
    initialized = true
  })
  rpc.onRequest("thread/start", (params: CodexAppServerThreadStartParams) => {
    threadStartRequests.push(params)
    if (options.failThreadStart === true) {
      throw new ResponseError(
        ErrorCodes.InvalidParams,
        "thread/start was rejected",
      )
    }
    return (
      options.threadStartResult ?? {
        approvalPolicy: "never",
        approvalsReviewer: "user",
        thread: { id: "thread-1" },
      }
    )
  })
  rpc.listen()

  return {
    streams: {
      stdin: clientToServer,
      stdout: serverToClient,
      stderr,
    },
    stderr,
    rpc,
    initializeRequests,
    threadStartRequests,
    wireMethods,
    initialized: () => initialized,
    responseCount: () => responseCount,
    closeOutput() {
      serverToClient.end()
    },
    dispose() {
      rpc.dispose()
      clientToServer.end()
      serverToClient.end()
      stderr.end()
    },
  }
}

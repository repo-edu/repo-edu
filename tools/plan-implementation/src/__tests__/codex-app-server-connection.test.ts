import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join } from "node:path"
import { PassThrough } from "node:stream"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import {
  createMessageConnection,
  ErrorCodes,
  NullLogger,
  ResponseError,
} from "vscode-jsonrpc/node"
import { resolveCodexAppServerCommand } from "../codex-app-server-command.js"
import {
  buildCodexAppServerInitializeParams,
  buildCodexAppServerThreadStartParams,
  CODEX_APP_SERVER_CLIENT_INFO,
  CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS,
  type CodexAppServerInitializeParams,
  type CodexAppServerStreams,
  type CodexAppServerThreadStartParams,
  startCodexAppServerConnection,
} from "../codex-app-server-connection.js"
import {
  CodexAppServerJsonLineReader,
  CodexAppServerJsonLineWriter,
} from "../codex-app-server-json-lines.js"

const repoEduRoot = fileURLToPath(new URL("../../../../", import.meta.url))

type StartupServer = {
  readonly streams: CodexAppServerStreams
  readonly stderr: PassThrough
  readonly initializeRequests: CodexAppServerInitializeParams[]
  readonly threadStartRequests: CodexAppServerThreadStartParams[]
  readonly initialized: () => boolean
  dispose(): void
}

type StartupServerOptions = {
  readonly initializeResult?: unknown
  readonly threadStartResult?: unknown
  readonly failThreadStart?: boolean
}

function createStartupServer(
  options: StartupServerOptions = {},
): StartupServer {
  const clientToServer = new PassThrough()
  const serverToClient = new PassThrough()
  const stderr = new PassThrough()
  const initializeRequests: CodexAppServerInitializeParams[] = []
  const threadStartRequests: CodexAppServerThreadStartParams[] = []
  let initialized = false
  const server = createMessageConnection(
    new CodexAppServerJsonLineReader(clientToServer),
    new CodexAppServerJsonLineWriter(serverToClient),
    NullLogger,
  )
  server.onRequest("initialize", (params: CodexAppServerInitializeParams) => {
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
  server.onNotification("initialized", () => {
    initialized = true
  })
  server.onRequest(
    "thread/start",
    (params: CodexAppServerThreadStartParams) => {
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
    },
  )
  server.listen()
  return {
    streams: {
      stdin: clientToServer,
      stdout: serverToClient,
      stderr,
    },
    stderr,
    initializeRequests,
    threadStartRequests,
    initialized: () => initialized,
    dispose() {
      server.dispose()
      clientToServer.end()
      serverToClient.end()
      stderr.end()
    },
  }
}

async function startWithServer(server: StartupServer) {
  try {
    return await startCodexAppServerConnection(server.streams, {
      repoEduRoot,
    })
  } catch (error) {
    server.dispose()
    throw error
  }
}

describe("Codex app-server startup connection", () => {
  it("resolves the official package launcher without choosing a native binary", () => {
    const command = resolveCodexAppServerCommand()

    assert.equal(command.command, process.execPath)
    assert.deepEqual(command.arguments.slice(1), ["app-server"])
    assert.equal(isAbsolute(command.arguments[0] ?? ""), true)
    assert.equal(dirname(command.arguments[0] ?? "").endsWith("/bin"), true)
    assert.match(command.arguments[0] ?? "", /@openai[/+]codex.*codex\.js$/)
  })

  it("rejects a resolved package that has no official launcher", () => {
    assert.throws(
      () =>
        resolveCodexAppServerCommand({
          resolvePackageJson: () => "/tmp/missing-codex/package.json",
        }),
      /official @openai\/codex launcher does not exist/,
    )
  })

  it("initializes once and starts one thread with the exact stable policy", async () => {
    const server = createStartupServer()
    const connection = await startWithServer(server)

    assert.deepEqual(server.initializeRequests, [
      buildCodexAppServerInitializeParams(),
    ])
    assert.deepEqual(server.threadStartRequests, [
      buildCodexAppServerThreadStartParams(repoEduRoot),
    ])
    assert.equal(server.initialized(), true)
    assert.equal(connection.threadId, "thread-1")
    assert.equal(connection.effectiveApprovalPolicy, "never")
    assert.equal(connection.effectiveApprovalsReviewer, "user")
    assert.equal(connection.initializeResponse.userAgent, "codex-test")
    connection.dispose()
    server.dispose()
  })

  it("records the requested identity, capabilities, config keys, and reviewer", () => {
    assert.deepEqual(CODEX_APP_SERVER_CLIENT_INFO, {
      name: "repo_edu_plan_implementation",
      title: "Repo Edu plan implementation runner",
      version: "0.0.0",
    })
    assert.deepEqual(buildCodexAppServerInitializeParams(), {
      clientInfo: CODEX_APP_SERVER_CLIENT_INFO,
      capabilities: {
        experimentalApi: false,
        optOutNotificationMethods:
          CODEX_APP_SERVER_OPT_OUT_NOTIFICATION_METHODS,
        requestAttestation: false,
      },
    })
    assert.deepEqual(buildCodexAppServerThreadStartParams(repoEduRoot), {
      approvalPolicy: "on-request",
      approvalsReviewer: "auto_review",
      config: {
        sandbox_workspace_write: { network_access: true },
        web_search: "live",
      },
      cwd: repoEduRoot,
      sandbox: "workspace-write",
    })
  })

  it("does not retry a rejected thread start", async () => {
    const server = createStartupServer({ failThreadStart: true })

    await assert.rejects(
      startWithServer(server),
      /Codex app-server startup failed/,
    )
    assert.equal(server.threadStartRequests.length, 1)
  })

  it("rejects malformed initialize and thread-start replies", async (context) => {
    await context.test("initialize", async () => {
      const server = createStartupServer({ initializeResult: {} })
      await assert.rejects(
        startWithServer(server),
        /Codex app-server startup failed/,
      )
      assert.equal(server.threadStartRequests.length, 0)
    })
    await context.test("thread start", async () => {
      const server = createStartupServer({
        threadStartResult: {
          approvalPolicy: "on-request",
          approvalsReviewer: "auto_review",
          thread: { id: "" },
        },
      })
      await assert.rejects(
        startWithServer(server),
        /Codex app-server startup failed/,
      )
      assert.equal(server.threadStartRequests.length, 1)
    })
  })

  it("keeps a bounded app-server error-output tail", async () => {
    const server = createStartupServer()
    server.stderr.write(`discarded-${"x".repeat(2_000)}-kept`)
    const connection = await startWithServer(server)

    assert.equal(connection.errorOutput().endsWith("-kept"), true)
    assert.equal(connection.errorOutput().length, 2_000)
    connection.dispose()
    server.dispose()
  })

  it("completes a model-free handshake with the installed app-server", {
    skip: process.platform !== "darwin" && process.platform !== "linux",
  }, async (context) => {
    const codexHome = await mkdtemp(join(tmpdir(), "repo-edu-codex-home-"))
    context.after(async () => rm(codexHome, { recursive: true, force: true }))
    const command = resolveCodexAppServerCommand()
    const child = spawn(command.command, command.arguments, {
      cwd: repoEduRoot,
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: ["pipe", "pipe", "pipe"],
    })
    const exited = once(child, "exit")
    context.after(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL")
      }
    })
    assert(child.stdin)
    assert(child.stdout)
    assert(child.stderr)

    const connection = await startCodexAppServerConnection(
      {
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
      },
      { repoEduRoot },
    )
    assert.notEqual(connection.threadId, "")
    assert.equal(connection.effectiveApprovalPolicy, "on-request")
    assert.equal(
      ["auto_review", "user"].includes(connection.effectiveApprovalsReviewer),
      true,
    )
    connection.dispose()

    let timeoutHandle: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error("Codex app-server did not exit after EOF.")),
        10_000,
      )
      timeoutHandle.unref()
    })
    const [exitCode, signal] = (await Promise.race([exited, timeout]).finally(
      () => clearTimeout(timeoutHandle),
    )) as [number | null, NodeJS.Signals | null]
    assert.equal(exitCode, 0)
    assert.equal(signal, null)
  })
})

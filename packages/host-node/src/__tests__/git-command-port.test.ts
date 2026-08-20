import assert from "node:assert/strict"
import { PassThrough, Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import type {
  ProcessPort,
  ProcessRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type {
  ChildProcessLifetimeController,
  ChildProcessLifetimeLaunch,
  ChildProcessLifetimePlatformAdapter,
  OwnedChildProcessTree,
} from "../child-process-lifetime.js"
import { createChildProcessLifetimeController } from "../child-process-lifetime.js"
import { createNodeGitCommandPort, createNodeProcessPort } from "../index.js"

describe("createNodeGitCommandPort", () => {
  it("wraps the process port with the system git command", async () => {
    const captured: ProcessRequest[] = []
    const processPort: ProcessPort = {
      cancellation: "best-effort",
      async run(request: ProcessRequest): Promise<ProcessResult> {
        captured.push(request)

        return {
          exitCode: 0,
          signal: null,
          stdout: "ok",
          stderr: "",
        }
      },
    }

    const gitPort = createNodeGitCommandPort(processPort)
    const abortController = new AbortController()
    const result = await gitPort.run({
      args: ["log", "--follow", "--", "README.md"],
      cwd: "/tmp/repo-edu",
      env: { GIT_TERMINAL_PROMPT: "0" },
      stdinText: "stdin",
      signal: abortController.signal,
    })

    assert.equal(gitPort.cancellation, "best-effort")
    assert.deepStrictEqual(captured, [
      {
        command: "git",
        args: ["log", "--follow", "--", "README.md"],
        cwd: "/tmp/repo-edu",
        env: { GIT_TERMINAL_PROMPT: "0" },
        stdinText: "stdin",
        signal: abortController.signal,
      },
    ])
    assert.deepStrictEqual(result, {
      exitCode: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
    })
  })

  it("routes Git through one controller-owned tree", async () => {
    const launches: ChildProcessLifetimeLaunch[] = []
    let callerReportedFacts = 0
    const controller: ChildProcessLifetimeController = {
      async launch<TCompleted, TFailed>(request: ChildProcessLifetimeLaunch) {
        launches.push(request)
        const owned = {
          stdin: new Writable({
            write(_chunk, _encoding, done) {
              done()
            },
          }),
          stdout: Readable.from(["git output"]),
          stderr: Readable.from([]),
          outcome: Promise.resolve({
            outcome: "completed" as const,
            targetResult: { exitCode: 0, signal: null },
            value: { exitCode: 0, signal: null },
          }),
          requestCancellation() {},
          reportFailure() {
            callerReportedFacts += 1
          },
          reportProofLost() {
            callerReportedFacts += 1
          },
          reportResult() {
            callerReportedFacts += 1
          },
        }
        return owned as unknown as OwnedChildProcessTree<TCompleted, TFailed>
      },
      async stopAndConfirm() {},
    }

    const result = await createNodeGitCommandPort(
      createNodeProcessPort(controller),
    ).run({
      args: ["status", "--short"],
      cwd: "/tmp/repo-edu",
      env: { GIT_TERMINAL_PROMPT: "0" },
      stdinText: "input",
    })

    assert.equal(launches.length, 1)
    assert.equal(launches[0]?.command, "git")
    assert.deepEqual(launches[0]?.args, ["status", "--short"])
    assert.equal(launches[0]?.proof, "target-exit")
    assert.equal(callerReportedFacts, 0)
    assert.equal(result.stdout, "git output")
  })

  it("settles process-port cancellation through the controller's bounded stop", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    )
    const terminal = Promise.withResolvers<{
      exitCode: null
      signal: string
    }>()
    let stopConfirmations = 0
    const windowsAdapter: ChildProcessLifetimePlatformAdapter = {
      async launch(_request) {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        return {
          stdin,
          stdout,
          stderr,
          result: terminal.promise,
          async stopAndConfirm() {
            stopConfirmations += 1
            stdin.end()
            stdout.end()
            stderr.end()
            terminal.resolve({ exitCode: null, signal: "SIGTERM" })
            return { outcome: "confirmed" }
          },
        }
      },
    }

    try {
      Object.defineProperty(process, "platform", {
        ...platformDescriptor,
        value: "win32",
      })
      const abortController = new AbortController()
      const processPort = createNodeProcessPort(
        createChildProcessLifetimeController({
          diagnosticSink() {},
          warnUnconfirmedTree(error): never {
            throw error
          },
          windowsAdapter,
        }),
      )
      const result = processPort.run({
        command: "waiting-target",
        args: [],
        signal: abortController.signal,
      })

      abortController.abort()

      await assert.rejects(
        result,
        (error) => error instanceof DOMException && error.name === "AbortError",
      )
      assert.equal(stopConfirmations, 1)
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  })
})

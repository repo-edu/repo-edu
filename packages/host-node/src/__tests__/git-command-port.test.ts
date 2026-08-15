import assert from "node:assert/strict"
import { PassThrough, Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import type {
  ProcessPort,
  ProcessRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type {
  ChildProcessLifetimeAdapter,
  ChildProcessLifetimeLaunch,
  ChildProcessLifetimePlatform,
} from "../child-process-lifetime.js"
import { createChildProcessLifetimeAdapter } from "../child-process-lifetime.js"
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
    const controller = new AbortController()
    const result = await gitPort.run({
      args: ["log", "--follow", "--", "README.md"],
      cwd: "/tmp/repo-edu",
      env: { GIT_TERMINAL_PROMPT: "0" },
      stdinText: "stdin",
      signal: controller.signal,
    })

    assert.equal(gitPort.cancellation, "best-effort")
    assert.deepStrictEqual(captured, [
      {
        command: "git",
        args: ["log", "--follow", "--", "README.md"],
        cwd: "/tmp/repo-edu",
        env: { GIT_TERMINAL_PROMPT: "0" },
        stdinText: "stdin",
        signal: controller.signal,
      },
    ])
    assert.deepStrictEqual(result, {
      exitCode: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
    })
  })

  it("routes Git through one direct adapter-owned tree", async () => {
    const launches: ChildProcessLifetimeLaunch[] = []
    const lifetime: ChildProcessLifetimeAdapter = {
      async launch(request) {
        launches.push(request)
        return {
          route: request.route,
          stdin: new Writable({
            write(_chunk, _encoding, done) {
              done()
            },
          }),
          stdout: Readable.from(["git output"]),
          stderr: Readable.from([]),
          result: Promise.resolve({ exitCode: 0, signal: null }),
          async stopAndConfirm() {},
        }
      },
      async stopAndConfirm() {},
    }

    const result = await createNodeGitCommandPort(
      createNodeProcessPort(lifetime),
    ).run({
      args: ["status", "--short"],
      cwd: "/tmp/repo-edu",
      env: { GIT_TERMINAL_PROMPT: "0" },
      stdinText: "input",
    })

    assert.equal(launches.length, 1)
    assert.equal(launches[0]?.command, "git")
    assert.equal(launches[0]?.route, "direct-adapter")
    assert.deepEqual(launches[0]?.args, ["status", "--short"])
    assert.equal(result.stdout, "git output")
  })

  it("settles process-port cancellation through the adapter's bounded stop", async () => {
    const platformDescriptor = Object.getOwnPropertyDescriptor(
      process,
      "platform",
    )
    const terminal = Promise.withResolvers<{
      exitCode: null
      signal: string
    }>()
    let stopConfirmations = 0
    const windows: ChildProcessLifetimePlatform = {
      async launch(request) {
        const stdin = new PassThrough()
        const stdout = new PassThrough()
        const stderr = new PassThrough()
        return {
          route: request.route,
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
          },
        }
      },
    }

    try {
      Object.defineProperty(process, "platform", {
        ...platformDescriptor,
        value: "win32",
      })
      const controller = new AbortController()
      const processPort = createNodeProcessPort(
        createChildProcessLifetimeAdapter({ windows }),
      )
      const result = processPort.run({
        command: "waiting-target",
        args: [],
        signal: controller.signal,
      })

      controller.abort()

      assert.deepEqual(await result, {
        exitCode: null,
        signal: "SIGTERM",
        stdout: "",
        stderr: "",
      })
      assert.equal(stopConfirmations, 1)
    } finally {
      if (platformDescriptor) {
        Object.defineProperty(process, "platform", platformDescriptor)
      }
    }
  })
})

import assert from "node:assert/strict"
import { Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import type {
  ProcessPort,
  ProcessRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import type {
  ChildProcessLifetimeAdapter,
  ChildProcessLifetimeLaunch,
} from "../child-process-lifetime.js"
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
          requestStop() {},
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
})

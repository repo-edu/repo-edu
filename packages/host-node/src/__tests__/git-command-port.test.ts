import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type {
  ProcessPort,
  ProcessRequest,
  ProcessResult,
} from "@repo-edu/host-runtime-contract"
import { createNodeGitCommandPort } from "../index.js"

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
})

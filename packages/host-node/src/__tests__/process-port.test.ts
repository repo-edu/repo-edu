import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createNodeProcessPort } from "../index.js"

describe("createNodeProcessPort", () => {
  it("captures stdout, stderr, and non-zero exit codes", async () => {
    const processPort = createNodeProcessPort()

    const result = await processPort.run({
      command: process.execPath,
      args: [
        "-e",
        "process.stdout.write('hello'); process.stderr.write('warn'); process.exit(7)",
      ],
    })

    assert.equal(processPort.cancellation, "best-effort")
    assert.deepStrictEqual(result, {
      exitCode: 7,
      signal: null,
      stdout: "hello",
      stderr: "warn",
    })
  })

  it("writes stdin text and closes stdin for the child process", async () => {
    const processPort = createNodeProcessPort()

    const result = await processPort.run({
      command: process.execPath,
      args: [
        "-e",
        [
          "process.stdin.setEncoding('utf8')",
          "let data = ''",
          "process.stdin.on('data', (chunk) => { data += chunk })",
          "process.stdin.on('end', () => { process.stdout.write(data.toUpperCase()) })",
        ].join("; "),
      ],
      stdinText: "repo-edu",
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.signal, null)
    assert.equal(result.stdout, "REPO-EDU")
    assert.equal(result.stderr, "")
  })

  it("honors abort requests with best-effort termination", async () => {
    const processPort = createNodeProcessPort()
    const controller = new AbortController()

    const runPromise = processPort.run({
      command: process.execPath,
      args: [
        "-e",
        [
          "process.on('SIGTERM', () => process.exit(0))",
          "setInterval(() => {}, 1_000)",
        ].join("; "),
      ],
      signal: controller.signal,
    })

    setTimeout(() => {
      controller.abort()
    }, 50)

    const startedAt = Date.now()
    const result = await runPromise
    const elapsedMs = Date.now() - startedAt

    assert.equal(processPort.cancellation, "best-effort")
    const exitedViaSignalHandler =
      result.exitCode === 0 && result.signal === null
    const terminatedBySignal =
      result.exitCode === null && result.signal === "SIGTERM"
    assert.ok(exitedViaSignalHandler || terminatedBySignal)
    assert.ok(elapsedMs < 1_000)
  })
})

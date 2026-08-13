import assert from "node:assert/strict"
import { Readable, Writable } from "node:stream"
import { describe, it } from "node:test"
import type {
  ChildProcessLifetimeAdapter,
  ChildProcessLifetimeLaunch,
} from "@repo-edu/host-node/child-process-lifetime"
import type { PlanImplementationStep } from "../contracts.js"
import {
  createStepCommandExecutor,
  repeatDependencyInstall,
  runAdmittedStepChecks,
  type StepCommand,
  type StepCommandExecutor,
} from "../step-checks.js"

const point = { line: 1, column: 1, offset: 0 }

function stepWithProofs(): PlanImplementationStep {
  return {
    number: 7,
    title: "Admit the repository",
    sourceSpan: { start: point, end: point },
    proofs: {
      sourceSpan: null,
      items: [
        { program: "node", arguments: ["proof-one.mjs", "--exact"] },
        { "user-action": "This action was refused during preflight." },
        { program: "pnpm", arguments: ["proof:two"] },
      ],
    },
  }
}

describe("step checks", () => {
  it("runs dependency install, fixed checks and machine proofs in order", async () => {
    const requests: Array<{
      readonly cwd: string
      readonly program: string
      readonly arguments: readonly string[]
    }> = []
    const announced: StepCommand[] = []
    const finished: Array<{
      readonly command: StepCommand
      readonly status: "succeeded" | "failed" | "stopped"
    }> = []
    const executor: StepCommandExecutor = {
      async run(request) {
        requests.push(request)
        return {
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
        }
      },
    }
    const observer = {
      commandStarted(command: StepCommand) {
        announced.push(command)
      },
      commandFinished(
        command: StepCommand,
        status: "succeeded" | "failed" | "stopped",
      ) {
        finished.push({ command, status })
      },
    }

    await repeatDependencyInstall("/repo-edu", executor, observer)
    await runAdmittedStepChecks(
      "/repo-edu",
      stepWithProofs(),
      executor,
      observer,
    )

    assert.deepEqual(
      requests.map(({ program, arguments: arguments_ }) => [
        program,
        arguments_,
      ]),
      [
        ["pnpm", ["install"]],
        ["git", ["diff", "--check"]],
        ["pnpm", ["check"]],
        ["pnpm", ["test"]],
        ["node", ["proof-one.mjs", "--exact"]],
        ["pnpm", ["proof:two"]],
      ],
    )
    assert.equal(announced.length, requests.length)
    assert.deepEqual(
      finished,
      announced.map((command) => ({ command, status: "succeeded" })),
    )
    assert.equal(
      requests.every((request) => request.cwd === "/repo-edu"),
      true,
    )
  })

  it("launches each command through the direct shared route without a shell", async () => {
    const launches: ChildProcessLifetimeLaunch[] = []
    const childLifetime: ChildProcessLifetimeAdapter = {
      async launch(request) {
        launches.push(request)
        return {
          route: request.route,
          stdin: new Writable({
            write(_chunk, _encoding, callback) {
              callback()
            },
          }),
          stdout: Readable.from(["standard output"]),
          stderr: Readable.from([]),
          result: Promise.resolve({ exitCode: 0, signal: null }),
          requestStop() {},
          async stopAndConfirm() {},
        }
      },
      async stopAndConfirm() {},
    }

    const result = await createStepCommandExecutor(childLifetime).run({
      id: "proof",
      label: "Proof",
      program: "proof-program",
      arguments: ["one", "two words"],
      cwd: "/repo-edu",
    })

    assert.equal(result.stdout, "standard output")
    assert.deepEqual(launches, [
      {
        command: "proof-program",
        args: ["one", "two words"],
        cwd: "/repo-edu",
        env: { ...process.env },
        route: "direct-adapter",
        shell: false,
      },
    ])
  })

  it("stops at the first failed command", async () => {
    const calls: string[] = []
    const executor: StepCommandExecutor = {
      async run(request) {
        calls.push(request.id)
        return {
          exitCode: request.id === "repository-check" ? 1 : 0,
          signal: null,
          stdout: "",
          stderr: "typecheck failed",
        }
      },
    }

    await assert.rejects(
      runAdmittedStepChecks("/repo-edu", stepWithProofs(), executor, {
        commandStarted() {},
        commandFinished() {},
      }),
      /Repository check failed.*typecheck failed/,
    )
    assert.deepEqual(calls, ["git-diff-check", "repository-check"])
  })
})

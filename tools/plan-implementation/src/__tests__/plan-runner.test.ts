import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, it } from "node:test"
import { promisify } from "node:util"
import type {
  CodingAdapter,
  CodingRequest,
  CodingResult,
} from "../contracts.js"
import { runPlanImplementation } from "../plan-runner.js"
import type {
  StepCommand,
  StepCommandExecutor,
  StepCommandRequest,
} from "../step-checks.js"

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set<string>()

const planMarkdown = `# Example

## Implementation plan

1. **First step.** Make the first change.

   \`\`\`repo-edu-proofs
   [
     { "program": "node", "arguments": ["proof.mjs", "--first"] }
   ]
   \`\`\`

2. **Second step.** Make the second change.
`

async function git(root: string, arguments_: readonly string[]) {
  return await execFileAsync("git", [...arguments_], {
    cwd: root,
    encoding: "utf8",
  })
}

async function createRepository(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.add(root)
  await git(root, ["init", "--quiet"])
  await git(root, ["config", "user.name", "Plan Runner Test"])
  await git(root, ["config", "user.email", "runner@example.invalid"])
  return root
}

async function createPlan(): Promise<string> {
  const root = await createRepository("plan-runner-plan-test-")
  const planPath = join(root, "plan-example.md")
  await writeFile(planPath, planMarkdown)
  await git(root, ["add", "--", "plan-example.md"])
  await git(root, ["commit", "--quiet", "-m", "add plan"])
  return planPath
}

async function createRepoEdu(): Promise<string> {
  const root = await createRepository("plan-runner-code-test-")
  await writeFile(join(root, "README.md"), "clean\n")
  await git(root, ["add", "--", "README.md"])
  await git(root, ["commit", "--quiet", "-m", "initial"])
  return root
}

function succeededResult(step: number): CodingResult {
  return {
    status: "succeeded",
    commit: {
      subject: `A1 redesign(plan-implementation): admit step ${step}`,
      decisionBullets: [
        `Step ${step} enters one independently checked runner-owned commit.`,
      ],
    },
  }
}

function codingAdapter(
  run: (request: CodingRequest) => Promise<CodingResult>,
): CodingAdapter {
  return {
    async start(request) {
      return {
        events: (async function* () {
          yield { kind: "activity" as const, label: "Coding test activity." }
        })(),
        result: run(request),
        abort() {},
      }
    },
  }
}

function successfulCommands(
  calls: StepCommandRequest[],
  beforeResult?: (
    request: Parameters<StepCommandExecutor["run"]>[0],
  ) => void | Promise<void>,
): StepCommandExecutor {
  return {
    async run(request) {
      calls.push(request)
      await beforeResult?.(request)
      return { exitCode: 0, signal: null, stdout: "", stderr: "" }
    },
  }
}

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  )
  temporaryRoots.clear()
})

describe("runPlanImplementation", () => {
  it("commits each admitted step before starting the next clean context", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []
    const announced: StepCommand[] = []
    const codingSteps: number[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async (request) => {
          codingSteps.push(request.activeStep)
          assert.equal(
            (await git(repoEduRoot, ["status", "--porcelain"])).stdout,
            "",
          )
          await writeFile(
            join(repoEduRoot, `step-${request.activeStep}.txt`),
            `step ${request.activeStep}\n`,
          )
          return succeededResult(request.activeStep)
        }),
        commands: successfulCommands(commandCalls),
        observer: {
          codingEvent() {},
          commandStarted(command) {
            announced.push(command)
          },
        },
      },
    )

    assert.deepEqual(result, {
      mode: "complete",
      resolvedCeiling: 2,
      transcriptPath: null,
      outcome: "completed",
    })
    assert.deepEqual(codingSteps, [1, 2])
    assert.deepEqual(
      commandCalls.map((command) => command.id),
      [
        "git-diff-check",
        "repository-check",
        "repository-test",
        "machine-proof-1",
        "git-diff-check",
        "repository-check",
        "repository-test",
      ],
    )
    assert.deepEqual(
      announced,
      commandCalls.map(({ cwd: _cwd, ...command }) => command),
    )
    assert.equal((await git(repoEduRoot, ["status", "--porcelain"])).stdout, "")
    assert.deepEqual(
      (
        await git(repoEduRoot, ["log", "-2", "--format=%s%x00%b%x00"])
      ).stdout.match(/Plan-Step: [12]/g),
      ["Plan-Step: 2", "Plan-Step: 1"],
    )
  })

  it("announces and repeats install before admitting a manifest diff", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    await writeFile(join(repoEduRoot, "package.json"), '{"version":"1"}\n')
    await git(repoEduRoot, ["add", "--", "package.json"])
    await git(repoEduRoot, ["commit", "--quiet", "-m", "add package"])
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(
            join(repoEduRoot, "package.json"),
            '{"version":"2"}\n',
          )
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.deepEqual(
      commandCalls.map(({ program, arguments: arguments_ }) => [
        program,
        arguments_,
      ]),
      [
        ["pnpm", ["install"]],
        ["git", ["diff", "--check"]],
        ["pnpm", ["check"]],
        ["pnpm", ["test"]],
        ["node", ["proof.mjs", "--first"]],
      ],
    )
  })

  it("stops on a blocked coding result and preserves its diff", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const headBefore = (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "complete" } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "blocked.txt"), "inspect me\n")
          return {
            status: "blocked",
            reason: "A contract decision is missing.",
          }
        }),
        commands: successfulCommands(commandCalls),
      },
    )

    assert.equal(result.outcome, "stopped")
    assert.equal(
      result.outcome === "stopped" ? result.reason : null,
      "A contract decision is missing.",
    )
    assert.equal(
      (await git(repoEduRoot, ["rev-parse", "HEAD"])).stdout,
      headBefore,
    )
    assert.match(
      (await git(repoEduRoot, ["status", "--porcelain"])).stdout,
      /blocked\.txt/,
    )
    assert.deepEqual(commandCalls, [])
  })

  it("does not let presentation callbacks move repository work", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    const result = await runPlanImplementation(
      { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
      {
        coding: codingAdapter(async () => {
          await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
          return succeededResult(1)
        }),
        commands: successfulCommands(commandCalls),
        observer: {
          codingEvent() {
            throw new Error("display failed")
          },
          commandStarted() {
            throw new Error("display failed")
          },
        },
      },
    )

    assert.equal(result.outcome, "bound-reached")
    assert.equal(commandCalls.length, 4)
  })

  it("rejects Codex index writes before any check starts", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    await assert.rejects(
      runPlanImplementation(
        { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
        {
          coding: codingAdapter(async () => {
            await writeFile(join(repoEduRoot, "staged.txt"), "forbidden\n")
            await git(repoEduRoot, ["add", "--", "staged.txt"])
            return succeededResult(1)
          }),
          commands: successfulCommands(commandCalls),
        },
      ),
      /changed the Git index/,
    )
    assert.deepEqual(commandCalls, [])
  })

  it("rechecks the fixed plan source before the commit", async () => {
    const planPath = await createPlan()
    const repoEduRoot = await createRepoEdu()
    const commandCalls: StepCommandRequest[] = []

    await assert.rejects(
      runPlanImplementation(
        { repoEduRoot, planPath, run: { mode: "count", count: 1 } },
        {
          coding: codingAdapter(async () => {
            await writeFile(join(repoEduRoot, "step-1.txt"), "step 1\n")
            return succeededResult(1)
          }),
          commands: successfulCommands(commandCalls, async (command) => {
            if (command.id === "repository-test") {
              await writeFile(planPath, `${planMarkdown}\nChanged outside.\n`)
            }
          }),
        },
      ),
      /plan source no longer matches the source fixed at launch/,
    )
    assert.equal(
      (await git(repoEduRoot, ["log", "-1", "--format=%s"])).stdout.trim(),
      "initial",
    )
  })
})

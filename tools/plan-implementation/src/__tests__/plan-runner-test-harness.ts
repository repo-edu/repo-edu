import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import type {
  CodingAdapter,
  CodingRequest,
  CodingResult,
} from "../contracts.js"
import type { StepCommandExecutor, StepCommandRequest } from "../step-checks.js"

const execFileAsync = promisify(execFile)
const temporaryRoots = new Set<string>()

export const settledChildren = {
  async stopAndConfirm() {},
}

export const planMarkdown = `# Example

## Implementation plan

1. **First step.** Make the first change.

   \`\`\`repo-edu-proofs
   [
     { "program": "node", "arguments": ["proof.mjs", "--first"] }
   ]
   \`\`\`

2. **Second step.** Make the second change.
`

export async function git(root: string, arguments_: readonly string[]) {
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

export async function createPlan(): Promise<string> {
  const root = await createRepository("plan-runner-plan-test-")
  const planPath = join(root, "example.md")
  await writeFile(planPath, planMarkdown)
  await git(root, ["add", "--", "example.md"])
  await git(root, ["commit", "--quiet", "-m", "add plan"])
  return planPath
}

export async function createRepoEdu(): Promise<string> {
  const root = await createRepository("plan-runner-code-test-")
  await writeFile(join(root, "README.md"), "clean\n")
  await git(root, ["add", "--", "README.md"])
  await git(root, ["commit", "--quiet", "-m", "initial"])
  return root
}

export async function cleanupTestRepositories(): Promise<void> {
  await Promise.all(
    [...temporaryRoots].map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  )
  temporaryRoots.clear()
}

export function succeededResult(step: number): CodingResult {
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

export function codingAdapter(
  run: (request: CodingRequest) => Promise<CodingResult>,
): CodingAdapter {
  return {
    async start(request) {
      return {
        events: (async function* () {
          yield { kind: "narrative" as const, text: "Coding test narrative." }
        })(),
        result: run(request),
        abort() {},
      }
    },
  }
}

export function successfulCommands(
  calls: StepCommandRequest[],
  beforeResult?: (
    request: Parameters<StepCommandExecutor["run"]>[0],
  ) => void | Promise<void>,
): StepCommandExecutor {
  return {
    async run(request) {
      calls.push(request)
      await beforeResult?.(request)
      return {
        exitCode: 0,
        signal: null,
        stdout: request.id === "workspace-projects" ? "[]" : "",
        stderr: "",
      }
    },
  }
}

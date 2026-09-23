import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestContext } from "node:test"
import { fileURLToPath } from "node:url"
import type { AssistantRuntime } from "../assistant.js"
import type { ExecutionContext, RoundKind } from "../context.js"
import type { Feedback, PhaseOutput } from "../feedback.js"
import type { Assistant, PhaseInput, PhaseResult } from "../phase.js"

export function testContext(
  repoEduRoot: string,
  roundKind: RoundKind = "implementation",
): ExecutionContext {
  const planRoot = join(repoEduRoot, "../plan")
  return {
    repoEduRoot,
    planRoot,
    roundKind,
    cwd: roundKind === "planning" ? planRoot : repoEduRoot,
  }
}

export const fixtureRoot = fileURLToPath(new URL("fixtures/", import.meta.url))
export const selections = {
  claude: { model: "claude-opus-5", effort: "xhigh" },
  codex: { model: "gpt-6-astra", effort: "high" },
}
export const recorded = async (name: string) =>
  readFile(join(fixtureRoot, name), "utf8")
export const finishedText =
  'Résumé complete\nPHASE RESULT: {"status":"finished","reason":null}'

export async function phaseStream(
  assistant: Assistant,
  final = finishedText,
  sessionId = "test-session",
): Promise<string> {
  const lines = (await recorded(`${assistant}.jsonl`))
    .trim()
    .split("\n")
    .map((line) => {
      const event = JSON.parse(line)
      if (event.session_id !== undefined) event.session_id = sessionId
      if (event.type === "thread.started") event.thread_id = sessionId
      if (event.type === "result") event.result = final
      if (event.type === "assistant") {
        for (const block of event.message.content)
          if (block.type === "text") block.text = final
      }
      if (
        event.type === "item.completed" &&
        event.item.type === "agent_message"
      )
        event.item.text = final
      return JSON.stringify(event)
    })
    .join("\n")
  return `${lines}\n`
}

export async function fixture(
  t: TestContext,
  scenario: Record<string, unknown> = {},
) {
  const releaseLookup = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ tag_name: "rust-v1.0.0" }),
  )
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "audit-round-test-")),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const root = join(directory, "repo-edu")
  await mkdir(root)
  await mkdir(join(directory, "plan"))
  await writeFile(join(root, "scenario.json"), JSON.stringify(scenario))
  const executable = (assistant: Assistant) => ({
    file: process.execPath,
    args: [
      "--import",
      import.meta.resolve("tsx"),
      join(fixtureRoot, "process.ts"),
      root,
      assistant,
    ],
  })
  const runtime: AssistantRuntime & ExecutionContext = {
    ...testContext(root),
    sessionsRoot: root,
    executables: { claude: executable("claude"), codex: executable("codex") },
  }
  const feedback: Feedback[] = []
  const starts: { input: PhaseInput; prompt: string }[] = []
  const finishes: PhaseResult[] = []
  let releases = 0
  const output: PhaseOutput = {
    async start(input, prompt) {
      starts.push({ input, prompt })
    },
    async observe(event) {
      feedback.push(event)
    },
    async finish(result) {
      finishes.push(result)
    },
    release() {
      releases += 1
    },
  }
  return {
    releaseLookup,
    root,
    runtime,
    output,
    feedback,
    starts,
    finishes,
    releases: () => releases,
    configure: (value: Record<string, unknown>) =>
      writeFile(join(root, "scenario.json"), JSON.stringify(value)),
    calls: async () =>
      (await readFile(join(root, "calls.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    prompts: async () =>
      (await readFile(join(root, "prompts.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
  }
}

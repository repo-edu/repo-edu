import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { TestContext } from "node:test"
import { fileURLToPath } from "node:url"
import type { AssistantRuntime } from "../assistant.js"
import type { Feedback, PhaseOutput } from "../feedback.js"
import type { Assistant, PhaseInput, PhaseResult } from "../phase.js"

export const fixtureRoot = fileURLToPath(new URL("fixtures/", import.meta.url))
export const recorded = async (name: string) =>
  readFile(join(fixtureRoot, name), "utf8")
export const finishedText =
  'Résumé complete\nPHASE RESULT: {"status":"finished","file":null,"reason":null}'

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
  const root = await mkdtemp(join(tmpdir(), "audit-round-test-"))
  t.after(() => rm(root, { recursive: true, force: true }))
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
  const runtime: AssistantRuntime = {
    cwd: root,
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
  }
}

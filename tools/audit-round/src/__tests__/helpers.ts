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
import type { Feedback, PhaseOutput } from "../feedback.js"
import {
  type Assistant,
  type PhaseInput,
  type PhaseResult,
  phaseSkills,
} from "../phase.js"
import type { RoundContext, RoundKind } from "../target.js"

export function testContext(
  repoEduRoot: string,
): RoundContext & { readonly roundKind: "implementation" }
export function testContext<K extends RoundKind>(
  repoEduRoot: string,
  roundKind: K,
): RoundContext & { readonly roundKind: K }
export function testContext(
  repoEduRoot: string,
  roundKind: RoundKind = "implementation",
): RoundContext {
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
  claude: {
    configured: { model: "claude-opus-5", effort: "xhigh" },
    releases: new Map([["opus", "claude-opus-5"]]),
  },
  codex: {
    configured: { model: "gpt-6-astra", effort: "high" },
    releases: new Map<string, string>(),
  },
}
export const recorded = async (name: string) =>
  readFile(join(fixtureRoot, name), "utf8")
export const finishedText =
  'Résumé complete\nPHASE RESULT: {"status":"finished","reason":null}'

export async function writePhaseInstructions(
  repoEduRoot: string,
  planRoot: string,
) {
  for (const root of [repoEduRoot, planRoot]) {
    for (const [phase, name] of Object.entries(phaseSkills)) {
      const skill = join(root, ".agents/skills", name)
      await mkdir(join(skill, "references"), { recursive: true })
      await writeFile(
        join(skill, "references/workflow.md"),
        `---\nreads: []\n---\n\n${phase} workflow\n`,
      )
    }
  }
  await mkdir(join(planRoot, "home/claude/commands"), { recursive: true })
  for (const phase of ["audit", "vet", "rebut", "fix"]) {
    const launcherSkill = join(planRoot, "home/agents/skills", phase)
    await mkdir(launcherSkill, { recursive: true })
    await writeFile(
      join(launcherSkill, "SKILL.md"),
      `Codex ${phase} launcher\n`,
    )
    await writeFile(
      join(planRoot, "home/claude/commands", `${phase}.md`),
      `Claude ${phase} launcher\n`,
    )
  }
}

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
  await writePhaseInstructions(root, join(directory, "plan"))
  await writeFile(join(root, "scenario.json"), JSON.stringify(scenario))
  const executable = (assistant: Assistant) => ({
    file: process.execPath,
    // The self-contained fixture uses Node's native type stripping. Loading
    // tsx for every simulated version, settings and phase call adds startup cost.
    args: [join(fixtureRoot, "process.ts"), root, assistant],
  })
  const runtime: AssistantRuntime & RoundContext = {
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

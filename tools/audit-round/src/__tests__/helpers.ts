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
import { execa } from "execa"
import type { AssistantRuntime } from "../assistant.js"
import {
  type Feedback,
  type ModelSelection,
  type PhaseOutput,
  type PhaseRecorder,
  selectionSchema,
} from "../feedback.js"
import {
  type Assistant,
  type AssistantTurnInput,
  type Effort,
  type PhaseControlResult,
  phaseSkills,
  type RoundFixer,
} from "../phase.js"
import type { RoundContext, RoundKind } from "../target.js"
import {
  capabilityTag,
  phaseSelection,
  pinned,
  releases,
  testFixer,
} from "./configured-runner.js"

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
  const evidenceRoot = join(repoEduRoot, "../plan-evidence")
  return {
    repoEduRoot,
    planRoot,
    activeRoot: join(planRoot, "active"),
    evidenceRoot,
    roundRoot: join(evidenceRoot, "active"),
    roundKind,
    cwd: roundKind === "planning" ? planRoot : repoEduRoot,
  }
}

/** A round setup on the fixture's default auditor, for tests that do not choose one. */
export function testSetup(repoEduRoot: string): TestSetup & {
  readonly roundKind: "implementation"
}
export function testSetup<K extends RoundKind>(
  repoEduRoot: string,
  roundKind: K,
): TestSetup & { readonly roundKind: K }
export function testSetup(
  repoEduRoot: string,
  roundKind: RoundKind = "implementation",
): TestSetup {
  return {
    ...testContext(repoEduRoot, roundKind),
    ...testFixer,
    auditor: "codex",
    auditorSelectionSource: "settings",
  }
}

type TestSetup = RoundContext &
  RoundFixer & {
    readonly auditor: "codex"
    readonly auditorSelectionSource: "settings"
  }

export const fixtureRoot = fileURLToPath(new URL("fixtures/", import.meta.url))

const running = new WeakMap<object, PhaseRecorder>()
/**
 * Drive one output's phases one after another, as a round runs every phase
 * but the vet: each call goes to the invocation started last.
 */
export function inTurn(output: { readonly phase: PhaseOutput }) {
  const recorder = (): PhaseRecorder => {
    const current = running.get(output)
    if (current === undefined) throw new Error("No phase has started")
    return current
  }
  return {
    start: async (input: AssistantTurnInput, prompt: string) => {
      running.set(output, await output.phase.start(input, prompt))
    },
    observe: (feedback: Feedback) => recorder().observe(feedback),
    finish: (result: PhaseControlResult) => recorder().finish(result),
    release: () => recorder().release(),
  }
}
export { releases }
export const recorded = async (name: string) =>
  readFile(join(fixtureRoot, name), "utf8")

const recordedEvents = async (name: string) =>
  (await recorded(name))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))

/**
 * The model and effort each recorded session reports, which a round's record
 * carries whatever its settings asked for. Reading them from the recordings
 * keeps every expectation true after the contract is re-recorded under
 * another CLI configuration.
 */
export const recordedSelections: Record<Assistant, ModelSelection> = {
  claude: selectionSchema.parse(
    (await recordedEvents("claude.jsonl")).find(
      (event) => event.type === "control_response",
    )?.response.response.applied,
  ),
  codex: selectionSchema.parse(
    (await recordedEvents("codex-rollout.jsonl")).find(
      (event) => event.type === "turn_context",
    )?.payload,
  ),
}

/** The model line a record carries for the phases a recorded session ran. */
export function recordedText(assistant: Assistant): string {
  const { model, effort } = recordedSelections[assistant]
  return `${model} ${effort}`
}

/** The round fixture's stamp before the Codex fix starts. */
export function recordedFixStamp(auditor: Assistant, rebuttal = true): string {
  const fix = "gpt-5.6-sol high"
  const audit = recordedText(auditor)
  const vet = recordedText("claude")
  const time = rebuttal ? "Audit, vet and rebuttal" : "Audit and vet"
  const auditRoles = rebuttal ? "audit, rebut" : "audit"
  if (auditor === "claude") {
    const roles = rebuttal ? "audit, vet, rebut" : "audit, vet"
    return `${roles}: ${audit}\nfix: ${fix}\n${time} took 0 min.`
  }
  if (audit === fix)
    return `${auditRoles}, fix: ${fix}\nvet: ${vet}\n${time} took 0 min.`
  return `${auditRoles}: ${audit}\nvet: ${vet}\nfix: ${fix}\n${time} took 0 min.`
}

/** Worker tests pin the ready assignment independently of the latest recording. */
export async function codexWorkerUsage(): Promise<string> {
  const events = await recordedEvents("codex-rollout.jsonl")
  for (const event of events)
    if (event.type === "turn_context")
      event.payload = { model: "gpt-5.6-sol", effort: "xhigh" }
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`
}

/** The selection a phase on the assistant's default runs on, with Claude's alias resolved. */
export const resolved = (assistant: Assistant) =>
  phaseSelection(pinned(assistant), releases[assistant])

/** The capability tag the recorded session's audit stamps under the test settings. */
export function recordedTag(assistant: Assistant): string {
  const { model, effort } = recordedSelections[assistant]
  if (effort === null) throw new Error(`${assistant} recording names no effort`)
  const source = "recording"
  return capabilityTag(
    {
      phase: "audit",
      assistant,
      model: {
        model: { value: model, source },
        effort: { value: effort as Effort, source },
      },
    },
    new Map(),
  )
}
export const finishedPhase = {
  status: "finished",
  reason: null,
  closingNote: "Résumé complete",
} as const
export const finishedFix = { ...finishedPhase, settling: null }

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
}

export async function phaseStream(
  assistant: Assistant,
  final: string | object,
  sessionId = "test-session",
  recording: string = assistant,
): Promise<string> {
  const events = (await recorded(`${recording}.jsonl`))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  const lastResult = events.findLast((event) =>
    assistant === "claude"
      ? event.type === "result" && event.num_turns > 0
      : event.type === "item.completed" && event.item.type === "agent_message",
  )
  const lines = events
    .map((event) => {
      if (event.session_id !== undefined) event.session_id = sessionId
      if (event.type === "thread.started") event.thread_id = sessionId
      if (event.type === "result") {
        delete event.structured_output
        if (typeof final === "string") event.result = final
        else if (event === lastResult) event.structured_output = final
      }
      if (event.type === "assistant" && typeof final === "string")
        for (const block of event.message.content)
          if (block.type === "text") block.text = final
      if (
        assistant === "codex" &&
        event.type === "item.completed" &&
        event.item.type === "agent_message"
      ) {
        if (event === lastResult)
          event.item.text =
            typeof final === "string" ? final : JSON.stringify(final)
        else if (
          typeof final === "string" ||
          "report" in final ||
          "result" in final
        )
          event.item.text = "The session is working."
      }
      return JSON.stringify(event)
    })
    .join("\n")
  return `${lines}\n`
}

/**
 * The skip reason for tests that wait on a ruling socket. The ruling wait
 * listens on a socket file, which Windows does not serve, and the tool targets
 * macOS and Linux.
 */
export const socketRequirement =
  process.platform === "win32" ? "Ruling sockets need macOS or Linux" : false

/**
 * A short cache root, as the real one under the home folder is: the macOS
 * temporary folder alone would push a ruling socket past its 103-byte limit.
 */
export async function shortCacheRoot(t: TestContext): Promise<string> {
  const root = await realpath(await mkdtemp("/tmp/audit-round-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

/**
 * Make the evidence checkout a Git repository, as the real one is, so every
 * command that writes a round file commits it there.
 */
export async function evidenceRepository(root: string): Promise<void> {
  await execa("git", ["init", "--quiet"], { cwd: root })
  for (const [key, value] of Object.entries({
    "user.name": "Test",
    "user.email": "test@example.test",
    "commit.gpgsign": "false",
    // Finish Git's maintenance before test cleanup removes the repository.
    "maintenance.autoDetach": "false",
  }))
    await execa("git", ["config", key, value], { cwd: root })
}

/** The evidence checkout's commit subjects, newest first. */
export async function evidenceSubjects(root: string): Promise<string[]> {
  const { stdout, exitCode } = await execa("git", ["log", "--format=%s"], {
    cwd: root,
    reject: false,
  })
  return exitCode === 0 && stdout.length > 0 ? stdout.split("\n") : []
}

/** The evidence checkout's uncommitted paths, as `git status` lists them. */
export async function evidencePending(root: string): Promise<string[]> {
  const { stdout } = await execa(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: root },
  )
  return stdout.length === 0 ? [] : stdout.split("\n")
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
  await mkdir(join(directory, "plan/active"), { recursive: true })
  await mkdir(join(directory, "plan-evidence/active"), { recursive: true })
  await evidenceRepository(join(directory, "plan-evidence"))
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
  const starts: { input: AssistantTurnInput; prompt: string }[] = []
  const finishes: PhaseControlResult[] = []
  let releases = 0
  const output: PhaseOutput = {
    async start(input, prompt) {
      starts.push({ input, prompt })
      return {
        async observe(event) {
          feedback.push(event)
        },
        async finish(result) {
          finishes.push(result)
          return {
            compactions: feedback.filter((event) => event.type === "compaction")
              .length,
          }
        },
        release() {
          releases += 1
        },
      }
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
